import { createServer as createHttpServer } from 'node:http';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://omni.ib-center.com';
const MODEL = 'bansos.v1.prodi.mi';
const MAX_BODY = 4096;
const CHAT_LIMIT = 10;
// Batas panjang jawaban (dalam token, sekitar 0,75 kata per token). Bila model berhenti karena batas ini, respons membawa terpotong: true.
const CHAT_MAX_TOKENS = 600;
const CHAT_TIMEOUT_MS = 60_000;
const WINDOW_MS = 60_000;
const TOKEN_TTL_MS = 15 * 60_000;
const LOGIN_MAX_FAIL = 5;
const LOGIN_LOCK_MS = 60_000;

// Akun latihan lokal. Kata sandi ini hanya untuk praktikum di komputer sendiri, bukan rahasia dan bukan akun OmniRoute.
const DEMO_ACCOUNTS = [
  { nama: 'peter', sandi: 'Spider-2026!', peran: 'pembaca', scopes: ['models'] },
  { nama: 'tony', sandi: 'Ironman-2026!', peran: 'penanya', scopes: ['models', 'chat'] },
];

// Instruksi sistem dikirim backend pada setiap pertanyaan, bukan dari browser. Isinya persona praktikum: combo bansos.v1.prodi.mi di OmniRoute hanyalah
// router ke beberapa model, jadi identitas, tanggal, dan fakta terkini harus diberikan di sini. FAKTA_TERKINI dan PERSONA dirawat dosen.
const FAKTA_TERKINI = [
  'Presiden Republik Indonesia: Prabowo Subianto (dilantik 20 Oktober 2024).',
  'Wakil Presiden Republik Indonesia: Gibran Rakabuming Raka.',
];
export function systemPrompt(nowMs = Date.now()) {
  const tanggal = new Date(nowMs).toLocaleDateString('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' });
  return [
    `Anda adalah "${MODEL}" (dibaca: bansos v1), model AI baru yang dikembangkan oleh Program Studi D-III Manajemen Informatika (Prodi MI) Politeknik Negeri Lampung sebagai sarana belajar mahasiswa.`,
    'Pengembang Anda adalah ComX, dosen di Prodi MI. Bila ditanya siapa pengembang atau pembuat Anda, jawab bahwa pengembang Anda adalah ComX, dosen di Prodi MI.',
    'Anda masih pada tahap awal pengembangan dan merupakan model kelas dasar (low tier): kemampuan Anda terbatas dan Anda bisa keliru, jadi mahasiswa perlu memeriksa jawaban Anda.',
    'Prodi MI juga sedang menyiapkan model kedua bernama "Meta.v1": model unggulan (flagship) yang paling canggih saat ini, tetapi belum dirilis. Misi keduanya: membawa AI gratis (free AI) ke lingkungan mahasiswa Prodi MI.',
    'Bila ditanya tentang Meta.v1, ceritakan dengan antusias, tetapi jangan mengarang spesifikasi teknis, tanggal rilis, atau fitur.',
    `Jangan memperkenalkan diri dan jangan menyinggung identitas, pengembang, atau Meta.v1 bila pengguna tidak menanyakannya: jawab saja pertanyaan pengguna secara langsung, tanpa kata pembuka tentang siapa Anda.`,
    `Hanya bila ditanya siapa Anda, model apa Anda, siapa pengembang Anda, atau tentang Meta.v1, jawab sebagai ${MODEL} beserta gambaran di atas. Berkepribadian ramah dan bersemangat.`,
    'Jangan menyebut nama model atau penyedia di balik layar bila tidak ditanya. Namun bila pengguna bertanya sungguh-sungguh tentang teknologi di baliknya, atau apakah Anda dilatih sendiri dari nol, jangan berbohong: akui bahwa Anda adalah asisten AI yang dilayani lewat OmniRoute dan persona ini adalah bagian dari praktikum Pemrograman API.',
    'Di aplikasi MYkos, bantu pengguna membandingkan kos dengan ramah. Gunakan hanya data kos contoh yang ada pada pertanyaan; jangan mengarang alamat, ketersediaan, keamanan, atau fasilitas. Ingatkan pengguna untuk mengonfirmasi harga dan detail langsung kepada pemilik.',
    `Tanggal hari ini: ${tanggal}.`,
    'Pengetahuan Anda dapat tertinggal dari kenyataan. Untuk hal yang berubah (jabatan, berita, harga), pakai fakta terkini berikut dan abaikan ingatan Anda yang bertentangan:',
    ...FAKTA_TERKINI.map((fakta) => `- ${fakta}`),
    'Bila hal yang ditanyakan tidak ada pada daftar itu, katakan bahwa informasinya mungkin sudah berubah dan sarankan memeriksa sumber resmi.',
    'Jawab dalam bahasa Indonesia secara ringkas.',
  ].join('\n');
}

