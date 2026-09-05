/* ponytail: smallest runnable check for norm/matches/duplicates, run with `npm test`. */
const assert = require("assert");
const { norm, matches, duplicateGroups, findInText, findInTextOpts } = require("./shared/norm.js");

const book = (o) => Object.assign(
  { title: "", author: "", publisher: "", category: "", notes: "", maktaba: "", department: "", borrower: "", accession: "" },
  o
);

assert.strictEqual(norm("علامہ ابن عابدین شامي"), norm("علامہ ابن عابدین شامی"), "ي/ی unify");
assert.strictEqual(norm("مك"), norm("مک"), "ك/ک unify");
assert.strictEqual(norm("فتاویٰ"), norm("فتاوی"), "diacritics stripped");
assert.ok(matches(book({ title: "صحیح البخاری" }), "بخار"), "substring match");
assert.ok(!matches(book({ title: "صحیح البخاری" }), "مسلم"), "non-match rejected");
assert.ok(matches(book({ title: "Fiqh Book" }), "fiqh"), "latin lowercase match");

// tracking fields are searchable: a librarian searches by register number and borrower
assert.ok(matches(book({ title: "الہدایہ", accession: "42" }), "42"), "accession searchable");
assert.ok(matches(book({ title: "الہدایہ", borrower: "عبد اللہ" }), "عبد"), "borrower searchable");
assert.ok(matches(book({ title: "الہدایہ", publisher: "دار الفكر" }), "الفکر"), "publisher searchable, normalized");

// duplicate detection: same title+author twice is a cataloguing error
const dups = duplicateGroups([
  book({ id: 1, title: "صحيح البخاري", author: "بخاري" }),   // Arabic ي
  book({ id: 2, title: "صحیح البخاری", author: "بخاری" }),   // Urdu ی — same book, caught after norm
  book({ id: 3, title: "نور الایضاح", author: "شرنبلالی" })
]);
assert.strictEqual(dups.length, 1, "one duplicate group found");
assert.strictEqual(dups[0].length, 2, "group holds both copies");

// ہ and ھ must NOT unify: بہار (spring) and بھار (load) are different words,
// and بہارِ شریعت is in this catalogue. Forgiving search must not merge them.
assert.notStrictEqual(norm("بہار"), norm("بھار"), "ہ/ھ stay distinct");

// blank titles never count as duplicates of each other
assert.strictEqual(duplicateGroups([book({ id: 1 }), book({ id: 2 })]).length, 0, "blank titles ignored");

/* Full-text search options (the البحث panel's مراعاة التشكيل / الهمزات).
   The whole point of the switches is that they CHANGE the result, so each is
   checked in both positions against text that only differs by that one axis. */
const ayah = "إنما الأعمال بالنيات";           // hamza-alif + no harakat
const withHarakat = "إنَّما الأعمالُ بالنيَّات"; // same words, diacritics added

// default (both off) = forgiving, same behaviour as the reader's findInText
assert.ok(findInTextOpts(withHarakat, "الأعمال", {}).length, "diacritics ignored by default");
assert.strictEqual(
  findInTextOpts(ayah, "الاعمال", {}).length,
  findInText(ayah, "الاعمال").length,
  "options-off matches the fixed shared rule set"
);

// مراعاة التشكيل ON: a bare query no longer reaches diacritic'd text
assert.ok(findInTextOpts(withHarakat, "إنَّما", { diacritics: true }).length,
  "harakat kept: typing the diacritics finds it");
assert.ok(!findInTextOpts(withHarakat, "إنما", { diacritics: true }).length,
  "harakat kept: typing without them does NOT find it");

// مراعاة الهمزات ON: أ stops folding into ا
assert.ok(findInTextOpts(ayah, "الاعمال", { hamza: false }).length, "hamza folded when off");
assert.ok(!findInTextOpts(ayah, "الاعمال", { hamza: true }).length, "hamza respected when on");
assert.ok(findInTextOpts(ayah, "الأعمال", { hamza: true }).length, "exact hamza still matches when on");

// ranges point back into the ORIGINAL string, diacritics and all
const hit = findInTextOpts(withHarakat, "الأعمال", {})[0];
assert.ok(withHarakat.slice(hit.start, hit.end).startsWith("الأعمال"), "range maps back to original text");

/* Quranic orthography — every one of these failed against the real file the
   madrassa uploaded (ArabicQuran.txt) before the character-table rewrite.
   Short excerpts stand in for the book so the test needs no attachment. */
const wasla = "بِسْمِ ٱللَّهِ ٱلرَّحْمَنِ ٱلرَّحِيمِ";          // ٱ alef wasla, 13k+ of them in that file
assert.ok(findInText(wasla, "الله").length, "alef wasla folds to alef (searching الله found NOTHING before)");
assert.ok(findInText(wasla, "الرحمن").length, "wasla inside a longer word");
assert.ok(findInText(wasla, "بسم الله الرحمن الرحيم").length, "whole phrase across wasla + harakat");

const bidi = "‏" + "ٱلْحَمْدُ لِلَّهِ" + "‎";        // every line in that file is wrapped like this
assert.ok(findInText(bidi, "الحمد لله").length, "invisible bidi marks ignored");
assert.ok(findInText("وَإِذَا قُرِئَ ٱلْقُرْءَانُ" + "ۖ", "القرءان").length, "Quranic pause mark ignored");

// that file spells العلمين and ملك with no long alef, where a reader types العالمين / مالك
const noAlef = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَلَمِينَ";
const loose = findInText(noAlef, "الحمد لله رب العالمين");
assert.ok(loose.length, "alef-insensitive fallback matches the missing-alef spelling");
assert.ok(noAlef.slice(loose[0].start, loose[0].end).startsWith("ٱلْحَمْدُ"),
  "fallback highlight starts at the alef, not after it");

// the fallback must stay a fallback: an exact hit is never widened by it
const exact = findInText("كتب الكاتب كتابا", "كتب");
assert.strictEqual(exact.length, 1, "exact matches are not replaced by the alef-insensitive pass");

// and the Urdu cataloguing rule the fallback must never break
assert.strictEqual(norm("فتاویٰ"), norm("فتاوی"), "dagger alef still folds for catalogue titles");

console.log("norm.js: all checks passed");
