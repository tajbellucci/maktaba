// Generates index.html from the scene table below. Run: node build.mjs
// App-space coordinates are CSS px of the app at 1600x900 (the screenshots are 2x).
import { writeFileSync, readFileSync } from "node:fs";

const W = 1600, H = 900;
const FRAME = { x: 64, y: 128, w: 1328, chrome: 38 };
const K = FRAME.w / W; // 0.83
const SCREEN_Y = FRAME.y + FRAME.chrome;
const SCREEN_H = Math.round(H * K);

const INTRO = 5.0, OUTRO = 5.5, XF = 0.4;

// ---- scene table ---------------------------------------------------------
// Positions come from rects.json (measured in the running app by the recorder),
// so rings and zooms follow the real screens. Each scene is written as steps:
//   { t, to:[screen,key], click, ring: seconds, S: zoom, move:false }  or  { t, reset:true }
const rects = JSON.parse(readFileSync(new URL("./rects.json", import.meta.url), "utf8"));
const MISSING = [];
const R = (sc, k) => { const r = rects[sc] && rects[sc][k]; if (!r) { MISSING.push(`${sc}.${k}`); return [700, 400, 200, 60]; } return r; };
const mid = (r) => [Math.round(r[0] + r[2] / 2), Math.round(r[1] + r[3] / 2)];

function build(s) {
  const out = { title: s.title, dur: s.dur, cur: s.cur || [800, 600], chips: s.chips, shots: s.shots, cam: [], moves: [], clicks: [], rings: [], special: s.special };
  for (const st of s.steps || []) {
    if (st.reset) { out.cam.push([st.t, 1.0, 1, 800, 450]); continue; }
    const r = R(st.to[0], st.to[1]); const [cx, cy] = mid(r);
    if (st.S) out.cam.push([Math.max(0.15, st.t - 0.15), 1.0, st.S, cx, cy]);
    if (st.move !== false) out.moves.push([st.t, 0.8, cx, cy]);
    if (st.click) out.clicks.push(+(st.t + 0.95).toFixed(2));
    if (st.ring) out.rings.push([+(st.t + 0.25).toFixed(2), +(st.t + 0.25 + st.ring).toFixed(2), r]);
  }
  return out;
}

