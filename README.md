# ZDNCH BELAJAR CBT

Aplikasi CBT dan modul latihan pribadi berbasis Node.js, Express, InsForge PostgreSQL, InsForge Storage, HTML/CSS/JavaScript murni, dan MathJax CDN.

Tidak ada integrasi AI, API AI, atau logika berbasis AI di dalam aplikasi. Database tidak berisi dummy data atau seeder.

## Fitur Utama

- UI penuh Bahasa Indonesia.
- Backend Express stateless, siap deploy ke Dokploy.
- Database memakai InsForge PostgreSQL.
- Gambar memakai InsForge Storage, bukan folder upload lokal.
- Soal, opsi, pembahasan, flashcard, Adu Kata, dan Fill-in-the-Blank mendukung LaTeX MathJax dan tag HTML gambar.
- Input soal manual, bulk JSON, preview ujian, simulasi CBT 2 kolom, timer, navigasi warna, skor `+4/-1/0`, dan hasil pembahasan.
- Modul tambahan: Flashcard, Adu Kata, dan Fill-in-the-Blank.

## Kebutuhan Lokal

- Node.js 20 disarankan.
- npm.
- Akun/proyek InsForge.

## Setup InsForge

Login dan link project memakai CLI InsForge. Jangan simpan user API key di repository.

```bash
npx @insforge/cli login --user-api-key <INSFORGE_USER_API_KEY>
npx @insforge/cli link --project-id 99688844-c482-443e-b7c8-08b217610538
```

Buat tabel kosong dengan menjalankan SQL di:

```text
scripts/insforge-schema.sql
```

File tersebut hanya membuat tabel. Tidak ada insert dummy data.

Pastikan bucket storage dengan nama berikut tersedia di InsForge:

```text
uploads
```

Nama bucket bisa diganti lewat `INSFORGE_STORAGE_BUCKET`.

## Environment Variable

Salin contoh env untuk lokal:

```bash
copy .env.example .env
```

Isi nilai rahasia secara lokal saja. Jangan commit `.env`.

```env
NODE_ENV=production
PORT=3000
INSFORGE_BASE_URL=https://acfzi5wy.ap-southeast.insforge.app
INSFORGE_ANON_KEY=
INSFORGE_STORAGE_BUCKET=uploads
DOKPLOY_ADMIN_TOKEN=
```

Keterangan:

- `INSFORGE_BASE_URL`: base URL backend InsForge.
- `INSFORGE_ANON_KEY`: anon key dari dashboard/project InsForge.
- `INSFORGE_STORAGE_BUCKET`: bucket untuk gambar.
- `DOKPLOY_ADMIN_TOKEN`: token admin Dokploy untuk utilitas API internal. Isi manual di server, jangan hardcode.

## Instalasi Lokal

```bash
npm install
npm start
```

Buka:

- Beranda: `http://localhost:3000`
- Input Soal: `http://localhost:3000/input-soal`
- Mulai Simulasi: `http://localhost:3000/simulasi`
- Flashcard: `http://localhost:3000/flashcard`
- Adu Kata: `http://localhost:3000/adu-kata`
- Fill-in-the-Blank: `http://localhost:3000/fill-blank`

## Upload Gambar

Di halaman `Input Soal`, gunakan panel `Upload Gambar ke InsForge`.

Aplikasi akan menghasilkan tag seperti:

```html
<img src="https://..." alt="">
```

Tempel tag tersebut ke teks soal, opsi jawaban, pembahasan, flashcard, Adu Kata, atau Fill-in-the-Blank.

## Deploy ke GitHub

Pastikan `.env` tidak ikut commit:

```bash
git status --ignored
```

Perintah awal dari project lokal ke GitHub:

```bash
git init
git branch -M main
git add .
git status
git commit -m "Initial ZDNCH BELAJAR CBT app"
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

Jika repository sudah pernah di-init, mulai dari `git add .`.

## Deploy ke Dokploy

1. Buat aplikasi baru di Dokploy dari repository GitHub.
2. Pilih mode build dari `Dockerfile`.
3. Set port aplikasi ke `3000`.
4. Isi environment variables secara manual:

```env
NODE_ENV=production
PORT=3000
INSFORGE_BASE_URL=https://acfzi5wy.ap-southeast.insforge.app
INSFORGE_ANON_KEY=<isi dari InsForge>
INSFORGE_STORAGE_BUCKET=uploads
DOKPLOY_ADMIN_TOKEN=<isi token admin Dokploy>
```

5. Deploy.

Jangan memasukkan token atau isi `.env` ke GitHub.

## Docker

Build lokal:

```bash
docker build -t zdnch-belajar-cbt .
```

Run lokal:

```bash
docker run --env-file .env -p 3000:3000 zdnch-belajar-cbt
```

## Utilitas API Dokploy

Boilerplate tersedia di:

```text
utils/dokployService.js
```

Fungsi yang tersedia:

- `getSystemHealth()`: GET `/settings.health`
- `restartDockerContainer(containerId)`: POST `/docker.restartContainer`

Token selalu dibaca dari `process.env.DOKPLOY_ADMIN_TOKEN`.
