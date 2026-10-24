/* Smallest runnable check for shared/pagemap.js: `node test-pagemap.js`. */
const assert = require("assert");
const { pageMarks, printedPageAt, parsePdfOffsets, pdfPageFor } = require("./shared/pagemap.js");

// marks: plain, colon, Arabic-Indic and Urdu digits, volume forms
const text = "عنوان\n[ص 1]\nالطهارة\n[ص: 2]\nالصلاة\n[ص ٣]\nالزكاة\n[ص ۴]\nالصوم\n[ج 2 ص 10]\nالحج\n[ج2/ص11]\nالنكاح";
const marks = pageMarks(text);
assert.deepStrictEqual(marks.map((m) => [m.vol, m.page]), [[null, 1], [null, 2], [null, 3], [null, 4], [2, 10], [2, 11]]);
assert.strictEqual(printedPageAt(marks, 0), null, "before the first mark: no page");
assert.deepStrictEqual(printedPageAt(marks, text.indexOf("الصلاة")), { vol: null, page: 2 });
assert.deepStrictEqual(printedPageAt(marks, text.indexOf("الزكاة")), { vol: null, page: 3 }, "Arabic-Indic digits");
assert.deepStrictEqual(printedPageAt(marks, text.indexOf("الحج")), { vol: 2, page: 10 });
assert.deepStrictEqual(printedPageAt(marks, text.indexOf("النكاح")), { vol: 2, page: 11 }, "compact volume form");
assert.deepStrictEqual(pageMarks("[ج 2 ص 45] [ص 46]").map((m) => printedPageAt(pageMarks("[ج 2 ص 45] [ص 46]"), m.at)),
  [{ vol: 2, page: 45 }, { vol: 2, page: 46 }], "a page mark with no volume stays in the last named volume");
assert.strictEqual(pageMarks("صفحة 5 [ملاحظة] (ص 5)").length, 0, "only bracketed [ص N] counts");

// offsets
assert.strictEqual(pdfPageFor(parsePdfOffsets(""), null, 7), 7, "no rule: same page");
assert.strictEqual(pdfPageFor(parsePdfOffsets("2"), null, 5), 7, "single offset");
assert.strictEqual(pdfPageFor(parsePdfOffsets("+2"), null, 5), 7, "leading plus");
const shifted = parsePdfOffsets("1:4, 121:5");
assert.strictEqual(pdfPageFor(shifted, null, 120), 124, "before the skipped page");
assert.strictEqual(pdfPageFor(shifted, null, 121), 126, "after it");
const vols = parsePdfOffsets("3, ج2 1:1, 50:2");
assert.strictEqual(pdfPageFor(vols, 1, 10), 13, "volume 1 uses the all-volumes rule");
assert.strictEqual(pdfPageFor(vols, 2, 10), 11, "volume 2 has its own rule");
assert.strictEqual(pdfPageFor(vols, 2, 60), 62, "and its own later step");
assert.strictEqual(pdfPageFor(parsePdfOffsets("٢"), null, 5), 7, "Arabic-Indic digits in the offset");
assert.strictEqual(pdfPageFor(parsePdfOffsets("-3"), null, 2), 1, "never before page 1");
assert.strictEqual(pdfPageFor(parsePdfOffsets("abc, 1:x, 2"), null, 5), 7, "junk is ignored, good rules kept");

console.log("pagemap.js: all checks passed");
