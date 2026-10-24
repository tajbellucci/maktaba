/* Printed pages in a Unicode text, and where they sit in the book's PDF scan.

   A text can carry page marks typed where each printed page begins:
     [ص 45]          page 45
     [ص: 45]         same
     [ج 2 ص 45]      volume 2, page 45   (also [ج2/ص45], [ج 2، ص 45])
   Digits may be Latin, Arabic-Indic or Urdu.

   The scan rarely starts at printed page 1 (cover, title, contents), and old
   scans skip or repeat pages, so the librarian gives offsets per book:
     "2"                    every page: PDF page = printed page + 2
     "1:4, 121:5"           pages 1-120: +4, from page 121: +5
     "ج2 1:3"               the same rules for volume 2 only
   Volume N opens the Nth PDF attached to the book. */

const DIGIT = /[٠-٩۰-۹]/g;
const toLatin = (s) => String(s).replace(DIGIT, (d) => {
  const c = d.charCodeAt(0);
  return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
});

const MARK = /\[\s*(?:ج\s*:?\s*([0-9٠-٩۰-۹]+)\s*[\/،,]?\s*)?ص\s*:?\s*([0-9٠-٩۰-۹]+)\s*\]/g;

// [{ at, vol, page }] in text order. vol is null when the mark names none.
function pageMarks(text) {
  const out = [];
  const src = String(text == null ? "" : text);
  MARK.lastIndex = 0;
  let m;
  while ((m = MARK.exec(src)) !== null) {
    out.push({ at: m.index, vol: m[1] ? parseInt(toLatin(m[1]), 10) : null, page: parseInt(toLatin(m[2]), 10) });
  }
  return out;
}

// The printed page (and volume) a text position falls on, or null before the first mark.
function printedPageAt(marks, offset) {
  let found = null, vol = null;
  for (const mk of marks) {
    if (mk.at > offset) break;
    if (mk.vol != null) vol = mk.vol;
    found = { vol: mk.vol != null ? mk.vol : vol, page: mk.page };
  }
  return found;
}

// "ج2 1:4, 121:5" -> [{ vol, from, off }]. Anything unreadable is skipped, not guessed.
function parsePdfOffsets(spec) {
  const rules = [];
  let vol = null;
  for (const raw of toLatin(spec || "").split(/[,،;\n]+/)) {
    let part = raw.trim();
    const v = /^ج\s*(\d+)\s*/.exec(part);
    if (v) { vol = parseInt(v[1], 10); part = part.slice(v[0].length).trim(); }
    if (!part) continue;
    const r = /^(\d+)\s*:\s*([+-]?\d+)$/.exec(part);
    if (r) { rules.push({ vol, from: parseInt(r[1], 10), off: parseInt(r[2], 10) }); continue; }
    const one = /^([+-]?\d+)$/.exec(part);
    if (one) rules.push({ vol, from: 1, off: parseInt(one[1], 10) });
  }
  return rules;
}

// PDF page for a printed page: the rule with the highest "from" at or below it,
// a rule for that volume winning over a rule for every volume. No rule: offset 0.
function pdfPageFor(rules, vol, page) {
  let best = null;
  for (const r of rules) {
    if (r.from > page) continue;
    if (r.vol != null && r.vol !== vol) continue;
    const better = !best || (r.vol != null && best.vol == null) || (r.vol === best.vol && r.from > best.from);
    if (better) best = r;
  }
  return Math.max(1, page + (best ? best.off : 0));
}

if (typeof module !== "undefined") {
  module.exports = { pageMarks, printedPageAt, parsePdfOffsets, pdfPageFor };
}
