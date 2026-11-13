// Generates index.html from the scene table below. Run: node build.mjs
// App-space coordinates are CSS px of the app at 1600x900 (the screenshots are 2x).
import { writeFileSync } from "node:fs";

const W = 1600, H = 900;
const FRAME = { x: 64, y: 128, w: 1328, chrome: 38 };
const K = FRAME.w / W; // 0.83
const SCREEN_Y = FRAME.y + FRAME.chrome;
const SCREEN_H = Math.round(H * K);

const INTRO = 5.0, OUTRO = 5.5, XF = 0.4;

// ---- scene table ---------------------------------------------------------
// cam: [at, dur, S, cx, cy]  · move: [at, dur, x, y]  · click: at
// ring: [from, to, [x,y,w,h]] · chips: [text, activateAt] · shots: [name, at]
const SCENES = [
  { title: "لائبریری کھولیں", dur: 6.0, cur: [1150, 560],
    chips: [["سرورق پر «لائبریری کھولیں» دبائیں", 0.5], ["کتابوں کی فہرست کھل جاتی ہے", 3.4]],
    shots: [["01-home", 0], ["02-list", 3.3]],
    cam: [[0.4, 1.4, 1.35, 800, 760], [3.1, 1.0, 1, 800, 450]],
    moves: [[0.9, 0.9, 800, 782]], clicks: [2.0],
    rings: [[1.2, 3.1, [717, 756, 166, 53]]] },

  { title: "کتابوں کی فہرست", dur: 6.0, cur: [800, 700],
    chips: [["ہر سطر میں نمبر، مصنف اور کتاب", 0.4], ["اوپر کے ٹیب: موجود، معار، مطلوب", 1.4], ["سرخ نشان: کتاب اس وقت موجود نہیں", 3.8]],
    shots: [["02-list", 0]],
    cam: [[0.5, 1.4, 1.45, 1180, 300], [3.0, 1.2, 1.5, 900, 400]],
    moves: [[1.2, 0.9, 1230, 148], [3.4, 0.8, 1100, 374]], clicks: [],
    rings: [[1.4, 3.0, [1010, 125, 445, 48]], [3.8, 5.6, [356, 354, 1109, 41]]] },

  { title: "موضوع اور الماری سے دیکھیں", dur: 8.0, cur: [1100, 374],
    chips: [["دائیں پٹی سے «موضوع» چنیں", 0.4], ["موضوع پر کلک: اس کی سب کتابیں", 2.2], ["«الماری» سے الماری وار فہرست", 4.4]],
    shots: [["02-list", 0], ["03-category", 1.7], ["04-almari", 5.5]],
    cam: [[0.3, 1.0, 1.35, 1300, 320], [5.6, 1.0, 1.2, 1200, 400]],
    moves: [[0.5, 0.8, 1521, 240], [2.2, 0.7, 1348, 288], [4.4, 0.7, 1521, 396]], clicks: [1.4, 3.0, 5.2],
    rings: [[2.6, 4.3, [1232, 270, 233, 36]]] },

  { title: "نام سے تلاش", dur: 6.5, cur: [1521, 396],
    chips: [["تلاش کے خانے میں لکھیں", 0.4], ["نام یا مصنف، دونوں سے ملتی ہے", 2.4], ["نتیجہ فوراً سامنے", 4.0]],
    shots: [["02-list", 0], ["05-search", 2.3]],
    cam: [[0.3, 1.2, 1.7, 1180, 205], [3.4, 1.2, 1.35, 1000, 330]],
    moves: [[0.5, 0.8, 1250, 205]], clicks: [1.4],
    rings: [[1.3, 3.4, [408, 182, 1010, 47]], [4.0, 6.0, [356, 272, 1109, 83]]] },

  { title: "کتاب کی تفصیل", dur: 7.5, cur: [1250, 205],
    chips: [["کتاب پر ماؤس رکھیں: جھلک", 0.4], ["کلک کریں: مکمل تفصیل اور سرورق", 4.3]],
    shots: [["02-list", 0], ["06-hover", 1.6], ["09-detail", 4.6]],
    cam: [[0.3, 1.0, 1.3, 1150, 560], [4.6, 1.0, 1.25, 800, 400]],
    moves: [[0.4, 0.9, 700, 456], [3.6, 0.5, 660, 456]], clicks: [4.3],
    rings: [[2.0, 3.9, [1040, 436, 525, 350]]] },

  { title: "کتاب کے متن میں تلاش", dur: 8.0, cur: [660, 456],
    chips: [["«متن میں تلاش» کے خانے میں لفظ لکھیں", 0.5], ["«تلاش کریں» دبائیں", 3.0], ["ہر کتاب میں کتنی جگہ ملا", 4.4]],
    shots: [["02-list", 0], ["07-fts", 2.4]],
    cam: [[0.3, 1.2, 1.75, 190, 400]],
    moves: [[0.6, 0.9, 180, 220], [3.0, 0.7, 257, 484]], clicks: [1.7, 3.9],
    rings: [[1.4, 2.9, [55, 203, 238, 35]], [3.0, 4.3, [192, 464, 130, 39]], [4.4, 7.6, [55, 540, 267, 95]]] },

  { title: "کتاب پڑھیں", dur: 8.5, cur: [700, 400],
    chips: [["نتیجے پر کلک: کتاب کھل جاتی ہے", 0.4], ["تلاش کا لفظ نمایاں", 2.0], ["نیچے ہر نتیجہ، باب اور صفحے کے ساتھ", 4.8]],
    shots: [["08-reader", 0]],
    cam: [[1.8, 1.4, 2.0, 820, 232], [4.6, 1.3, 1.35, 800, 690]],
    moves: [[0.4, 0.8, 1400, 646], [5.0, 0.8, 1200, 646]], clicks: [1.4],
    rings: [[2.8, 4.4, [796, 216, 50, 32]], [5.2, 8.1, [29, 628, 1555, 37]]] },

  { title: "نئی کتاب شامل کریں", dur: 8.5, cur: [800, 600],
    chips: [["اوپر «شامل کریں» دبائیں", 0.4], ["نام، مصنف، موضوع اور جلدیں لکھیں", 2.6], ["«محفوظ کریں» دبائیں", 5.2]],
    shots: [["01-home", 0], ["10-add", 1.8]],
    cam: [[0.2, 1.0, 1.6, 1480, 60], [1.9, 1.1, 1.45, 1386, 300], [4.4, 1.0, 1.45, 1386, 640], [7.2, 0.9, 1, 800, 450]],
    moves: [[0.4, 0.9, 1557, 30], [2.4, 0.8, 1450, 229], [4.8, 0.8, 1532, 817]], clicks: [1.5, 5.8],
    rings: [[1.0, 1.9, [1528, 7, 58, 50]], [2.6, 4.2, [1208, 205, 373, 48]], [5.0, 6.6, [1485, 793, 95, 49]]] },

  { title: "سرورق کی تصویر لگائیں", dur: 8.0, cur: [1532, 817],
    chips: [["تصویر کے خانے پر کلک: کمپیوٹر سے", 0.7], ["یا «انٹرنیٹ سے تصویر»: لنک ڈالیں", 2.5], ["«محفوظ کریں» دبائیں", 5.8]],
    shots: [["11a-cover-empty", 0], ["11b-cover-url", 3.9]],
    cam: [[0.2, 1.1, 1.6, 805, 280], [3.9, 1.1, 1.7, 1386, 110]],
    moves: [[0.5, 0.9, 805, 225], [2.5, 0.7, 647, 322], [5.4, 0.7, 1532, 180]], clicks: [3.4, 6.3],
    rings: [[0.9, 2.4, [493, 165, 625, 121]], [2.5, 3.8, [493, 300, 309, 44]], [4.6, 5.8, [1192, 89, 390, 41]]] },

  { title: "کتاب جاری کریں", dur: 9.5, cur: [800, 640],
    chips: [["کتاب کھولیں: «کتاب جاری کریں»", 0.4], ["نام، پتہ، فون اور کتنے دن", 2.5], ["تصدیق میں «کتاب جاری کریں» دبائیں", 6.2], ["شعبے کو دینا ہو تو «شعبے کو منتقل کریں»", 8.2]],
    shots: [["c1-detail-circ", 0], ["c2-issue-form", 1.9], ["c3-issue-confirm", 6.0], ["c4-issued-detail", 8.0]],
    cam: [[0.2, 1.0, 1.3, 800, 480], [2.0, 1.0, 1.5, 1386, 300], [6.0, 0.9, 1.6, 1376, 160], [8.0, 0.9, 1.15, 800, 450]],
    moves: [[0.5, 0.8, 805, 479], [2.4, 0.7, 1450, 220], [4.4, 0.8, 1521, 594], [6.6, 0.7, 1521, 272]], clicks: [1.5, 5.5, 7.6],
    rings: [[0.9, 1.8, [493, 382, 625, 194]], [2.6, 3.5, [1192, 200, 390, 41]], [3.5, 4.4, [1192, 426, 390, 119]], [6.3, 7.5, [1463, 248, 117, 49]]] },

  { title: "کتاب واپس لیں", dur: 8.0, cur: [800, 700],
    chips: [["جاری کتاب میں لینے والا اور واپسی کی تاریخ", 0.4], ["«واپس موصول ہوئی» دبائیں", 2.4], ["تصدیق کریں: کتاب دوبارہ موجود", 4.2]],
    shots: [["c4-issued-detail", 0], ["c8-return-confirm", 3.4], ["c9-returned", 5.6]],
    cam: [[0.2, 1.0, 1.35, 800, 420], [3.4, 0.9, 1.6, 1376, 145], [5.6, 0.9, 1.3, 800, 480]],
    moves: [[1.0, 0.7, 700, 440], [2.3, 0.6, 805, 590], [3.9, 0.7, 1518, 248]], clicks: [3.0, 5.1],
    rings: [[0.8, 2.3, [493, 406, 625, 76]], [2.4, 3.2, [493, 493, 625, 194]], [4.0, 5.0, [1457, 224, 122, 49]], [6.2, 7.6, [493, 382, 625, 194]]] },

  { title: "جاری اور میعاد ختم کتابیں", dur: 8.5, cur: [800, 600],
    chips: [["«معار» ٹیب: سب جاری کتابیں", 0.4], ["«میعاد ختم»: جن کی واپسی کی تاریخ گزر گئی", 3.0], ["مزید: «جاری شدہ کتابیں» کی مکمل فہرست", 5.8]],
    shots: [["c5-tab-issued", 0], ["c6-tab-overdue", 3.2], ["c7-issued-list", 5.6]],
    cam: [[0.2, 1.0, 1.4, 1000, 260], [5.6, 0.9, 1.25, 1152, 160]],
    moves: [[0.4, 0.8, 1226, 149], [2.3, 0.7, 1048, 149]], clicks: [1.3, 3.0],
    rings: [[0.8, 2.6, [1188, 125, 76, 48]], [1.3, 3.0, [344, 271, 1121, 82]], [3.5, 5.4, [344, 271, 1121, 41]], [6.2, 8.1, [704, 4, 896, 272]]] },

  { title: "کتاب حذف کریں", dur: 9.5, cur: [1200, 500], special: "delete",
    chips: [["کتاب کے ساتھ والے خانے میں ٹک لگائیں", 0.3], ["اوپر «حذف کریں» دبائیں", 2.9], ["تصدیق پر OK: کئی کتابیں ایک ساتھ بھی", 4.6]],
    shots: [["02-list", 0], ["14-delete-tick", 1.8]],
    cam: [[0.2, 1.1, 1.45, 1150, 661], [2.6, 1.1, 1, 800, 450], [4.3, 0.6, 1.5, 800, 440], [6.1, 0.8, 1.15, 900, 600]],
    moves: [[0.6, 0.9, 1457, 661], [3.0, 0.9, 1436, 30], [4.9, 0.7, 880, 495]], clicks: [1.7, 4.1, 5.9],
    rings: [[1.2, 2.6, [1446, 650, 22, 22]], [3.2, 4.5, [1407, 7, 58, 50]]] },

  { title: "تبدیلیاں خود شائع ہوتی ہیں", dur: 7.0, cur: [1540, 860],
    chips: [["ہر تبدیلی چند سیکنڈ بعد خود بخود", 0.3], ["باقی کمپیوٹروں تک فوراً پہنچتی ہے", 2.6], ["اختلاف کا پیغام آئے تو OK دبائیں", 4.4]],
    shots: [["15-published", 0]],
    cam: [[0.2, 1.3, 1.8, 800, 800], [4.2, 1.1, 1, 800, 450]],
    moves: [], clicks: [],
    rings: [[1.2, 3.6, [737, 800, 126, 48]]] },

  { title: "رنگ اور لکھائی", dur: 6.5, cur: [800, 600],
    chips: [["اوپر «مظہر» دبائیں", 0.3], ["روشن یا تاریک انداز، اور رنگ", 2.4], ["لکھائی کا سائز اور ترتیب", 4.1]],
    shots: [["01-home", 0], ["16-appearance", 1.5]],
    cam: [[0.2, 0.9, 1.6, 1105, 60], [1.6, 1.0, 1.35, 1180, 300]],
    moves: [[0.3, 0.8, 1105, 30]], clicks: [1.2],
    rings: [[0.8, 1.6, [1076, 7, 58, 50]], [2.4, 3.9, [1320, 160, 268, 125]], [4.1, 6.2, [956, 327, 624, 45]]] },

  { title: "موضوعات اور بیک اپ", dur: 7.0, cur: [800, 600],
    chips: [["مزید: «موضوعات کی فہرست»", 0.3], ["نیا موضوع لکھ کر شامل کریں", 1.4], ["«بیک اپ» سے محفوظ نقل بنائیں", 4.3]],
    shots: [["18-cats", 0], ["01-home", 3.6]],
    cam: [[0.2, 1.0, 1.5, 1300, 300], [3.7, 1.0, 1.6, 1331, 60]],
    moves: [[1.0, 0.8, 1350, 86], [2.4, 0.6, 1076, 86], [4.0, 0.8, 1361, 30]], clicks: [3.1, 5.0],
    rings: [[1.3, 2.6, [1127, 63, 455, 46]], [4.3, 6.6, [1332, 7, 58, 50]]] },
];

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
      <div id="${id}-wash" class="wash" style="left:356px;top:641px;width:1109px;height:41px"></div>
      <div id="${id}-confirm" class="confirm">
        <div class="cf-bar">Maktaba Naumania</div>
        <div class="cf-msg">«نور الایضاح» حذف کریں؟</div>
        <div class="cf-btns"><span class="cf-ok">OK</span><span class="cf-cancel">Cancel</span></div>
      </div>
      <div id="${id}-toast" class="toast">کتاب حذف ہو گئی</div>`;
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
js.push(`tl.fromTo("#introLogo", { scale: 0, rotation: -8 }, { scale: 1, rotation: 0, duration: 0.8, ease: "back.out(1.6)" }, 0.3);`);
js.push(`tl.fromTo("#introTitle", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, 0.8);`);
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
    js.push(`  tl.fromTo(c, { s: ${prev.s}, x: ${prev.x}, y: ${prev.y} }, { s: ${n.s}, x: ${n.x}, y: ${n.y}, duration: ${dur}, ease: "power3.inOut", onUpdate: ap, immediateRender: false }, ${g(at)});`);
    prev = n;
  }
  js.push(`}`);
  // cursor
  js.push(`tl.fromTo("#${id}-cursor", { x: ${s.cur[0]}, y: ${s.cur[1]}, opacity: 0 }, { x: ${s.cur[0]}, y: ${s.cur[1]}, opacity: 1, duration: 0.3 }, ${g(0.1)});`);
  let cp = s.cur;
  for (const [at, dur, x, y] of s.moves) {
    js.push(`tl.fromTo("#${id}-cursor", { x: ${cp[0]}, y: ${cp[1]} }, { x: ${x}, y: ${y}, duration: ${dur}, ease: "power2.inOut", immediateRender: false }, ${g(at)});`);
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
    js.push(`tl.fromTo("#${id}-confirm", { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.8)" }, ${g(4.4)});`);
    js.push(`tl.to("#${id}-confirm", { scale: 0.9, opacity: 0, duration: 0.25, ease: "power2.in" }, ${g(6.1)});`);
    js.push(`tl.fromTo("#${id}-wash", { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.45, ease: "power3.out" }, ${g(6.2)});`);
    js.push(`tl.fromTo("#${id}-toast", { y: 40, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, ${g(6.7)});`);
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
      <div id="introPill" class="pill ur">لائبریری عملے کے لیے، ${urdu(N)} آسان مراحل</div>
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
