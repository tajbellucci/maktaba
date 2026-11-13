# How to remake the Maktaba how-to video

Use this after the app changes (new release, new buttons). It takes about 40 minutes, most of it waiting.
The video is silent. Captions are Urdu and quote the Arabic names of the buttons, because the app opens in Arabic.

## What is where

| File or folder | What it is |
|---|---|
| `record/` | The tools that walk through the real app and take the screenshots |
| `screens/` | The recorded screenshots (3200x1800, one per step) |
| `rects.json` | Where each button or field sits on each screenshot. Rings and zooms use it |
| `build.mjs` | The scene list (captions, timing, what to highlight). It writes `index.html` |
| `index.html` | The finished composition. Never edit it by hand, run `node build.mjs` |
| `renders/` | The rendered MP4 |
| `archive/` | The September 2026 version (old screens, old scene list) |

## Steps

1. **Check the app source is the version you want to show.** The recorder runs the app from `desktop/` in a test copy. It never touches the live catalogue: the server settings are blanked for the run, put back afterwards, and checked by hash.
2. **Make the sample book once** (it is the book with page marks and its PDF):
   ```
   python record\make-sample.py
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --no-pdf-header-footer --print-to-pdf="<full path>\record\files\sample-book.pdf" "file:///<full path>/record/files/sample-book.html"
   ```
   Also put one Word file named `catalogue-list.docx` in `record\files\` (any book list; the client's own lists are not kept in git).
3. **Record the screens**, one group at a time (never two at once):
   ```
   powershell -File record\run-record.ps1 -Groups "category,search,hover,detail,sort" -Port 9651
   powershell -File record\run-record.ps1 -Groups "add,edit,attach-pair,attach-docs,docx-reader,pdf-map,fts" -Port 9652
   powershell -File record\run-record.ps1 -Groups "issue,loans-lists" -Port 9653
   powershell -File record\run-record.ps1 -Groups "delete,publish,appearance,cats,cover" -Port 9654
   ```
   Each run stops by itself if the app freezes, and the screens already taken stay. Look at the screens before going on.
4. **Update the scenes** in `build.mjs` (the `SPEC` list): one entry per scene, with the screen names, the Urdu captions and the steps (move to a button, click, ring, zoom). Positions come from `rects.json` by name, so you never type coordinates. A new feature means a new recording step in `record/t-record.js` and a new scene.
5. **Build and check:**
   ```
   node build.mjs
   npm run check
   ```
   Errors must be zero. Warnings about "nested structure" and "silent film" are expected.
6. **Look at frames before the long render:**
   `npx hyperframes@0.9.39 snapshot --at 8,30,60,100 --no-end --output "%CD%\snapshots\new"`
7. **Render:** `npm run render`. The MP4 lands in `renders/`.
8. **Update `BRIEF.md`** (length, scenes) and commit.

## Rules that came from mistakes

- Never show real borrower names, phone numbers, or the Settings screen (it shows connection keys). The recorder uses a made-up borrower.
- Do not run two recordings at the same time. They share one file and the second can leave it blank.
- Keep the old version in `archive/`, outside the project root. A second HTML file in the root makes the check fail.
- The pinned tool version is in `package.json`. Move it with `npx hyperframes@latest upgrade --project .` and run the check after.
