# Crashless Web

Dashboard admin untuk laporan kerusakan jalan: antrean, peta, bukti perbaikan, dan verifikasi.

## Syarat

- Node.js 18+, npm 9+
- Project Supabase dengan migrasi di `supabase/migrations/` sudah dijalankan

## Jalan cepat

```bash
npm install
cp .env.example .env
npm run dev
```

Isi `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Buka `http://localhost:5173`, masuk dengan akun admin yang emailnya terverifikasi.

## Perintah

```bash
npm run dev      # server dev
npm run build    # build produksi ke dist/
npm run preview  # pratinjau hasil build
npm run lint     # cek ESLint
```

## Keamanan env

- Jangan commit file `.env` dalam bentuk apa pun.
- Jangan pakai service-role key di browser. Kalau key istimewa pernah masuk ke `VITE_SUPABASE_ANON_KEY`, rotasi di Supabase lalu ganti dengan anon key.
- Script `npm run user:role -- <email> <user|admin>` hanya untuk shell tepercaya. Key diambil dari `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`, lalu kosongkan variabelnya setelah selesai.
