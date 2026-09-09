/* Runs the SHIPPED detectScript/esc out of renderer/app.js — never a copy of
   them — so a change to the real code is what these assertions see. */
const assert = require("assert");
const fs = require("fs");

const src = fs.readFileSync(__dirname + "/renderer/app.js", "utf8");
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
eval(grab("const URDU_MARKERS", "function applyReaderScript"));
const esc = eval(grab("const esc = (s)", "const escapeHtml").replace("const esc =", "") .trim().replace(/;$/, ""));

const AR = "بسم الله الرحمن الرحيم الحمد لله رب العالمين ".repeat(120);
const UR = "یہ کتاب اردو میں ہے ٹھیک ہے جو کچھ لکھا گیا ".repeat(400);

assert.strictEqual(detectScript(AR), "ar");
assert.strictEqual(detectScript(UR), "ur");
// The case this was written for: an Urdu book opening with an Arabic passage.
assert.strictEqual(detectScript(AR.slice(0, 4000) + UR), "ur");
assert.strictEqual(detectScript(AR.slice(0, 4000) + UR + AR.slice(0, 4000)), "ur");
// Text extracted from a PDF arrives as presentation forms, not the base block.
assert.strictEqual(detectScript("ﺍﻟﺴﻼﻡ ﻋﻠﻴﻜﻢ ﻭﺭﺣﻤﺔ ﺍﻟﻠﻪ ".repeat(40)), "ar");
assert.strictEqual(detectScript("ﮐﺘﺎﺑﯿﮟ ﮨﯿﮟ ﯾﮧ ﺍﭼﮭﺎ ﮨﮯ ".repeat(60)), "ur");
assert.strictEqual(detectScript("hello world ".repeat(500)), null);
// One stray Urdu word must not flip a long Arabic book.
assert.strictEqual(detectScript(AR + " کتابیں "), "ar");

assert.strictEqual(esc('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
assert.strictEqual(esc(null), "");

console.log("detectScript + esc: all checks passed");