const SPEC = [
  { title: "لائبریری کھولیں", dur: 6.5, shots: [["01-home", 0], ["02-list", 3.7]],
    chips: [["سرورق پر «افتح المكتبة» دبائیں", 0.5], ["کتابوں کی فہرست کھل جاتی ہے", 3.8]],
    steps: [{ t: 0.6, to: ["01-home", "enter"], click: 1, ring: 2.5, S: 1.35 }, { t: 3.6, reset: true }] },

  { title: "کتابوں کی فہرست", dur: 7.5, shots: [["02-list", 0]],
    chips: [["ہر سطر میں رقم، کتاب، مؤلف اور ناشر", 0.4], ["اوپر کے ٹیب: متوفر، معار، غیر موجود، متأخر", 2.4], ["ہر کتاب کے ساتھ رنگین نقطہ: موجود یا نہیں", 4.8]],
    steps: [{ t: 0.4, to: ["02-list", "head"], move: false, ring: 1.7, S: 1.3 }, { t: 2.3, to: ["02-list", "tabs"], ring: 2.3, S: 1.5 }, { t: 4.8, to: ["02-list", "row3"], ring: 2.4, S: 1.4 }] },

  { title: "موضوع اور خزانہ سے دیکھیں", dur: 8.5, shots: [["02-list", 0], ["03-category", 2.3], ["04-almari", 5.7]],
    chips: [["دائیں پٹی سے «الموضوع» چنیں", 0.4], ["موضوع پر کلک: اس کی سب کتابیں", 2.4], ["«الخزانة» سے الماری وار فہرست", 5.0]],
    steps: [{ t: 0.3, to: ["02-list", "railCategory"], click: 1, ring: 1.6, S: 1.3 }, { t: 2.4, to: ["03-category", "groupRow"], click: 1, ring: 2.4, S: 1.4 }, { t: 4.9, to: ["04-almari", "railShelf"], click: 1, ring: 1.8, S: 1.3 }] },

  { title: "نام سے تلاش", dur: 7.0, shots: [["02-list", 0], ["05-search", 2.4]],
    chips: [["تلاش کے خانے میں «تفسير» لکھیں", 0.4], ["تلاش صرف کتاب کے نام میں ہوتی ہے", 2.6], ["جو لکھا وہی ملتا ہے، فوراً", 4.5]],
    steps: [{ t: 0.4, to: ["02-list", "search"], click: 1, ring: 2.0, S: 1.6 }, { t: 3.2, to: ["05-search", "rows"], move: false, ring: 3.0, S: 1.25 }] },

  { title: "کتاب کی جھلک اور تفصیل", dur: 8.0, shots: [["02-list", 0], ["06-hover", 1.6], ["07-detail", 4.8]],
    chips: [["کتاب پر ماؤس رکھیں: جھلک", 0.4], ["دو بار کلک: مکمل تفصیل", 4.5], ["نیا «حفظ» بٹن، تبدیلی کے بعد روشن", 5.8]],
    steps: [{ t: 0.4, to: ["06-hover", "row"], ring: 2.6, S: 1.3 }, { t: 3.8, to: ["06-hover", "row"], click: 1, S: 1 }, { t: 5.9, to: ["07-detail", "save"], ring: 1.8, S: 1.7 }] },

  { title: "ترتیب اور Excel", dur: 8.0, shots: [["08-sort", 0], ["09-more", 3.6]],
    chips: [["عنوان پر کلک: اسی کے مطابق ترتیب", 0.4], ["دوبارہ کلک: الٹی ترتیب", 1.8], ["«المزيد» ← «تصدير إلى Excel»: فہرست فائل میں", 4.0]],
    steps: [{ t: 0.4, to: ["08-sort", "headTitle"], click: 1, ring: 2.8, S: 1.5 }, { t: 3.3, to: ["09-more", "more"], click: 1, ring: 1.4, S: 1.3 }, { t: 5.2, to: ["09-more", "excel"], ring: 2.4, S: 1.5 }] },

  { title: "نئی کتاب شامل کریں", dur: 8.0, shots: [["01-home", 0], ["10-add", 1.6]],
    chips: [["اوپر «إضافة» دبائیں", 0.4], ["نام، مؤلف، موضوع، جلدیں، شاخ اور خزانہ لکھیں", 2.6], ["«حفظ» دبائیں", 5.6]],
    steps: [{ t: 0.3, to: ["01-home", "addOne"], click: 1, ring: 1.2, S: 1.6 }, { t: 1.8, reset: true }, { t: 2.4, to: ["10-add", "title"], ring: 2.6, S: 1.3 }, { t: 5.4, to: ["10-add", "save"], click: 1, ring: 1.7, S: 1.5 }] },

  { title: "ترمیم اور «حفظ»", dur: 7.5, shots: [["11-edit", 0]],
    chips: [["کتاب کھول کر کوئی خانہ بدلیں", 0.4], ["«حفظ» روشن ہو جاتا ہے، دبائیں", 2.6], ["غلطی ہو تو «تراجع» اور «إعادة»", 5.0]],
    steps: [{ t: 0.4, to: ["11-edit", "category"], ring: 2.0, S: 1.5 }, { t: 2.6, to: ["11-edit", "save"], click: 1, ring: 2.0, S: 1.6 }, { t: 5.0, to: ["11-edit", "undo"], ring: 2.3, S: 1.4 }] },

  { title: "فائلیں منسلک کریں", dur: 9.0, shots: [["12-attach-pair", 0], ["13-attach-docs", 4.6]],
    chips: [["«إرفاق ملف»: PDF اور متن دونوں لگائیں", 0.4], ["Word، Excel، PowerPoint، EPUB اور تصویر: شکل «ملف آخر»", 4.8], ["«فتح الملف» اسے کمپیوٹر کے اپنے پروگرام میں کھولتا ہے", 6.8]],
    steps: [{ t: 0.4, to: ["12-attach-pair", "fileRow"], ring: 2.2, S: 1.35 }, { t: 2.8, to: ["12-attach-pair", "offset"], ring: 1.6, S: 1.5 }, { t: 4.8, to: ["13-attach-docs", "fileRow"], ring: 2.0, S: 1.4 }, { t: 6.9, to: ["13-attach-docs", "open0"], ring: 1.6, S: 1.7 }] },

  { title: "Word فائل ایپ کے اندر", dur: 7.5, shots: [["14-docx-reader", 0]],
    chips: [["Word فائل کے ساتھ «افتح في التطبيق وابحث» دبائیں", 0.4], ["سادہ متن کی طرح کھلتی ہے", 2.4], ["اندر تلاش، لفظ نمایاں اور نتائج کی فہرست", 4.2]],
    steps: [{ t: 0.4, to: ["14-docx-reader", "tabs"], ring: 1.8, S: 1.6 }, { t: 2.6, to: ["14-docx-reader", "text"], ring: 2.0, S: 1.25 }, { t: 4.4, to: ["14-docx-reader", "results"], ring: 2.8, S: 1.3 }] },

  { title: "متن میں تلاش، PDF اسی صفحے پر", dur: 10.0, shots: [["15-reader-marks", 0], ["16-pdf-page", 6.4]],
    chips: [["متن میں [ص 45] جیسے نشان ہوں تو نتیجے میں چھپا صفحہ نمبر آتا ہے", 0.4], ["«PDF صفحة» دبائیں", 3.6], ["اسکین ٹھیک اسی صفحے پر کھل جاتا ہے", 6.6], ["کتاب میں «فرق صفحات PDF» ایک بار لکھیں", 8.2]],
    steps: [{ t: 0.4, to: ["15-reader-marks", "pageCol"], ring: 2.6, S: 1.4 }, { t: 3.4, to: ["15-reader-marks", "pdfBtn"], click: 1, ring: 1.8, S: 1.6 }, { t: 6.2, reset: true }, { t: 6.6, to: ["16-pdf-page", "pdf"], move: false, ring: 2.8, S: 1.1 }] },

  { title: "کئی کتابیں ایک ساتھ", dur: 6.5, shots: [["17-tabs", 0]],
    chips: [["ہر کتاب ریڈر میں الگ ٹیب میں کھلتی ہے", 0.4], ["اوپر «الكتب المفتوحة» سے واپس آئیں", 2.6], ["ہر ٹیب اپنی تلاش اور صفحہ یاد رکھتا ہے", 4.2]],
    steps: [{ t: 0.4, to: ["17-tabs", "tabs"], ring: 3.2, S: 1.7 }, { t: 4.2, reset: true }] },

  { title: "کئی کتابوں کے متن میں تلاش", dur: 8.0, shots: [["18-fts", 0]],
    chips: [["اوپر «البحث» دبائیں، کتابوں پر ٹک لگائیں", 0.4], ["لفظ لکھ کر «ابحث» دبائیں", 3.0], ["ہر کتاب میں کتنی جگہ ملا", 5.2]],
    steps: [{ t: 0.4, to: ["18-fts", "ibSearch"], ring: 1.6, S: 1.4 }, { t: 2.2, to: ["18-fts", "term"], click: 1, ring: 1.8, S: 1.6 }, { t: 4.8, to: ["18-fts", "results"], ring: 2.8, S: 1.3 }] },

  { title: "کتاب جاری کریں", dur: 10.0, shots: [["19-issue-btn", 0], ["20-issue-form", 1.9], ["21-issue-confirm", 6.0], ["22-issued", 8.0]],
    chips: [["کتاب کھولیں: «إعارة الكتاب»", 0.4], ["نام، پتہ، فون اور کتنے دن", 2.6], ["تصدیق میں «إعارة الكتاب» دبائیں", 6.2], ["کتاب «معار» ہو گئی", 8.2]],
    steps: [{ t: 0.4, to: ["19-issue-btn", "issue"], click: 1, ring: 1.4, S: 1.5 }, { t: 2.4, to: ["20-issue-form", "borrower"], ring: 3.2, S: 1.35 }, { t: 5.2, to: ["20-issue-form", "save"], click: 1, ring: 0.9, S: 1.5 }, { t: 6.4, to: ["21-issue-confirm", "go"], click: 1, ring: 1.2, S: 1.5 }, { t: 8.2, to: ["22-issued", "tracking"], ring: 1.5, S: 1.3 }] },

  { title: "کتاب واپس لیں", dur: 7.5, shots: [["22-issued", 0], ["23-return-confirm", 3.2], ["24-returned", 5.6]],
    chips: [["جاری کتاب میں لینے والا اور واپسی کی تاریخ", 0.4], ["«تم الإرجاع» دبائیں اور تصدیق کریں", 2.4], ["کتاب دوبارہ «متوفر»", 5.7]],
    steps: [{ t: 0.4, to: ["22-issued", "ret"], click: 1, ring: 2.0, S: 1.4 }, { t: 3.4, to: ["23-return-confirm", "go"], click: 1, ring: 1.6, S: 1.5 }, { t: 5.8, to: ["24-returned", "tracking"], ring: 1.4, S: 1.3 }] },

  { title: "جاری اور میعاد ختم کتابیں", dur: 9.0, shots: [["25-tab-issued", 0], ["26-tab-overdue", 3.2], ["27-issued-list", 6.0]],
    chips: [["«معار» ٹیب: سب جاری کتابیں", 0.4], ["«متأخر»: واپسی کی تاریخ گزر چکی", 3.3], ["«المزيد» ← «الكتب المعارة»: مکمل فہرست", 6.2]],
    steps: [{ t: 0.4, to: ["25-tab-issued", "tab"], click: 1, ring: 2.2, S: 1.4 }, { t: 3.2, to: ["26-tab-overdue", "tab"], click: 1, ring: 2.4, S: 1.4 }, { t: 6.1, to: ["27-issued-list", "dlg"], ring: 2.4, S: 1.15 }] },

  { title: "کتاب حذف کریں", dur: 11.5, special: "delete", shots: [["28-delete-tick", 0], ["29-bin", 7.8]],
    chips: [["کتاب کے ساتھ والے خانے میں ٹک لگائیں", 0.4], ["اوپر «حذف» دبائیں، تصدیق پر OK", 2.8], ["کتاب «سلة المحذوفات» میں 30 دن رہتی ہے", 7.9], ["وہاں سے «استعادة» سے واپس لائیں", 9.6]],
    steps: [{ t: 0.4, to: ["28-delete-tick", "tick"], click: 1, ring: 1.6, S: 1.45 }, { t: 2.7, to: ["28-delete-tick", "del"], click: 1, ring: 1.6, S: 1.5 }, { t: 5.6, reset: true }, { t: 7.9, to: ["29-bin", "restore"], ring: 3.0, S: 1.3 }] },

  { title: "تبدیلیاں خود شائع ہوتی ہیں", dur: 8.0, shots: [["30-publish", 0]],
    chips: [["ہر تبدیلی چند سیکنڈ بعد خود شائع", 0.3], ["نئی کتاب، حذف اور منسلک فائلیں، سب کمپیوٹروں تک خود پہنچتی ہیں", 2.6], ["پڑھنے والے کمپیوٹر پر کچھ دبانا نہیں پڑتا", 5.0]],
    steps: [{ t: 0.3, to: ["30-publish", "publish"], ring: 6.0, S: 1.7 }] },

  { title: "سرورق کی تصویر", dur: 8.0, shots: [["33-cover", 0], ["34-cover-url", 3.9]],
    chips: [["تصویر کے خانے میں کمپیوٹر سے تصویر لگائیں", 0.5], ["یا «من الإنترنت»: لنک ڈالیں", 3.4], ["«حفظ» دبائیں", 6.0]],
    steps: [{ t: 0.4, to: ["33-cover", "cover"], ring: 3.0, S: 1.5 }, { t: 4.1, to: ["34-cover-url", "input"], ring: 2.8, S: 1.5 }] },

  { title: "رنگ اور لکھائی", dur: 6.5, shots: [["31-appearance", 0]],
    chips: [["اوپر «المظهر» دبائیں", 0.3], ["روشن یا تاریک انداز، اور رنگ", 2.2], ["لکھائی کا سائز اور ترتیب", 4.0]],
    steps: [{ t: 0.3, to: ["31-appearance", "appearance"], ring: 1.6, S: 1.4 }, { t: 2.2, to: ["31-appearance", "dlg"], ring: 3.6, S: 1.2 }] },

  { title: "موضوعات اور بیک اپ", dur: 7.5, shots: [["32-cats", 0], ["01-home", 3.8]],
    chips: [["«المزيد» ← «قائمة الموضوعات»", 0.3], ["نیا موضوع لکھ کر شامل کریں", 1.6], ["«نسخة احتياطية» سے محفوظ نقل بنائیں", 4.2]],
    steps: [{ t: 0.3, to: ["32-cats", "dlg"], ring: 3.2, S: 1.3 }, { t: 3.9, to: ["01-home", "backup"], click: 1, ring: 2.6, S: 1.6 }] },
];
const SCENES = SPEC.map(build);
if (MISSING.length) console.warn("MISSING RECTS (placeholder used):", MISSING.join(", "));

