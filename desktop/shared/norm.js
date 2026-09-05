/* Search normalization — the ONE rule set.
   Must stay identical to the Kotlin port in the Android app.
   Spec lives in madarsa-app/PROGRAM.md.

   Character tables, not regexes: normIndexed() runs per character over whole
   books, and the previous five-regexes-per-character version cost ~1.3 s on
   the 754,000-character Qur'an text the madrassa actually uploaded. */

const addRange = (set, a, b) => { for (let c = a; c <= b; c++) set.add(c); };

/* DIACRITICS: dropped normally, kept when the search panel's
   "مراعاة التشكيل" switch is on. That uploaded Qur'an carries 22,661 shadda
   alone, plus 1,681 Quranic pause marks (ۖ ۗ …) sitting inside verses —
   leaving those in breaks every phrase match that spans one. */
const MARKS = new Set();
addRange(MARKS, 0x064B, 0x0652);   // tanwin, shadda, sukun — the usual tashkeel
addRange(MARKS, 0x0653, 0x0655);   // maddah, hamza above / below
addRange(MARKS, 0x0656, 0x065F);   // remaining combining marks
MARKS.add(0x0670);                 // superscript (dagger) alef
addRange(MARKS, 0x06D6, 0x06ED);   // Quranic annotation and sajdah marks

/* Never meaningful to a search whatever the options say: kashida stretching,
   invisible bidi controls (this file wraps every line in RLM/LRM, ~6,350 of
   each) and a stray byte-order mark on line 1. */
const IGNORED = new Set([0x0640, 0x061C, 0xFEFF]);
addRange(IGNORED, 0x200B, 0x200F);

/* Letter shapes that mean the same letter regardless of the hamza switch.
   Alef wasla (ٱ) is the one that mattered: 13,481 occurrences in the
   uploaded Qur'an, so without folding it a search for "الله" found NOTHING
   in that book. It is an alef carrying a wasla sign, not a hamza, so it
   folds even when hamzas are being respected. */
const FOLD_ALWAYS = new Map([
  [0x064A, "ی"],                                   // ي -> ی
  [0x0643, "ک"],                                   // ك -> ک
  [0x0629, "ہ"],                                   // ة -> ہ
  [0x0671, "ا"], [0x0672, "ا"],               // ٱ ٲ -> ا
  [0x0673, "ا"], [0x0675, "ا"]                // ٳ ٵ -> ا
]);

/* Folded unless "مراعاة الهمزات" is on — these carry a real hamza. */
const FOLD_HAMZA = new Map([
  [0x0623, "ا"], [0x0625, "ا"], [0x0622, "ا"],   // أ إ آ -> ا
  [0x0626, "ی"]                                            // ئ    -> ی
]);

/* One character in, its normalized form out; "" means drop it.
   `daggerAsAlef` decides what happens to the superscript (dagger) alef —
   see prepareIndex() for why the book text is indexed BOTH ways. */
function foldChar(ch, code, keepHarakat, keepHamza, daggerAsAlef) {
  if (IGNORED.has(code)) return "";
  if (code === 0x0670) return keepHarakat ? ch : (daggerAsAlef ? "ا" : "");
  if (!keepHarakat && MARKS.has(code)) return "";
  const always = FOLD_ALWAYS.get(code);
  if (always !== undefined) return always;
  if (!keepHamza) {
    const h = FOLD_HAMZA.get(code);
    if (h !== undefined) return h;
  }
  if (code < 0x80) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch;
  if (code >= 0x0600 && code <= 0x06FF) return ch;   // Arabic script has no case
  return ch.toLowerCase();
}

function normWith(s, keepHarakat, keepHamza, daggerAsAlef) {
  const src = String(s == null ? "" : s);
  let out = "";
  for (let i = 0; i < src.length; i++) {
    out += foldChar(src[i], src.charCodeAt(i), keepHarakat, keepHamza, daggerAsAlef);
  }
  return out.trim();
}

function norm(s) {
  return normWith(s, false, false);
}

/* The same rules applied one character at a time, keeping a map from each
   normalized position back to its position in the ORIGINAL text.
   Searching inside a book needs this: normalization changes the length (it
   strips diacritics), so a match found in normalized text would highlight
   the wrong characters without a way back. Deliberately does NOT trim — a
   space that vanished would run words together and break phrase matching.
   The map is an Int32Array because on a 754k-character book a plain array
   of that many numbers is megabytes of heap for nothing. */
function normIndexedWith(s, keepHarakat, keepHamza, daggerAsAlef) {
  const src = String(s == null ? "" : s);
  const parts = new Array(src.length);
  const map = new Int32Array(src.length + 1);
  let at = 0;
  for (let i = 0; i < src.length; i++) {
    const n = foldChar(src[i], src.charCodeAt(i), keepHarakat, keepHamza, daggerAsAlef);
    parts[i] = n;
    for (let k = 0; k < n.length; k++) map[at++] = i;
  }
  map[at] = src.length;   // one past the end, so a match on the last character can be sliced
  return { text: parts.join(""), map };
}

function normIndexed(s) {
  return normIndexedWith(s, false, false);
}

/* Every occurrence of `query` inside `text`, as {start,end} ranges into the
   ORIGINAL string. Same normalization as the catalogue search, so a reader
   types the word the same way in both places. */
function findInText(text, query) {
  return findInTextOpts(text, query, null);
}

