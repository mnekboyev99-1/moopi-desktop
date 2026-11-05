<div align="center">
  <h1>MOOPI Desktop — kengaytma</h1>
  <p><b>Biznes egasining shaxsiy AI yordamchisi, kompyuterda.</b> · <a href="https://moopi.uz">moopi.uz</a> · <a href="https://t.me/moopiai">@moopiai</a></p>
  <p>Asoschi va muallif — <b>Muxiddin Nekbayev</b> (Toshkent, O'zbekiston)</p>
</div>

---

# MOOPI Desktop

Kompyuter uchun MOOPI: VSCodium (VS Code'ning ochiq kodli, telemetriyasiz yig'ilmasi) ustida MOOPI qobig'i.
O'rtada Claude Code'ning rasmiy kengaytmasi (o'zgartirilmaydi, foydalanuvchi o'z Claude obunasi bilan kiradi),
atrofida MOOPI panellari: Bugun, Tasdiqlar, Fayllar. Telefonda suhbat Claude ilovasida davom etadi (Remote Control).

Qonuniy asos: code.claude.com/docs/en/legal-and-compliance — mahsulot ichida Claude Code'ni oldindan o'rnatish
mumkin, shartlar: binar o'zgartirilmaydi, har foydalanuvchi o'z hisobi bilan kiradi, biz hech kimning sarfini
to'lamaymiz; "Claude Code bilan ishlaydi" deb yozish mumkin, Claude nomi va logosini o'zimizniki qilib ishlatish mumkin emas.

## Tuzilishi

- `extension/` — MOOPI kengaytmasi: activity bar'da MOOPI bo'limi (webview panellar), MOOPI Dark mavzusi,
  Claude'ni o'rtada ochish, MOOPI API bilan kirish (email yoki Telegram kodi).
- `dev/run.sh` — Mac'da ishga tushirish (alohida user-data va extensions papkalari, `.run/`).
- `dev/settings.json` — oynaning sozlamalari (IDE qismlari yashirilgan, Claude o'rtada).
- `vendor/` — VSCodium yig'ilmasi va Claude Code vsix (git'ga kirmaydi).

## Bosqichlar

1. **A (hozir):** tayyor VSCodium + kengaytma, Mac'da sinov.
2. **B:** brendlangan yig'ilma (nom, belgi, bundle id) — VSCodium manbasidan GitHub Actions'da (APP_NAME=MOOPI ...),
   macOS/Windows o'rnatgichlar, imzolash (Apple developer hisobi kerak).
3. **C:** serverdagi sandbox bilan bog'lanish (bitta suhbat telefon va kompyuterda), yangilanish mexanizmi.

## Eslatma (05.11): Mac'da yengil qayta brendlash ishlamadi

`dev/brand-mac.sh` (bundle nusxasi, nom/belgi/plist, ad-hoc qayta imzolash) tayyor, lekin bu macOS'da
qayta imzolangan nusxa Launch Services orqali ishga tushmaydi ("Launchd job spawn failed", imzo tekshiruvdan
o'tsa ham). Shuning uchun A bosqichida asl `VSCodium.app` ishlatiladi (menyuda "VSCodium" nomi qoladi),
nom va belgi B bosqichida manbadan yig'ilgan brendlangan yig'ilma bilan keladi.

## Asoschi / Основатель

**Muxiddin Nekbayev** — MOOPI'ning asoschisi va muallifi. [GitHub](https://github.com/mnekboyev99-1) · [moopi.uz](https://moopi.uz)

© 2026 MOOPI · Muxiddin Nekbayev. Bu kengaytma MOOPI'ning bir qismi; ilovaning aqli, xotirasi va
integratsiyalari MOOPI serverida ishlaydi. Claude va Claude Code — Anthropic'ning belgilari.
