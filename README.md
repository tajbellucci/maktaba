# Darul Ifta Maktaba — Madarsa Naumania

Static book-inventory app for the Darul Ifta library. Runs entirely on GitHub Pages — no backend.

- **Owner:** `TajMagsi`
- **Live catalogue:** https://tajmagsi.github.io/maktaba/
- **Admin dashboard:** https://tajmagsi.github.io/maktaba/admin.html (password-gated)

## Files

- `index.html` — public catalogue: totals, present/missing counts, voice + text search (Urdu / Arabic / English), status + category filter chips
- `admin.html` — password-gated dashboard: add one book or many, edit, delete, toggle موجود/غیر موجود, save straight to the repo
- `books.json` — single source of truth for the book list
- `style.css` — shared styles

## Using the dashboard

1. Open `admin.html`, enter the password.
2. **＋ ایک کتاب** — add a single book via a form.
   **＋ کئی کتابیں** — paste a list, one book per line, fields separated by `|`:
   `نام | مصنف | موضوع | جلدیں` (only the name is required).
3. Edit any cell inline; toggle حالت; ✕ deletes a row.
4. **GitHub پر محفوظ کریں** commits `books.json` to the repo; the site redeploys automatically (~1 min).

## Dashboard save setup (one time, per device)

1. Create a **fine-grained personal access token**: GitHub → Settings → Developer settings → Fine-grained tokens.
   - Repository access: only `TajMagsi/maktaba`.
   - Permissions: **Contents → Read and write**. Nothing else.
2. Open `admin.html` → ⚙ GitHub سیٹنگز → owner `TajMagsi`, repo `maktaba`, branch `main`, paste token.
3. Token is stored in that browser's localStorage only — never sent anywhere except GitHub.

No token? Use **بیک اپ (JSON)** to download the edited list and commit it manually.

## Deploy (GitHub Pages)

Repo Settings → Pages → Source: `main` branch, `/ (root)`. Site appears at `https://TajMagsi.github.io/maktaba/`.

## Data format

```json
{
  "library": "دار الافتاء مکتبہ — مدرسہ نعمانیہ",
  "updated": "2026-07-12",
  "books": [
    {
      "id": 1,
      "title": "فتاویٰ شامی",
      "author": "علامہ ابن عابدین شامی",
      "category": "فتاویٰ",
      "volumes": 12,
      "present": true,
      "notes": ""
    }
  ]
}
```

`present: true` = موجود, `false` = غیر موجود. `notes` for details (missing volumes, borrowed, etc.).