// ---- timing --------------------------------------------------------------
let t = INTRO - XF;
SCENES.forEach((s, i) => { s.i = i; s.start = +t.toFixed(2); t += s.dur - XF; });
const OUT_START = +t.toFixed(2);
const TOTAL = +(OUT_START + OUTRO).toFixed(2);

// ---- helpers -------------------------------------------------------------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const urdu = (n) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (v, a) => Math.max(-a, Math.min(a, v));
const camT = (S, cx, cy) => ({
  s: S,
  x: +clamp(-S * (cx - W / 2), (S - 1) * W / 2).toFixed(1),
  y: +clamp(-S * (cy - H / 2), (S - 1) * H / 2).toFixed(1),
});
const N = SCENES.length;
const clickPos = (s, at) => { let p = s.cur; for (const m of s.moves) if (m[0] + m[1] <= at + 0.01) p = [m[2], m[3]]; return p; };

const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2 L3 19 L7.6 14.9 L10.6 21.6 L13.6 20.3 L10.7 13.7 L17 13.7 Z" fill="#fff" stroke="#17222e" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

function sceneHTML(s) {
  const id = `s${s.i + 1}`;
  const imgs = s.shots.map(([n], k) =>
    `<img id="${id}-img${k}" class="shot" src="screens/${n}.png" alt="" style="opacity:${k === 0 ? 1 : 0}">`).join("");
  const rings = s.rings.map(([, , r], k) =>
    `<div id="${id}-ring${k}" class="ring" style="left:${r[0] - 7}px;top:${r[1] - 7}px;width:${r[2] + 14}px;height:${r[3] + 14}px"></div>`).join("");
  const clicks = s.clicks.map((at, k) => { const p = clickPos(s, at); return `<div id="${id}-rip${k}" class="ripple" style="left:${p[0] - 24}px;top:${p[1] - 24}px"></div>`; }).join("");
  let special = "";
  if (s.special === "delete") {
    special = `
      <div id="${id}-wash" class="wash" style="left:${R("28-delete-tick","row")[0]}px;top:${R("28-delete-tick","row")[1]}px;width:${R("28-delete-tick","row")[2]}px;height:${R("28-delete-tick","row")[3]}px"></div>
      <div id="${id}-confirm" class="confirm">
        <div class="cf-bar" data-layout-ignore>Maktaba Naumania</div>
        <div class="cf-msg">کیا یہ کتاب حذف کریں؟</div>
        <div class="cf-btns"><span class="cf-ok" data-layout-ignore>OK</span><span class="cf-cancel" data-layout-ignore>Cancel</span></div>
      </div>
      <div id="${id}-toast" class="toast">کتاب «سلة المحذوفات» میں گئی</div>`;
  }
  const chips = s.chips.map(([txt], k) => `
      <div id="${id}-chip${k}" class="chip">
        <div class="chip-bg" id="${id}-chipbg${k}"></div>
        <div class="chip-n"><div class="chip-nbg" id="${id}-chipn${k}"></div><span id="${id}-chipd${k}">${k + 1}</span></div>
        <div class="chip-t" id="${id}-chipt${k}">${esc(txt)}</div>
      </div>`).join("");
  return `
  <section id="${id}" class="clip scene" data-start="${s.start}" data-duration="${s.dur}" data-track-index="${1 + (s.i % 2)}">
    <div class="sc-screen" id="${id}-screen">
      <div class="scaler"><div class="world" id="${id}-world">
        ${imgs}${rings}${special}${clicks}
        <div class="cursor" id="${id}-cursor">${CURSOR_SVG}</div>
      </div></div>
    </div>
    <div class="rail" id="${id}-rail" dir="rtl">
      <div class="step" id="${id}-step"><span class="step-n">${pad2(s.i + 1)}</span><span class="step-of">/ ${pad2(N)}</span></div>
      <div class="rule" id="${id}-rule"></div>
      <h2 class="title" id="${id}-title">${esc(s.title)}</h2>
      <div class="chips">${chips}</div>
    </div>
  </section>`;
}

