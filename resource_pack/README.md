# EXTREMESMP Resource Pack

## Quick Guide: Rank Glyph E8

Referensi template/tool:
- https://nhanaz.github.io/glyph/

## Atlas Itu Apa?

Atlas adalah satu file PNG besar yang berisi banyak ikon dalam grid.

- File rank atlas: `font/glyph_E8.png`
- Resolusi atlas: `1024x1024`
- Grid atlas: `16x16`
- Rumus ukuran cell: `ukuran atlas / 16`
- Ukuran 1 cell pada atlas ini: `64x64`

## Maksimal Ukuran Icon Rank

- Maksimal isi icon per slot glyph di atlas ini: `64x64`.
- Jadi, `64px` itu bisa.
- `128x128` per slot tidak bisa di atlas `1024` karena cell hanya `64x64`.

## Kenapa Atlas 1024 Tetap Berguna?

- Dibanding atlas `512` (cell `32x32`), atlas `1024` memberi ruang detail lebih tinggi.
- Tim bisa edit rank lebih halus tanpa cepat pecah.
- Kamu bebas pakai ukuran kecil-sedang-besar sampai batas `64x64` sesuai kebutuhan visual.

## Standar Agar Rank Konsisten

- Gunakan proporsi visual seperti icon rank bawaan yang sudah ada di atlas ini.
- Untuk rank baru, mulai dari ukuran sedang dulu lalu samakan tinggi/panjang dengan rank tetangga agar tidak terlihat acak.
- Hindari full `64x64` jika tidak ingin rank terlihat terlalu besar.
- Offset posisi saat ini: `X +0`, `Y +14`.

## Cara Cepat Tambah Rank Baru

1. Buka https://nhanaz.github.io/glyph/.
2. Upload `font/glyph_E8.png`.
3. Pilih slot rank yang ingin dipakai.
4. Edit/tambah icon dengan ukuran yang sesuai (ikuti proporsi rank bawaan, maksimum `64x64`).
5. Pastikan posisi konsisten dengan rank lain (offset `X +0`, `Y +14`).
6. Save hasil ke `font/glyph_E8.png`.
7. Ambil icon/simbol unicode dari slot yang dipakai di website nhanaz.
8. Buka file `behavior_packs/Kiw-Essent/scripts/plugins/ranks/rank.js`, lalu masukkan unicode tersebut ke array `uuidRanks` mengikuti format yang sudah ada.
9. Unicode rank baru wajib dimasukkan di urutan paling bawah array (jangan disisipkan di tengah).
10. Reload resource pack atau restart world.

## Changelog Singkat (Versi Sekarang vs Original)

- Atlas tetap `1024x1024` (lebih lega dari original `512x512`).
- Slot rank maksimal tetap `64x64`, jadi ada ruang lebih untuk rank baru.
- Pixel rank tetap tajam karena penyesuaian posisi dilakukan dengan shift pixel (tanpa blur/resampling).
- Posisi baseline rank sudah dituning ke `Y +14` agar tampil lebih pas di chat dan panel info.
- Layout icon dikembalikan mengikuti gaya original supaya tidak acak, tapi tetap pakai canvas 1024.

## Troubleshoot Cepat

- Rank kebesaran: kecilkan ukuran icon di slot glyph.
- Rank terlalu atas/bawah: geser semua rank konsisten per langkah `2px`.
