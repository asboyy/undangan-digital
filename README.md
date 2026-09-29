# Consent Camera + Location

Demo website yang meminta persetujuan pengguna sebelum menggunakan kamera depan dan GPS.

## 1. Persyaratan
- Node.js 18+
- Browser yang mendukung Camera + Geolocation
- HTTPS saat dipakai dari HP melalui domain publik

## 2. Install
```bash
npm install
```

## 3. Jalankan
Linux/macOS:
```bash
ADMIN_TOKEN="ganti-dengan-token-rahasia" npm start
```

Windows PowerShell:
```powershell
$env:ADMIN_TOKEN="ganti-dengan-token-rahasia"
npm start
```

Buka:
- Halaman pengguna: `http://localhost:3000/`
- Dashboard: `http://localhost:3000/admin.html`

## 4. Untuk HP
Camera dan geolocation umumnya membutuhkan secure context (HTTPS). Untuk pengujian lokal, `localhost` biasanya diperlakukan sebagai secure context. Untuk penggunaan dari HP melalui internet, deploy menggunakan HTTPS.

## 5. Keamanan
- Ganti ADMIN_TOKEN dengan token acak yang panjang.
- Jangan membagikan token admin.
- Data foto dan koordinat adalah data sensitif; simpan hanya dengan persetujuan dan lindungi akses dashboard.
- Contoh ini belum memiliki akun/password admin. Untuk produksi, tambahkan autentikasi yang proper, rate limiting, CSRF protection, dan kebijakan retensi data.
