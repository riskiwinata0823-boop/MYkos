# MYkos

Aplikasi pencarian kos sekitar Polinela dengan asisten AI. Frontend disajikan oleh server Node.js yang juga menyediakan autentikasi token dan proxy chat P10.

## Jalankan lokal

1. Pastikan Node.js versi 22 atau lebih baru tersedia.
2. Jalankan `start_mykos.bat`.
3. Masukkan API key OmniRoute pada prompt server, bukan di berkas HTML atau JavaScript.
4. Buka `http://127.0.0.1:3100/`.
5. Masuk dengan akun latihan API P10. Token hanya disimpan selama halaman terbuka.

## Publikasikan ke Render

1. Buat repository GitHub untuk project ini dan unggah file aplikasi. Jangan unggah API key, kata sandi, atau berkas `.env`.
2. Di Render, pilih **New > Blueprint** dan sambungkan repository. Render membaca pengaturan dari `render.yaml`.
3. Pada Environment service, isi `OMNIROUTE_API_KEY` dengan key praktikum.
4. Isi `MYKOS_ACCOUNTS_JSON` dengan akun yang akan digunakan untuk masuk. Contoh format (ganti nilai contoh dengan kredensial unik dan kuat):

   ```json
   [{"nama":"akun-kamu","sandi":"Ganti-Dengan-Sandi-Kuat-12","peran":"penanya","scopes":["models","chat"]}]
   ```

5. `MYKOS_TOKEN_SECRET` dibuat otomatis oleh Render. Jangan bagikan nilainya.
6. Tunggu deploy sehat, lalu buka URL `onrender.com` yang ditampilkan Render.

Server publik hanya menerima host Render yang dikonfigurasi, menggunakan HTTPS dari Render, membatasi chat dan login, serta tidak menyediakan akun latihan P10 bawaan. API key OmniRoute hanya berada di environment server. Simpan URL publik dan kredensial login dengan aman.

Paket Free Render dapat menghentikan service setelah tidak aktif; kunjungan pertama setelah tidur bisa memerlukan waktu untuk menyalakan kembali. Data daftar kos pada aplikasi ini masih berupa contoh.
