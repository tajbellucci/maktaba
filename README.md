# Darul Ifta Maktaba — Madarsa Naumania

Static book-inventory app for the Darul Ifta library. Runs entirely on GitHub Pages — no backend.

## Files

- `index.html` — public catalogue: totals, present/missing counts, search (Urdu), category + status filters
- `admin.html` — dashboard: add/edit/delete books, toggle موجود/غیر موجود, save straight to the repo
- `books.json` — single source of truth for the book list
- `style.css` — shared styles

## Deploy (GitHub Pages)

1. Create a repo (e.g. `maktaba`) and push these files to `main`.
2. Repo Settings → Pages → Source: `main` branch, `/ (root)`.
3. Site appears at `https://<owner>.github.io/maktaba/`.

## Dashboard setup (one time)

1. Create a **fine-grained personal access token**: GitHub → Settings → Developer settings → Fine-grained tokens.
   - Repository access: only this repo.
   - Permissions: **Contents → Read and write**. Nothing else.
2. Open `admin.html` → ⚙ GitHub سیٹنگز → enter owner, repo, branch (`main`), token.
3. Token is stored in that browser's localStorage only. Saving commits `books.json` to the repo; Pages redeploys automatically (~1 min).

No token? Use **JSON ڈاؤن لوڈ** to download the edited list and commit it manually, or send it to the maintainer.

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
