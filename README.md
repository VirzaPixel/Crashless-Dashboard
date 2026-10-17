# Crashless Web

Dashboard operasional untuk pengelolaan laporan kerusakan jalan: antrean, peta sebaran, dokumentasi perbaikan, dan verifikasi bukti.

## Prasyarat

- Node.js 18+ dan npm 9+
- Proyek Supabase dengan seluruh migrasi di `supabase/migrations/` telah dijalankan

## Persiapan Awal

```bash
npm install
cp .env.example .env
npm run dev
```

Isi `.env` dengan kredensial proyek Supabase:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Akses `http://localhost:5173` dan masuk menggunakan akun operator yang telah aktif.

## Perintah

```bash
npm run dev      # Menjalankan server pengembangan
npm run build    # Kompilasi produksi ke dist/
npm run preview  # Pratinjau hasil kompilasi
npm run lint     # Pemeriksaan ESLint
```

## Keamanan Konfigurasi

- Jangan menyertakan file `.env` dalam commit dalam bentuk apa pun.
- Jangan menggunakan service-role key di sisi browser. Apabila kunci istimewa pernah masuk ke `VITE_SUPABASE_ANON_KEY`, lakukan rotasi di Supabase lalu ganti dengan anon key.

## Inisialisasi Super Operator

1. Jalankan seluruh migrasi di `supabase/migrations/` melalui Supabase SQL Editor secara berurutan (001 hingga 008).
2. Jalankan `supabase/seeds/seed_superadmin.sql` di SQL Editor untuk membuat akun Super Operator awal.
3. Masuk ke dashboard web, lalu buka menu **Pengelolaan Akun** (`/operators`).
4. Tambah, ubah peran, atau nonaktifkan akun operator langsung dari halaman tersebut tanpa memerlukan akses terminal.

> **Catatan keamanan:** Segera ubah kata sandi akun seed setelah login pertama.

## Skrip CLI (Penggunaan Internal)

`npm run user:role -- <email> <superadmin|admin|user>` tersedia sebagai utilitas cadangan untuk lingkungan CI/CD atau pemulihan darurat yang memerlukan `SUPABASE_SERVICE_ROLE_KEY`. Penggunaan normal dilakukan sepenuhnya melalui dashboard.