const segW = (FRAME.w - (N - 1) * 8) / N;
const segs = SCENES.map((s, i) =>
  `<div class="seg" style="right:${(FRAME.x + i * (segW + 8)).toFixed(1)}px;width:${segW.toFixed(1)}px"><div class="seg-fill" id="seg${i}"></div></div>`).join("");

// ---- timeline script -----------------------------------------------------
const js = [];
js.push(`const tl = gsap.timeline({ paused: true });`);
// background ambience
js.push(`tl.fromTo("#glowA", { scale: 1, x: 0 }, { scale: 1.12, x: 40, duration: ${(TOTAL / 4).toFixed(2)}, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0);`);
js.push(`tl.fromTo("#glowB", { scale: 1.1, y: 0 }, { scale: 1, y: -50, duration: ${(TOTAL / 4).toFixed(2)}, ease: "sine.inOut", yoyo: true, repeat: 3 }, 0);`);
js.push(`tl.fromTo("#dots", { x: 0, y: 0 }, { x: 56, y: -56, duration: ${TOTAL}, ease: "none" }, 0);`);
// intro
js.push(`tl.fromTo("#introLogo", { scale: 0.82, rotation: -6 }, { scale: 1, rotation: 0, duration: 0.9, ease: "back.out(1.6)" }, 0);`);
js.push(`tl.fromTo("#introTitle", { y: 26 }, { y: 0, duration: 0.8, ease: "power3.out" }, 0);`);
js.push(`tl.fromTo("#introSub", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }, 1.2);`);
js.push(`tl.fromTo("#introPill", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, 1.7);`);
js.push(`tl.fromTo("#introRule", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "power3.inOut" }, 1.0);`);
js.push(`tl.fromTo("#introIn", { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96, duration: 0.5, ease: "power2.in", immediateRender: false }, ${INTRO - 0.7});`);
// chrome in / out
js.push(`tl.fromTo("#frameWrap", { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, ${INTRO - 0.5});`);
js.push(`tl.fromTo("#topbar", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }, ${INTRO - 0.3});`);
js.push(`tl.fromTo("#progress", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${INTRO - 0.2});`);
js.push(`tl.fromTo("#chromeIn", { opacity: 1 }, { opacity: 0, duration: 0.6, ease: "power2.in", immediateRender: false }, ${OUT_START - 0.1});`);
// outro
js.push(`tl.fromTo("#outroLogo", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "back.out(1.5)" }, ${OUT_START + 0.4});`);
js.push(`tl.fromTo("#outroTitle", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, ${OUT_START + 0.8});`);
js.push(`tl.fromTo("#outroSub", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }, ${OUT_START + 1.2});`);
js.push(`tl.fromTo("#outroTag", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, ${OUT_START + 1.8});`);