const b64 = (value) => Buffer.from(value).toString('base64url');
const hashPassword = (plain, salt) => scryptSync(plain, salt, 64);

function send(res, status, payload, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(payload));
}
const fail = (res, status, code, message, extra) => send(res, status, { error: { code, message } }, extra);

// Token mirip JWT: dua bagian "isi.tandatangan". Isi hanya disandikan (bisa dibaca siapa saja); tanda tangan HMAC
// dihitung dengan rahasia server sehingga isi yang diubah klien akan ketahuan.
export function issueToken(secret, claims) {
  const body = b64(JSON.stringify(claims));
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function readToken(secret, token, nowMs) {
  const [body, sig, extra] = String(token).split('.');
  if (!body || !sig || extra !== undefined) return { ok: false, code: 'TOKEN_TIDAK_VALID' };
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: 'TOKEN_TIDAK_VALID' };
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return { ok: false, code: 'TOKEN_TIDAK_VALID' }; }
  if (!(claims.exp > nowMs)) return { ok: false, code: 'TOKEN_KEDALUWARSA' };
  return { ok: true, claims };
}

export function createServer({ apiKey, secret = randomBytes(32), accounts: configuredAccounts = DEMO_ACCOUNTS, fetchImpl = fetch, baseUrl = BASE_URL, now = Date.now } = {}) {
  if (!apiKey) throw new Error('OMNIROUTE_API_KEY belum diatur.');
  const accounts = configuredAccounts.map(({ sandi, ...rest }) => {
    const salt = randomBytes(16);
    return { ...rest, salt, hash: hashPassword(sandi, salt) };
  });
  const dummySalt = randomBytes(16);
  const dummyHash = hashPassword('tidak-dipakai', dummySalt);
  const failures = new Map();
  let windowStart = now();
  let counts = { models: 0, chat: 0 };

  const takeQuota = (kind) => {
    if (now() - windowStart >= WINDOW_MS) { windowStart = now(); counts = { models: 0, chat: 0 }; }
    if (counts[kind] >= CHAT_LIMIT) return false;
    counts[kind]++;
    return true;
  };

  const readJson = async (req) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > MAX_BODY) return { status: 413 };
    }
    try { return { value: JSON.parse(body) }; } catch { return { status: 400 }; }
  };

  // Penjaga (middleware): 401 bila identitas tidak terbukti, 403 bila terbukti tetapi hak tidak cukup.
  const guard = (req, res, scope) => {
    const header = req.headers.authorization;
    if (!header) { fail(res, 401, 'TOKEN_KOSONG', 'Kirim header Authorization: Bearer <token>.', { 'WWW-Authenticate': 'Bearer' }); return null; }
    const match = /^Bearer (\S+)$/.exec(header);
    if (!match) { fail(res, 401, 'FORMAT_SALAH', 'Format header harus: Authorization: Bearer <token>.', { 'WWW-Authenticate': 'Bearer' }); return null; }
    const result = readToken(secret, match[1], now());
    if (!result.ok) { fail(res, 401, result.code, result.code === 'TOKEN_KEDALUWARSA' ? 'Token sudah kedaluwarsa. Masuk lagi.' : 'Token tidak valid.', { 'WWW-Authenticate': 'Bearer' }); return null; }
    if (scope && !result.claims.scopes.includes(scope)) { fail(res, 403, 'HAK_TIDAK_CUKUP', `Peran ${result.claims.peran} tidak boleh memakai fitur ${scope}.`); return null; }
    return result.claims;
  };

  const login = async (req, res) => {
    if (!req.headers['content-type']?.startsWith('application/json')) return fail(res, 415, 'TIPE_KONTEN', 'Gunakan Content-Type application/json.');
    const parsed = await readJson(req);
    if (parsed.status === 413) return fail(res, 413, 'TERLALU_BESAR', 'Isi permintaan terlalu besar.');
    if (parsed.status === 400) return fail(res, 400, 'JSON_RUSAK', 'JSON tidak valid.');
    const { nama, sandi } = parsed.value ?? {};
    if (typeof nama !== 'string' || typeof sandi !== 'string' || !nama || !sandi || nama.length > 40 || sandi.length > 100) {
      return fail(res, 422, 'DATA_TIDAK_VALID', 'Isi nama dan sandi (teks, tidak kosong).');
    }
    const key = nama.toLowerCase();
    const state = failures.get(key);
    if (state && state.until > now()) return fail(res, 429, 'AKUN_TERKUNCI', 'Terlalu banyak percobaan gagal. Coba lagi sebentar lagi.', { 'Retry-After': String(Math.ceil((state.until - now()) / 1000)) });
    const account = accounts.find((a) => a.nama === key);
    const candidate = hashPassword(sandi, account ? account.salt : dummySalt);
    const same = timingSafeEqual(candidate, account ? account.hash : dummyHash);
    if (!account || !same) {
      const count = (state?.count ?? 0) + 1;
      failures.set(key, { count, until: count >= LOGIN_MAX_FAIL ? now() + LOGIN_LOCK_MS : 0 });
      return fail(res, 401, 'KREDENSIAL_SALAH', 'Nama atau kata sandi salah.');
    }
    failures.delete(key);
    const claims = { sub: account.nama, peran: account.peran, scopes: account.scopes, iat: now(), exp: now() + TOKEN_TTL_MS };
    return send(res, 200, { token: issueToken(secret, claims), tipe: 'Bearer', berlaku_detik: TOKEN_TTL_MS / 1000, peran: account.peran });
  };

  const upstreamError = (res, status) => fail(res, status, 'LAYANAN_AI', `OmniRoute mengembalikan HTTP ${status}`);
  const port = Number(process.env.PORT) || 3100;
  const publicDeployment = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  const publicOrigin = process.env.MYKOS_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || '';
  const publicHost = process.env.MYKOS_PUBLIC_HOST ||
    (process.env.MYKOS_PUBLIC_ORIGIN ? new URL(process.env.MYKOS_PUBLIC_ORIGIN).host : '') ||
    process.env.RENDER_EXTERNAL_HOSTNAME ||
    (publicOrigin ? new URL(publicOrigin).host : '');
  if (publicDeployment && !publicHost) throw new Error('Atur MYKOS_PUBLIC_HOST atau MYKOS_PUBLIC_ORIGIN untuk deployment publik.');
  const allowedHosts = new Set(publicDeployment
    ? [publicHost]
    : [`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set(publicDeployment
    ? [publicOrigin, process.env.MYKOS_PUBLIC_ORIGIN || ''].filter(Boolean)
    : [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  return createHttpServer(async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host) ||
          (req.headers.origin && !allowedOrigins.has(req.headers.origin)) ||
          req.headers['sec-fetch-site'] === 'cross-site') {
        return fail(res, 403, 'ASAL_DITOLAK', 'Asal permintaan tidak diizinkan.');
      }
      if (req.method === 'GET' && req.url === '/healthz') {
        return send(res, 200, { status: 'ok' });
      }
      if (req.method === 'GET' && req.url === '/') {
        const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https://images.unsplash.com; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" };
        if (publicDeployment) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        res.writeHead(200, headers);
        res.end(await readFile(new URL('./indec.html', import.meta.url)));
        return;
      }
      const staticFiles = {
        '/styles.css': { file: './styles.css', type: 'text/css; charset=utf-8' },
        '/app.js': { file: './app.js', type: 'text/javascript; charset=utf-8' },
      };
      if (req.method === 'GET' && staticFiles[req.url]) {
        const asset = staticFiles[req.url];
        res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(await readFile(new URL(asset.file, import.meta.url)));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/masuk') return login(req, res);
      if (req.method === 'GET' && req.url === '/api/saya') {
        const claims = guard(req, res);
        if (claims) send(res, 200, { nama: claims.sub, peran: claims.peran, scopes: claims.scopes, kedaluwarsa: new Date(claims.exp).toISOString() });
        return;
      }
      if (req.method === 'GET' && req.url === '/api/models') {
        if (!guard(req, res, 'models')) return;
        if (!takeQuota('models')) return fail(res, 429, 'BATAS_PERMINTAAN', 'Batas daftar model per menit tercapai. Tunggu sebentar.');
        const response = await fetchImpl(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) return upstreamError(res, response.status);
        return send(res, 200, await response.json());
      }
      if (req.method === 'POST' && req.url === '/api/chat') {
        if (!guard(req, res, 'chat')) return;
        if (!req.headers['content-type']?.startsWith('application/json')) return fail(res, 415, 'TIPE_KONTEN', 'Gunakan Content-Type application/json.');
        const parsed = await readJson(req);
        if (parsed.status === 413) return fail(res, 413, 'TERLALU_BESAR', 'Pertanyaan terlalu panjang.');
        if (parsed.status === 400) return fail(res, 400, 'JSON_RUSAK', 'JSON tidak valid.');
        const question = parsed.value?.question;
        if (typeof question !== 'string' || !question.trim()) return fail(res, 422, 'DATA_TIDAK_VALID', 'Isi pertanyaan dahulu.');
        if (question.length > 1000) return fail(res, 413, 'TERLALU_BESAR', 'Pertanyaan maksimal 1000 karakter.');
        if (!takeQuota('chat')) return fail(res, 429, 'BATAS_PERMINTAAN', 'Batas 10 pertanyaan per menit tercapai. Tunggu sebentar.');
        const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: systemPrompt(now()) }, { role: 'user', content: question.trim() }], max_tokens: CHAT_MAX_TOKENS, stream: false }),
          signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        });
        if (!response.ok) return upstreamError(res, response.status);
        const data = await response.json();
        const choice = data.choices?.[0];
        return send(res, 200, { answer: choice?.message?.content ?? 'Tidak ada teks jawaban.', ...(choice?.finish_reason === 'length' ? { terpotong: true } : {}) });
      }
      fail(res, 404, 'TIDAK_ADA', 'Halaman tidak ditemukan.');
    } catch {
      fail(res, 502, 'LAYANAN_AI', 'Gagal menghubungi OmniRoute. Periksa koneksi atau coba lagi.');
    }
  });
}

// Nyalakan server hanya bila berkas ini yang dijalankan. Dibandingkan lewat jalur asli (realpath) supaya folder alias
// (junction, symlink, OneDrive) tidak membuat `node server.mjs` keluar diam-diam tanpa pesan.
const isMain = (() => {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const publicDeployment = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  let accounts = DEMO_ACCOUNTS;
  let secret = process.env.MYKOS_TOKEN_SECRET;
  if (publicDeployment) {
    if (!secret || secret.length < 32) throw new Error('MYKOS_TOKEN_SECRET harus diatur dengan minimal 32 karakter.');
    try {
      accounts = JSON.parse(process.env.MYKOS_ACCOUNTS_JSON || '');
    } catch {
      throw new Error('MYKOS_ACCOUNTS_JSON harus berisi JSON akun yang valid.');
    }
    if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 25) {
      throw new Error('MYKOS_ACCOUNTS_JSON harus berisi 1 sampai 25 akun.');
    }
    const usernames = new Set();
    for (const account of accounts) {
      if (!account || typeof account.nama !== 'string' || account.nama.length < 1 || account.nama.length > 40 ||
          typeof account.sandi !== 'string' || account.sandi.length < 12 || account.sandi.length > 100 ||
          typeof account.peran !== 'string' || !Array.isArray(account.scopes) ||
          account.scopes.some((scope) => !['models', 'chat'].includes(scope)) ||
          usernames.has(account.nama.toLowerCase())) {
        throw new Error('Setiap akun publik harus punya nama unik, sandi 12-100 karakter, peran, dan scopes models/chat yang valid.');
      }
      usernames.add(account.nama.toLowerCase());
    }
  }
  const port = Number(process.env.PORT) || 3100;
  const host = publicDeployment ? '0.0.0.0' : '127.0.0.1';
  createServer({
    apiKey: process.env.OMNIROUTE_API_KEY,
    secret: secret || randomBytes(32),
    accounts,
  }).listen(port, host, () => {
    process.stdout.write(`MYkos berjalan di ${publicDeployment ? (process.env.RENDER_EXTERNAL_URL || `port ${port}`) : `http://127.0.0.1:${port}`}\n`);
  });
}
