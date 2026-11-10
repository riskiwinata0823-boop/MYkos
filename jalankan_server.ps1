# Menyalakan server latihan P10: meminta key praktikum lewat jendela, menjalankan server.mjs, lalu membuka browser.
# Key hanya diberikan ke proses server lewat variabel lingkungan; tidak ditulis ke berkas dan tidak ditampilkan.
# Dipanggil oleh 2_Jalankan_Server.bat. Bila OMNIROUTE_API_KEY sudah diatur di terminal, jendela isian dilewati.
# Berkas ini sengaja memakai karakter ASCII agar aman di Windows PowerShell 5.1.
param([switch]$TanpaBrowser)

$ErrorActionPreference = 'Stop'
$Port = 3100
$Url = "http://127.0.0.1:$Port/"
$OmniUrl = 'https://omni.ib-center.com'
$MaxPercobaan = 3
Set-Location -Path $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Tampil-Pesan([string]$teks, [string]$ikon = 'Warning') {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($teks, 'P10 Server', 'OK', $ikon)
}

# Jendela isian key: kolom bertopeng (karakter tidak terbaca), tombol Jalankan dan Batal.
function Buat-FormKey {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'P10 - Masukkan key praktikum'
  $f.ClientSize = New-Object System.Drawing.Size(440, 170)
  $f.StartPosition = 'CenterScreen'
  $f.FormBorderStyle = 'FixedDialog'
  $f.MaximizeBox = $false
  $f.MinimizeBox = $false
  $f.TopMost = $true

  $label = New-Object System.Windows.Forms.Label
  $label.Text = 'Masukkan key praktikum (sama seperti P09). Key hanya dipakai server di komputer ini selama jendela server terbuka dan tidak disimpan.'
  $label.Location = New-Object System.Drawing.Point(16, 14)
  $label.Size = New-Object System.Drawing.Size(408, 48)

  $box = New-Object System.Windows.Forms.TextBox
  $box.UseSystemPasswordChar = $true
  $box.Location = New-Object System.Drawing.Point(16, 72)
  $box.Size = New-Object System.Drawing.Size(408, 24)

  $ok = New-Object System.Windows.Forms.Button
  $ok.Text = 'Jalankan'
  $ok.Location = New-Object System.Drawing.Point(244, 120)
  $ok.Size = New-Object System.Drawing.Size(86, 30)
  $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK

  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = 'Batal'
  $cancel.Location = New-Object System.Drawing.Point(338, 120)
  $cancel.Size = New-Object System.Drawing.Size(86, 30)
  $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

  $f.Controls.AddRange(@($label, $box, $ok, $cancel))
  $f.AcceptButton = $ok
  $f.CancelButton = $cancel
  $f.Tag = $box
  return $f
}

function Minta-Key {
  $f = Buat-FormKey
  $hasil = $f.ShowDialog()
  $teks = $f.Tag.Text.Trim()
  $f.Dispose()
  if ($hasil -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($teks)) { return $null }
  return $teks
}

# Mengembalikan 'ok', 'ditolak' (401 atau 403), atau 'tak-terjangkau'.
function Cek-Key([string]$key) {
  try {
    [void](Invoke-WebRequest -Uri "$OmniUrl/v1/models" -Headers @{ Authorization = "Bearer $key" } -UseBasicParsing -TimeoutSec 15)
    return 'ok'
  } catch {
    $kode = 0
    if ($_.Exception.Response) { $kode = [int]$_.Exception.Response.StatusCode }
    if ($kode -eq 401 -or $kode -eq 403) { return 'ditolak' }
    return 'tak-terjangkau'
  }
}

function Main {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Tampil-Pesan "Node.js belum terpasang. Pasang Node.js 22 atau lebih baru dari https://nodejs.org, lalu klik Jalankan server lagi."
    return
  }
  $major = [int](((node --version) -replace '^v', '') -split '\.')[0]
  if ($major -lt 22) {
    Tampil-Pesan "Node.js Anda versi $major. Praktikum ini memerlukan versi 22 atau lebih baru (https://nodejs.org)."
    return
  }
  $listen = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($listen.Count -gt 0) {
    # Mengganti server.mjs tidak mengubah server yang sudah berjalan: kodenya sudah di memori. Beri tahu bila berkasnya lebih baru.
    $versiLama = $false
    try {
      $idProses = $listen[0].OwningProcess
      $proses = Get-CimInstance Win32_Process -Filter "ProcessId=$idProses"
      $versiLama = $proses.CreationDate -lt (Get-Item (Join-Path $PSScriptRoot 'server.mjs')).LastWriteTime
    } catch { $versiLama = $false }
    if ($versiLama) {
      Tampil-Pesan 'Server yang sedang berjalan memakai versi LAMA dari server.mjs (berkasnya diperbarui setelah server dinyalakan). Klik Matikan server, lalu Jalankan server lagi agar perubahan berlaku.'
    } else {
      Write-Host "Server sudah berjalan di $Url. Membuka browser."
    }
    if (-not $TanpaBrowser) { Start-Process $Url }
    return
  }

  $key = $env:OMNIROUTE_API_KEY
  if ([string]::IsNullOrWhiteSpace($key)) {
    for ($i = 1; $i -le $MaxPercobaan; $i++) {
      $key = Minta-Key
      if (-not $key) { Write-Host 'Dibatalkan. Klik Jalankan server lagi bila ingin mencoba.'; return }
      $status = Cek-Key $key
      if ($status -eq 'ditolak') {
        Tampil-Pesan "Key ditolak OmniRoute (401). Periksa lagi key praktikum Anda (percobaan $i dari $MaxPercobaan)."
        $key = $null
        continue
      }
      if ($status -eq 'tak-terjangkau') { Write-Host 'Peringatan: OmniRoute tidak terjangkau. Periksa koneksi internet; server tetap dinyalakan.' }
      break
    }
    if (-not $key) { Write-Host 'Key tidak diterima. Klik Jalankan server lagi untuk mengulang.'; return }
  }
  $env:OMNIROUTE_API_KEY = $key

  Write-Host '============================================================'
  Write-Host " Server praktikum berjalan di $Url"
  Write-Host ' Jangan tutup jendela ini selama praktikum.'
  Write-Host ' Untuk berhenti: tutup jendela ini atau tekan Ctrl+C.'
  Write-Host '============================================================'
  if (-not $TanpaBrowser) {
    Start-Process -FilePath cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & start `"`" $Url" -WindowStyle Hidden
  }
  & node server.mjs
}

# Dot-sourcing (. .\jalankan_server.ps1) hanya memuat fungsi, tanpa menjalankan server; dipakai untuk menguji.
if ($MyInvocation.InvocationName -ne '.') {
  try { Main } catch { Write-Host "Terjadi kesalahan: $($_.Exception.Message)"; exit 1 }
}