for (const s of SCENES) {
  const id = `s${s.i + 1}`, T0 = s.start, g = (x) => +(T0 + x).toFixed(3);
  // progress segment
  js.push(`tl.fromTo("#seg${s.i}", { scaleX: 0 }, { scaleX: 1, duration: ${s.dur - XF}, ease: "none" }, ${g(0)});`);
  // screen crossfade in / out
  js.push(`tl.fromTo("#${id}-screen", { opacity: 0 }, { opacity: 1, duration: ${XF}, ease: "none" }, ${g(0)});`);
  // rail: out first, then the next one in, so two titles never overlap
  js.push(`tl.fromTo("#${id}-rail", { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power1.in", immediateRender: false }, ${g(s.dur - 0.55)});`);
  js.push(`tl.fromTo("#${id}-step", { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${g(0.3)});`);
  js.push(`tl.fromTo("#${id}-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.inOut" }, ${g(0.35)});`);
  js.push(`tl.fromTo("#${id}-title", { y: 44, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "power4.out" }, ${g(0.38)});`);
  s.chips.forEach(([, at], k) => {
    js.push(`tl.fromTo("#${id}-chip${k}", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power2.out" }, ${g(0.5 + k * 0.09)});`);
    const a = Math.max(at, 0.6 + k * 0.09);
    js.push(`tl.fromTo("#${id}-chipbg${k}", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.8)" }, ${g(a)});`);
    js.push(`tl.fromTo("#${id}-chipn${k}", { scale: 0 }, { scale: 1, duration: 0.3, ease: "back.out(2.2)" }, ${g(a)});`);
    js.push(`tl.fromTo("#${id}-chipt${k}", { color: "#56657a" }, { color: "#17222e", duration: 0.3, ease: "none" }, ${g(a)});`);
    js.push(`tl.fromTo("#${id}-chipd${k}", { color: "#56657a" }, { color: "#ffffff", duration: 0.2, ease: "none" }, ${g(a + 0.05)});`);
  });
  // shots
  s.shots.forEach(([, at], k) => { if (k) js.push(`tl.fromTo("#${id}-img${k}", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.inOut" }, ${g(at)});`); });
  // camera (viewport-change, single wrapper, T = -offset × S)
  js.push(`{ const w = document.getElementById("${id}-world"); const c = { s: 1, x: 0, y: 0 };
    const ap = () => { w.style.transform = "translate(" + c.x + "px," + c.y + "px) scale(" + c.s + ")"; }; ap();`);
  let prev = { s: 1, x: 0, y: 0 };
  for (const [at, dur, S, cx, cy] of s.cam) {
    const n = camT(S, cx, cy);
    js.push(`  tl.fromTo(c, { s: ${prev.s}, x: ${prev.x}, y: ${prev.y} }, { s: ${n.s}, x: ${n.x}, y: ${n.y}, duration: ${dur}, ease: "power3.inOut", onUpdate: ap, immediateRender: false, overwrite: "auto" }, ${g(at)});`);
    prev = n;
  }
  js.push(`}`);
  // cursor
  js.push(`tl.fromTo("#${id}-cursor", { x: ${s.cur[0]}, y: ${s.cur[1]}, opacity: 0 }, { x: ${s.cur[0]}, y: ${s.cur[1]}, opacity: 1, duration: 0.3 }, ${g(0.1)});`);
  let cp = s.cur;
  for (const [at, dur, x, y] of s.moves) {
    js.push(`tl.fromTo("#${id}-cursor", { x: ${cp[0]}, y: ${cp[1]} }, { x: ${x}, y: ${y}, duration: ${dur}, ease: "power2.inOut", immediateRender: false, overwrite: "auto" }, ${g(at)});`);
    cp = [x, y];
  }
  s.clicks.forEach((at, k) => {
    // cursor position at the click = last move that ended before it
    js.push(`tl.to("#${id}-cursor", { scale: 0.82, duration: 0.08, ease: "power2.in", yoyo: true, repeat: 1, transformOrigin: "0 0" }, ${g(at)});`);
    js.push(`tl.fromTo("#${id}-rip${k}", { scale: 0, opacity: 0.9 }, { scale: 3.2, opacity: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, ${g(at + 0.02)});`);
  });
  // highlight rings
  s.rings.forEach(([a, b], k) => {
    js.push(`tl.fromTo("#${id}-ring${k}", { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${g(a)});`);
    js.push(`tl.fromTo("#${id}-ring${k}", { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power1.in", immediateRender: false }, ${g(b)});`);
  });
  if (s.special === "delete") {
    js.push(`tl.fromTo("#${id}-confirm", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.8)" }, ${g(3.9)});`);
    js.push(`tl.to("#${id}-confirm", { scale: 0.9, opacity: 0, duration: 0.25, ease: "power2.in" }, ${g(6.0)});`);
    js.push(`tl.fromTo("#${id}-wash", { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.45, ease: "power3.out" }, ${g(6.1)});`);
    js.push(`tl.fromTo("#${id}-toast", { y: 40, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, ${g(6.5)});`);
  }
}
js.push(`window.__timelines["main"] = tl;`);