/* ── Configurable matching, for the full-text search panel ──────────────
   Shamela's search window offers "مراعاة التشكيل" (respect diacritics) and
   "مراعاة الهمزات" (respect hamzas) as switches; both run through the same
   table-driven core above, so the fixed rule set and the optional one can
   never drift apart the way two separate implementations would. */
function normIndexedOpts(s, opts) {
  return normIndexedWith(s, !!(opts && opts.diacritics), !!(opts && opts.hamza));
}

/* Searching many terms in one book should normalize that book ONCE, not once
   per term — on the uploaded Qur'an that is 237 ms versus 9 ms per extra term.

   TWO variants are built, because the dagger alef cannot be resolved one way
   without breaking the other real case:
     · dropped  — Urdu cataloguing writes فتاویٰ where a librarian types
                  فتاوی, so the mark has to vanish for those to match.
     · as alef  — Quranic orthography writes ٱلْعَٰلَمِينَ where a reader types
                  العالمين, so there the mark IS the alef.
   Searching both and merging the hits serves both spellings honestly instead
   of quietly picking one and failing the other. */
function prepareIndex(text, opts) {
  const keepHarakat = !!(opts && opts.diacritics);
  const keepHamza = !!(opts && opts.hamza);
  const dropped = normIndexedWith(text, keepHarakat, keepHamza, false);
  /* The second variant only differs where a dagger alef exists, and most
     books have none — checking first saves a whole extra pass over the text
     (~370 ms on the Qur'an-sized file) for every ordinary book. */
  const hasDagger = String(text == null ? "" : text).indexOf("ٰ") !== -1;
  const asAlef = hasDagger ? normIndexedWith(text, keepHarakat, keepHamza, true) : null;
  return {
    variants: asAlef && asAlef.text !== dropped.text ? [dropped, asAlef] : [dropped],
    text, keepHarakat, keepHamza,
    loose: null            // built only if a strict search comes back empty
  };
}

/* Alef-insensitive fallback.
   The uploaded Qur'an spells ٱلْعَلَمِينَ and مَلِكِ — no long alef — where a
   reader types العالمين and مالك. Dropping every alef on both sides matches
   those. It is deliberately a FALLBACK, tried only when the strict search
   found nothing: it also merges words that differ only by an alef
   (كتب / كاتب), which is the right trade against showing zero results for
   the most obvious query in the book, but the wrong default. */
const ALEF = 0x0627;
function stripAlef(indexed) {
  const src = indexed.text;
  const parts = new Array(src.length);
  const map = new Int32Array(src.length + 1);
  let at = 0;
  /* A dropped alef belongs to the match that follows it, or a hit on
     "العالمين" would highlight from the ل and leave the ا outside it. */
  let pending = -1;
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === ALEF) {
      if (pending < 0) pending = indexed.map[i];
      parts[i] = "";
      continue;
    }
    parts[i] = src[i];
    map[at++] = pending >= 0 ? pending : indexed.map[i];
    pending = -1;
  }
  map[at] = indexed.map[src.length];
  return { text: parts.join(""), map };
}

function findIn(hay, map, needle, hits, seen) {
  let at = hay.indexOf(needle);
  while (at !== -1 && hits.length < 5000) {   // a cap, not a limit anyone meets
    const start = map[at];
    if (!seen.has(start)) { seen.add(start); hits.push({ start, end: map[at + needle.length] }); }
    at = hay.indexOf(needle, at + Math.max(1, needle.length));
  }
}

/* Same contract as findInText: {start,end} ranges into the ORIGINAL string.
   Pass a prepared index as `prepared` to skip re-normalizing the haystack. */
function findInTextOpts(text, query, opts, prepared) {
  const keepHarakat = !!(opts && opts.diacritics);
  const keepHamza = !!(opts && opts.hamza);
  const needle = normWith(query, keepHarakat, keepHamza, false);
  if (!needle) return [];

  const idx = prepared || prepareIndex(text, opts);
  const hits = [];
  const seen = new Set();
  for (const v of idx.variants) findIn(v.text, v.map, needle, hits, seen);
  if (hits.length) return hits.sort((a, b) => a.start - b.start);

  // Nothing matched exactly — retry ignoring alefs (see stripAlef above).
  const loose = needle.replace(/ا/g, "");
  if (!loose || loose === needle) return [];
  if (!idx.loose) idx.loose = stripAlef(idx.variants[0]);
  findIn(idx.loose.text, idx.loose.map, loose, hits, seen);
  return hits.sort((a, b) => a.start - b.start);
}

/* Substring match across every searchable field.
   Substring, not whole-word: the reference app's exact-match-only search is
   its most complained-about flaw. */
function matches(book, query) {
  const q = norm(query);
  if (!q) return true;
  const hay = norm(
    [
      book.title, book.author, book.publisher, book.category, book.notes,
      book.maktaba, book.department, book.borrower,
      book.accession   // a librarian holding the book reads its register number off the spine
    ].join(" ")
  );
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/* Duplicate detection — Shamela's "compare books to sort duplicates".
   In a physical register the same title+author entered twice is a real
   cataloguing error, so the key is the normalized pair, not the record id. */
function duplicateGroups(books) {
  const map = new Map();
  for (const b of books) {
    const key = norm(b.title) + "|" + norm(b.author);
    if (!norm(b.title)) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

if (typeof module !== "undefined") {
  module.exports = {
    norm, normIndexed, findInText,
    normIndexedOpts, findInTextOpts, prepareIndex,
    matches, duplicateGroups
  };
}
