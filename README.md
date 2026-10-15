# Aniki Manga Render

Tolong perbarui kode aplikasi video editing 'AUTO EDIT MANGA' dari file .zip ini. Fokus HANYA pada optimasi performa rendering agar HP tidak panas dan hasil video mulus.

Perbaikan Esensial:

Pindahkan ke GPU: Ubah rendering video patah-patah bawaan agar wajib menggunakan WebCodecs API (VideoEncoder/VideoDecoder) dan WebGL <canvas> untuk akselerasi hardware penuh via GPU Android. Jangan pakai loop CPU biasa.

Kompresi File HD: Setel kompresi video ekspor ke H.264 dengan metode CRF (Constant Rate Factor) di kisaran 23-26. Hasil harus tetap tajam di resolusi 720p - 1080p, tetapi ukuran file video akhirnya wajib sekecil mungkin.

Kerjakan optimasi ini tanpa mengubah fitur otomatisasi storyboard atau sinkronisasi suara yang sudah ada.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://aniki-manga-render.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6e40c8a5-d7a3-47e1-9b05-ca0ea4853398).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