// ---- html ----------------------------------------------------------------
const html = `<!doctype html>
<html lang="ur">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>Maktaba Naumania: how to use</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face { font-family: "Jameel Noori Nastaleeq"; src: url("assets/JameelNooriNastaleeq.ttf") format("truetype"); font-display: block; }
:root { --bg: #edf2f7; --ink: #17222e; --muted: #56657a; --blue: #125fb0; --blue-2: #1873cf; --green: #14724a; --line: #c9d3df; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--bg); }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); font-family: "Jameel Noori Nastaleeq", serif; color: var(--ink); }
.ur { font-family: "Jameel Noori Nastaleeq", serif; }
.mono { font-family: "Space Mono", monospace; }

/* background */
#bgLayer { position: absolute; inset: 0; overflow: hidden; }
#dots { position: absolute; inset: -80px; background-image: radial-gradient(circle, rgba(18,95,176,0.22) 1.6px, transparent 1.8px); background-size: 28px 28px; }
.glow { position: absolute; border-radius: 50%; }
#glowA { width: 1100px; height: 1100px; left: -380px; top: -460px; background: radial-gradient(circle, rgba(18,95,176,0.26) 0%, rgba(18,95,176,0) 68%); }
#glowB { width: 1000px; height: 1000px; right: -360px; bottom: -520px; background: radial-gradient(circle, rgba(20,114,74,0.22) 0%, rgba(20,114,74,0) 68%); }

/* intro / outro */
.center-card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
#introLogo, #outroLogo { width: 230px; height: 230px; border-radius: 50%; object-fit: cover; box-shadow: 0 24px 60px rgba(18,52,90,0.22); border: 6px solid #fff; }
#introTitle, #outroTitle { font-size: 150px; line-height: 1.55; margin-top: 18px; color: var(--ink); }
#introRule { width: 520px; height: 5px; border-radius: 3px; background: var(--blue); transform-origin: 50% 50%; }
#introSub, #outroSub { font-size: 58px; line-height: 1.9; color: #2b3847; }
.pill { font-size: 36px; line-height: 1.9; padding: 4px 38px 10px; border-radius: 999px; background: var(--blue); color: #fff; }
#outroTag { background: var(--green); }

/* chrome */
#topbar { position: absolute; top: 34px; left: ${FRAME.x}px; right: ${FRAME.x}px; height: 70px; display: flex; align-items: center; justify-content: space-between; }
#brand { display: flex; align-items: center; gap: 18px; }
#brand img { width: 62px; height: 62px; border-radius: 50%; object-fit: cover; border: 3px solid #fff; box-shadow: 0 6px 16px rgba(18,52,90,0.18); }
#brand span { font-size: 46px; line-height: 1.6; }
#topPill { font-size: 30px; line-height: 1.8; padding: 2px 30px 8px; border-radius: 999px; background: #fff; border: 2px solid var(--line); color: #2b3847; }
#frameWrap { position: absolute; left: ${FRAME.x}px; top: ${FRAME.y}px; width: ${FRAME.w}px; height: ${FRAME.chrome + SCREEN_H}px; border-radius: 16px; background: #fff; border: 2px solid var(--line); box-shadow: 0 40px 90px rgba(18,52,90,0.22), 0 8px 20px rgba(18,52,90,0.10); overflow: hidden; }
#frameBar { height: ${FRAME.chrome}px; background: #f6f8fb; border-bottom: 2px solid #e1e7ef; display: flex; align-items: center; justify-content: center; position: relative; }
#frameBar span { font-size: 22px; line-height: 1.7; color: #3b4857; }
.wc { position: absolute; right: 18px; top: 0; height: 100%; display: flex; gap: 22px; align-items: center; }
.wc i { display: block; width: 14px; height: 14px; border: 2px solid #7a8797; border-radius: 3px; }
.wc i:first-child { height: 2px; border-width: 1px; border-radius: 0; background: #7a8797; }
#progress { position: absolute; top: ${FRAME.y + FRAME.chrome + SCREEN_H + 30}px; left: 0; width: 1920px; height: 8px; }
.seg { position: absolute; top: 0; height: 8px; border-radius: 4px; background: #d6dee8; overflow: hidden; }
.seg-fill { width: 100%; height: 100%; background: var(--blue); transform-origin: 100% 50%; }

/* scenes */
.scene { position: absolute; inset: 0; }
.sc-screen { position: absolute; left: ${FRAME.x + 2}px; top: ${SCREEN_Y + 2}px; width: ${FRAME.w - 4}px; height: ${SCREEN_H - 4}px; overflow: hidden; border-radius: 0 0 14px 14px; background: #eaeef3; }
.scaler { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform: scale(${(FRAME.w - 4) / W}); transform-origin: 0 0; }
.world { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 50% 50%; will-change: transform; }
.shot { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; display: block; }
.ring { position: absolute; border-radius: 12px; border: 4px solid var(--blue); box-shadow: 0 0 0 7px rgba(24,115,207,0.20), 0 0 28px rgba(24,115,207,0.45); opacity: 0; }
.ripple { position: absolute; left: 0; top: 0; width: 48px; height: 48px; border-radius: 50%; border: 4px solid var(--blue-2); opacity: 0; }
.cursor { position: absolute; left: 0; top: 0; width: 34px; height: 34px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35)); opacity: 0; }
.cursor svg { display: block; }
.wash { position: absolute; background: rgba(178,49,39,0.30); border: 3px solid #b23127; border-radius: 6px; transform-origin: 100% 50%; opacity: 0; }
.confirm { position: absolute; left: 565px; top: 335px; width: 470px; height: 190px; background: #fff; border: 1px solid #b9c3cf; border-radius: 10px; box-shadow: 0 30px 70px rgba(0,0,0,0.30); opacity: 0; overflow: hidden; direction: ltr; }
.cf-bar { height: 40px; padding: 8px 16px; background: #f3f3f3; font-family: "Segoe UI", sans-serif; font-size: 17px; color: #444; }
.cf-msg { padding: 8px 22px 0; text-align: right; font-size: 30px; line-height: 1.8; color: #111; direction: rtl; }
.cf-btns { position: absolute; right: 18px; bottom: 16px; display: flex; gap: 12px; }
.cf-btns span { width: 96px; height: 36px; display: grid; place-items: center; border-radius: 5px; font-family: "Segoe UI", sans-serif; font-size: 18px; }
.cf-ok { background: #fff; border: 2px solid #0067c0; color: #111; }
.cf-cancel { background: #fbfbfb; border: 1px solid #c8c8c8; color: #111; }
.toast { position: absolute; left: 560px; top: 780px; width: 480px; height: 76px; border-radius: 14px; background: #1b2733; color: #fff; display: grid; place-items: center; font-size: 34px; line-height: 1.6; box-shadow: 0 18px 40px rgba(0,0,0,0.30); opacity: 0; }

/* caption rail */
.rail { position: absolute; top: ${SCREEN_Y - 10}px; right: 64px; width: 408px; height: ${SCREEN_H + 20}px; text-align: right; }
.step { display: flex; align-items: baseline; gap: 12px; justify-content: flex-start; }
.step-n { font-family: "Space Mono", monospace; font-weight: 700; font-size: 64px; color: var(--blue); line-height: 1; }
.step-of { font-family: "Space Mono", monospace; font-weight: 400; font-size: 28px; color: var(--muted); }
.rule { width: 100%; height: 4px; margin: 20px 0 6px; border-radius: 2px; background: linear-gradient(to left, var(--blue), rgba(18,95,176,0.08)); transform-origin: 100% 50%; }
.title { font-weight: 400; font-size: 64px; line-height: 1.75; color: var(--ink); }
.chips { margin-top: 16px; display: flex; flex-direction: column; gap: 14px; }
.chip { position: relative; display: flex; align-items: flex-start; gap: 16px; padding: 12px 16px 12px 16px; }
.chip-bg { position: absolute; inset: 0; border-radius: 16px; background: #fff; border: 2px solid #d3dce7; box-shadow: 0 10px 24px rgba(18,52,90,0.10); opacity: 0; }
.chip-n { position: relative; flex: none; width: 44px; height: 44px; margin-top: 8px; border-radius: 50%; border: 2px solid #9fb0c4; display: grid; place-items: center; }
.chip-nbg { position: absolute; inset: -2px; border-radius: 50%; background: var(--blue); }
.chip-n span { position: relative; font-family: "Space Mono", monospace; font-weight: 700; font-size: 22px; color: var(--muted); }
.chip-t { position: relative; font-size: 31px; line-height: 1.85; color: var(--muted); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${TOTAL}">

  <div id="bgLayer" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="0">
    <div id="dots" data-layout-allow-overflow></div><div id="glowA" class="glow" data-layout-allow-overflow></div><div id="glowB" class="glow" data-layout-allow-overflow></div>
  </div>

  <section id="intro" class="clip" data-start="0" data-duration="${INTRO}" data-track-index="3">
    <div id="introIn" class="center-card" dir="rtl">
      <img id="introLogo" src="assets/logo.png" alt="">
      <div id="introTitle" class="ur">مکتبہ نعمانیہ</div>
      <div id="introRule"></div>
      <div id="introSub" class="ur">ایپ استعمال کرنے کا مکمل طریقہ</div>
      <div id="introPill" class="pill ur">لائبریری عملے کے لیے، ${urdu(N)} آسان مراحل · ورژن ۱٫۱۴</div>
    </div>
  </section>

  <div id="chrome" class="clip" data-start="${INTRO - 0.6}" data-duration="${(OUT_START - INTRO + 1.2).toFixed(2)}" data-track-index="4">
    <div id="chromeIn" style="position:absolute;inset:0">
      <div id="topbar" dir="rtl">
        <div id="brand"><img src="assets/logo.png" alt=""><span class="ur">مکتبہ نعمانیہ</span></div>
        <div id="topPill" class="ur">استعمال کا طریقہ</div>
      </div>
      <div id="frameWrap"><div id="frameBar"><span class="ur">مکتبہ نعمانیہ · لوحہ کنٹرول</span><div class="wc"><i></i><i></i><i></i></div></div></div>
      <div id="progress">${segs}</div>
    </div>
  </div>
${SCENES.map(sceneHTML).join("\n")}

  <section id="outro" class="clip" data-start="${OUT_START}" data-duration="${OUTRO}" data-track-index="3">
    <div class="center-card" dir="rtl">
      <img id="outroLogo" src="assets/logo.png" alt="">
      <div id="outroTitle" class="ur">مکتبہ نعمانیہ</div>
      <div id="outroSub" class="ur">جامعہ نعمانیہ، لیاری، کراچی</div>
      <div id="outroTag" class="pill ur">ہر کتاب، چند سیکنڈ میں</div>
    </div>
  </section>
</div>
<script>
${js.join("\n")}
</script>
</body>
</html>
`;
writeFileSync(new URL("./index.html", import.meta.url), html);
console.log(`scenes ${N}, total ${TOTAL}s, outro at ${OUT_START}s`);
