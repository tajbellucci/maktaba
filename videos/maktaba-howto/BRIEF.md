---
workflow: general-video
flow: automation
storyboard: no
message: "Every job in the Maktaba Naumania app, shown step by step"
destination: whatsapp-and-lcd
aspect: 1920x1080
language: ur
audience: "Madrasa Naumania library staff and administration"
length: ~172s
angle: how-to-demo
---

## Intent

A silent "how to use our product" demo of the Maktaba Naumania desktop app (version 1.14), not a
launch video. For the library staff and the madrasa administration. The complete flow of the
application, in 21 steps: open the library, browse and the status tabs, category and shelf,
search by title (exact phrase, title only), hover preview and book details, sort by heading and
export to Excel, add a book, edit with the Save button and undo/redo, attach files (PDF, text,
Word, Excel, PowerPoint, EPUB, images), read a Word file inside the app, search the text and
open the scanned PDF at the same printed page, several books in reader tabs, search across
ticked books, issue, return, issued and overdue lists, delete and the 30-day recycle bin,
automatic publishing (files reach every PC), cover photo, appearance, categories and backup.
Modern motion product-video style.

## Assets

- screens/*.png: real screens recorded from the running app by record/run-record.ps1 (test copy of
  the catalogue, one made-up borrower), 3200x1800 each, one per step. App language Arabic (default).
- rects.json: measured position of every highlighted button or field, written by the recorder.
- assets/JameelNooriNastaleeq.ttf: the app's own Urdu font.
- assets/logo.png: the app's logo.
- archive/: the September 2026 version (16 scenes, old interface).

## Customizations

- No music, no voice, screen only. Every caption must be readable with sound off.
- Animated cursor clicks, highlight ring on each button used, camera zooms.
- Urdu step captions quote the Arabic button names, because the app opens in Arabic.

## Notes

- Shown on WhatsApp and an LCD screen: one 16:9 render serves both.
- Urdu step captions, Space Mono step counters.
- Never show real borrower names or the Settings screen (it shows connection keys).
- 2026-09-30: first version, 16 steps, about 127 s, older Urdu interface.
- 2026-11-13: rebuilt for version 1.14. All screens re-recorded from the current app; new steps for
  Save/undo, attached files, Word reading, PDF page jump, reader tabs, sort/Excel, recycle bin.
  Scene list now reads positions from rects.json. See WORKFLOW.md to remake it.
