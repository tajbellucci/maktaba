let DATA = { library: "", updated: "", books: [] };
let nextId = 1;
let mode = "books";        // rail: books | category | author | status | shelf | favorites | recent
/* Selected groups in the category / author / almari / status tabs. Several can
   be selected at once (click toggles a row); empty means all books. */
const groupSel = new Set();
/* The one selected group, when exactly one is selected: used to pre-fill a new
   book's category or branch, which has no sensible value for several at once. */
const singleGroup = () => (groupSel.size === 1 ? [...groupSel][0] : null);
let filter = "all";        // tab: all | available | issued | missing | overdue
let sortMode = "accession"; // accession | title | author | added
let selectedId = null;

/* Books checked for full-text search, independent of which one is
   currently open/highlighted (selectedId). Empty means "search every
   Unicode book", the old default behaviour. */
const ftsScopedIds = new Set();
/* Lines highlighted in the checked-books list, waiting to be removed. Separate from
   ftsScopedIds: highlighting changes nothing until the remove button is pressed. */
const ftsScopePicked = new Set();

const $ = (id) => document.getElementById(id);

/* Physical layout: مکتبہ (building/branch) → شعبہ (department, only نعمانیہ جدید
   subdivides) → الماری نمبر (a free-text cabinet number, typed per book). */
const MAKTABA_OPTIONS = ["قباء مسجد", "نعمانیہ قدیم", "نعمانیہ جدید"];
const DEPARTMENTS_BY_MAKTABA = {
  "نعمانیہ جدید": ["دار الافتاء", "دار التصنیف", "لائبریری", "غرفة عامة للشيخ", "غرفة خاصة للشيخ"]
};
/* Catalogue text is written by librarians and arrives from a shared file, so
   it is never safe to drop straight into markup: a title containing "<" would
   silently break the row it sits in. Everything derived from book, category
   or release data goes through esc() on its way into innerHTML — quotes
   included, because several of these land inside attributes. */
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const escapeHtml = esc;

function departmentsFor(maktaba) { return DEPARTMENTS_BY_MAKTABA[maktaba] || []; }
function updateDeptList(maktaba) {
  const dl = $("deptList");
  if (!dl) return;
  dl.innerHTML = departmentsFor(maktaba).map((d) => `<option value="${esc(d)}"></option>`).join("");
}
/* Every record passes through here on load, on pull, and on create, so a
   book written by an older version never renders as undefined.

   Tracking model: this is a PHYSICAL library first. Every copy carries a
   register (accession) number, and its whereabouts is a three-state status
   rather than a present/absent flag — a book that is out on loan is neither
   lost nor on the shelf, and that distinction is the whole point of tracking.
   `present` is kept in sync purely so older data and the phone app keep
   working. */
const STATUSES = ["available", "issued", "missing"];
const ISSUE_TYPES = ["person", "department"];
/* Set when a load had to add the circulation fields, so the upgraded shape
   is written to disk once instead of being re-derived on every launch. */
let didMigrate = false;
/* Reader vs librarian. Set by refreshMasterUI(), read by requireMaster(). */
let IS_MASTER = false;

/* Shamela splits its catalogue into printed vs non-printed material and then
   by kind. A madrassa library holds exactly these kinds — manuscripts and
   bound magazine volumes are not the same thing as a printed book, and the
   register should not pretend they are. */
/* The madrassa's own subject taxonomy. Held in the catalogue, so adding or
   removing a subject on the librarian's machine reaches every other install
   through the same sync as the books themselves. */
const DEFAULT_CATEGORIES = [
  "العقيدة وعلم الكلام", "علوم القرآن وأصول التفسير", "التفسير", "الحديث", "شروح الحديث", "علوم الحديث",
  "أصول الفقه", "القواعد الفقهية", "الفقه", "الفقه الحنفي", "الفقه الشافعي", "الفقه المالكي", "الفقه العام", "الفتاوى",
  "السيرة النبوية", "التاريخ", "التراجم والطبقات", "السوانح", "التصوف والسلوك", "الآداب والأذكار",
  "المواعظ والخطب والملفوظات", "الفضائل والمناقب", "اللغة والمعاجم", "النحو والصرف", "البلاغة", "الأدب العربي",
  "المنطق والفلسفة", "علم الهيئة والفلك", "الطب", "الأنساب", "السياسة الشرعية", "الدرس النظامي", "متفرقات"
];

/* The subject list moved from Urdu to Arabic names (the madrassa's choice).
   Books and lists written with the old names are renamed once on load, so
   old and new entries land in the same category instead of two. */
const CATEGORY_RENAME = {
  "عقیدہ وعلم الکلام": "العقيدة وعلم الكلام", "علوم القرآن/اصول التفسیر": "علوم القرآن وأصول التفسير",
  "شروحِ حدیث": "شروح الحديث", "علوم حدیث": "علوم الحديث", "اصول فقہ": "أصول الفقه", "قواعد الفقہ": "القواعد الفقهية",
  "فقہ حنفی": "الفقه الحنفي", "فقہ شافعی": "الفقه الشافعي", "فقہ مالکی": "الفقه المالكي", "فقہ عام": "الفقه العام",
  "فقہ": "الفقه", "فتاویٰ": "الفتاوى", "حدیث": "الحديث", "تفسیر": "التفسير", "سیرت": "السيرة النبوية",
  "تاریخ": "التاريخ", "تراجم": "التراجم والطبقات", "تراجم وطبقات": "التراجم والطبقات", "سوانح": "السوانح",
  "نحو و صرف": "النحو والصرف", "الادب العربی": "الأدب العربي", "درس نظامی": "الدرس النظامي", "لغت": "اللغة والمعاجم",
  "اصلاحی کتب(خطبات، ملفوظات اور مکتوبات)": "المواعظ والخطب والملفوظات", "سیاسی کتب": "السياسة الشرعية", "آداب واذکار": "الآداب والأذكار"
};

/* Matching key for names typed by people (branch, department, category):
   the search normalization plus the letters staff mix freely in names --
   ه/ہ/ۃ, ى/ی -- and spacing, so نعمانية جدید, نعمانيه جديد and نعمانیہ جدید
   are one branch, and دار الافتاء / دارالإفتاء one department. Kept out of
   shared/norm.js on purpose: that file must match the Android search exactly. */
const nameKey = (v) => norm(v || "").replace(/ه/g, "ہ").replace(/ۃ/g, "ہ").replace(/ى/g, "ی").replace(/\s+/g, "");
const canonBranch = (v) => MAKTABA_OPTIONS.find((b) => nameKey(b) === nameKey(v)) || null;
function canonDept(v) {
  if (!v) return v;
  const known = Object.values(DEPARTMENTS_BY_MAKTABA).flat().concat(DATA.books.map((b) => b.department).filter(Boolean));
  return known.find((d) => nameKey(d) === nameKey(v)) || v;
}
/* Categories also match without the article (فقه = الفقه) and by their old Urdu name. */
const catKey = (v) => nameKey(v).replace(/^ال/, "");
const canonCat = (v) => (v ? CATEGORY_RENAME[v] || categories().find((c) => catKey(c) === catKey(v)) || v : v);

function categories() {
  if (!Array.isArray(DATA.categories) || !DATA.categories.length) {
    DATA.categories = [...DEFAULT_CATEGORIES];
  } else if (DATA.categories.some((c) => CATEGORY_RENAME[c])) {
    const renamed = DATA.categories.map((c) => CATEGORY_RENAME[c] || c);
    DATA.categories = [...new Set(renamed.concat(DEFAULT_CATEGORIES))];
    didMigrate = true;
  }
  return DATA.categories;
}

/* Any subject already sitting on a book but missing from the list is still
   offered, so old records never silently lose their subject. */
function categoryChoices() {
  const set = new Set(categories());
  DATA.books.forEach((b) => { if (b.category) set.add(b.category); });
  return [...set];
}

function refreshCategoryList() {
  const dl = $("catList");
  if (dl) dl.innerHTML = categoryChoices().map((c) => `<option value="${esc(c)}"></option>`).join("");
}

/* A real, keyboard-driven suggestion list for موضوع/شعبہ — the browser's own
   <input list> + <datalist> combo LOOKS like it should do this, but Chromium's
   native datalist popup does not open or move on ArrowDown/ArrowUp at all; the
   client reported exactly that ("arrow does not work to pull in/hide the
   data"). This replaces it with a small combobox: typing filters, ↓/↑ moves a
   highlight, Enter or a click picks it, Escape closes without changing
   anything. Free text is still accepted — these are suggestions, not a fixed
   list — so nothing here blocks a genuinely new category or department.

   The suggestion panel is a permanent, single body-level element per input,
   shown/hidden and repositioned in fixed coordinates rather than nested near
   the field. A field inside the Add Book <dialog> needs that regardless of
   z-index — proven earlier in this codebase that no z-index beats an open
   <dialog> from underneath it; portaled here from the start rather than only
   when the stacking breaks. */
/* Keyed by input id, not by the input element itself — dCategory/dDepartment
   are rebuilt from scratch on every renderDetail() call (one per row click),
   as a brand new element each time, so an element-keyed record would never
   find the PREVIOUS dropdown to remove. A fresh body-appended dropdown on
   every rebuild with nothing ever cleaned up would leak one orphaned element
   per click, forever; the id stays the same across rebuilds even though the
   node does not. */
const comboLists = new Map();

function attachCombobox(input, getOptions) {
  const existing = comboLists.get(input.id);
  if (existing) existing.remove();

  const list = document.createElement("div");
  list.className = "combo-list hidden";
  /* A plain document.body child never renders above an open <dialog>, no
     matter the z-index — a dialog paints in the browser's top layer, which
     only top-layer content can beat. oCategory/oDepartment live inside
     dlgOne, so the dropdown must be parented INSIDE that dialog (making it
     part of the same top-layer subtree) rather than as a body sibling.
     dCategory/dDepartment sit in the plain detail panel with no enclosing
     dialog, so body is correct there. */
  (input.closest("dialog") || document.body).appendChild(list);
  comboLists.set(input.id, list);
  /* A mousedown that lands on the list's own scrollbar (not a .combo-item)
     was never prevented, so it blurred the input like any other outside
     click — the close-on-blur timer then killed the dropdown mid-scroll,
     fighting the very drag the user was making. */
  list.addEventListener("mousedown", (e) => e.preventDefault());

  let items = [];
  let highlight = -1;

  function position() {
    /* The app's UI-scale setting applies CSS `zoom` on <body> (currently
       1.12 for the default scale). getBoundingClientRect()/innerHeight
       report RENDERED (post-zoom) pixels, but element.style.left/top and
       offsetHeight are LAYOUT (pre-zoom) pixels — the two don't mix. Every
       calculation below happens in rendered-pixel space (matching
       getBoundingClientRect and innerHeight), and only the final numbers
       assigned to list.style.* are divided back down to layout pixels via
       currentCSSZoom. Skipping this step is what silently misplaced the
       dropdown further from the input the further the input sat from the
       page's top-left corner — a small drift near the origin, a field's
       height buried under it lower down. */
    const zoom = list.currentCSSZoom || 1;
    const r = input.getBoundingClientRect();
    const h = list.offsetHeight * zoom;
    const GAP = 2;
    let top = r.bottom + GAP;
    if (top + h > window.innerHeight - GAP) top = Math.max(GAP, r.top - GAP - h);
    /* dlgOne's open/close animation leaves its computed transform at the
       identity matrix rather than "none" once finished — and ANY non-"none"
       transform on an ancestor, identity included, makes that ancestor the
       containing block for a position:fixed descendant (CSS spec). The
       dropdown is parented inside the dialog (see above), so its fixed
       coordinates land relative to the dialog's box, not the viewport,
       while getBoundingClientRect() above is always viewport-relative —
       subtracting the dropdown's own containing block's origin converts
       back to the frame position:fixed is actually using. For the body
       parent case (dCategory/dDepartment) this origin is 0,0, a no-op. */
    const hostRect = list.parentElement.getBoundingClientRect();
    /* Matching the input's full width made a 440px-wide panel that buried
       four fields at once. A category name needs far less, so the list is
       capped and hangs from the edge the text starts at — right in Urdu and
       Arabic, left in English. */
    const w = Math.min(r.width, 260 * zoom);
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    const left = rtl ? r.right - w : r.left;
    list.style.left = ((left - hostRect.left) / zoom) + "px";
    list.style.top = ((top - hostRect.top) / zoom) + "px";
    list.style.width = (w / zoom) + "px";
  }

  function render() {
    const q = input.value.trim();
    const all = (getOptions() || []).filter((v, i, arr) => v && arr.indexOf(v) === i);
    items = q ? all.filter((v) => v.includes(q)) : all;
    if (!items.length) { close(); return; }
    highlight = Math.min(highlight, items.length - 1);
    list.innerHTML = items
      .map((v, i) => `<div class="combo-item${i === highlight ? " on" : ""}" data-i="${i}">${esc(v)}</div>`)
      .join("");
    list.classList.remove("hidden");
    position();
    list.querySelectorAll(".combo-item").forEach((el) => {
      // mousedown, not click — fires before the input's own blur, so a
      // selection is never lost to the close-on-blur handler racing it.
      el.onmousedown = (e) => {
        e.preventDefault();
        select(items[+el.dataset.i]);
      };
    });
  }

  let suppressNextInput = false;
  function select(value) {
    input.value = value;
    close();
    /* dispatchEvent runs listeners synchronously, including this combobox's
       OWN "input" listener below — without the flag, selecting an item
       reopens the very dropdown select() just closed. */
    suppressNextInput = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function open() { highlight = -1; render(); }
  function close() { list.classList.add("hidden"); highlight = -1; }
  function isOpen() { return !list.classList.contains("hidden"); }

  function setHighlight(i) {
    highlight = Math.max(0, Math.min(i, items.length - 1));
    list.querySelectorAll(".combo-item").forEach((el, idx) => el.classList.toggle("on", idx === highlight));
    const el = list.children[highlight];
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus", open);
  input.addEventListener("input", () => {
    if (suppressNextInput) { suppressNextInput = false; return; }
    highlight = -1;
    render();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      setHighlight(highlight + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      setHighlight(highlight - 1);
    } else if (e.key === "Enter") {
      if (isOpen() && highlight >= 0) { e.preventDefault(); select(items[highlight]); }
    } else if (e.key === "Escape") {
      if (isOpen()) { close(); }
    }
  });
  window.addEventListener("resize", () => { if (isOpen()) position(); });
  /* Focusing oCategory/oDepartment near the bottom of a taller-than-viewport
     dlgOne triggers the browser's own "scroll focused element into view",
     which lands a frame or two AFTER this module's synchronous position()
     call — leaving the dropdown drawn at the input's pre-scroll location.
     Scroll events don't bubble, so catching the dialog's internal scroll
     (or a body scroll for the detail-panel case) needs the capture phase. */
  document.addEventListener("scroll", () => { if (isOpen()) position(); }, true);
}

const MATERIALS = ["book", "magazine", "manuscript", "thesis", "electronic"];
const PRINTED = ["book", "magazine"];

function normalizeBook(b) {
  if (b.maktaba === undefined) b.maktaba = "";
  if (b.department === undefined) b.department = "";
  if (b.publisher === undefined) b.publisher = "";
  if (b.image === undefined) b.image = "";
  if (b.format === undefined) b.format = "physical";
  if (!Array.isArray(b.files)) b.files = b.filePath ? [b.filePath] : [];
  /* Whether a real printed copy sits on a shelf, kept SEPARATE from `format`
     (which only says what kind of digital file is attached). A book can be
     both — a printed volume that also has a scan — and only the printed one
     can be lent, transferred or go missing. Migration: anything catalogued
     before this existed was physical-only if `format` said so, and a
     digital-only record otherwise. */
  if (typeof b.hasPrint !== "boolean") {
    b.hasPrint = b.format === "physical";
    didMigrate = true;
  }
  if (!STATUSES.includes(b.status)) b.status = b.present === false ? "missing" : "available";
  b.present = b.status !== "missing";
  if (b.borrower === undefined) b.borrower = "";
  if (b.issueDate === undefined) b.issueDate = "";
  if (b.dueDate === undefined) b.dueDate = "";
  if (!Array.isArray(b.history)) b.history = [];
  if (typeof b.favorite !== "boolean") b.favorite = false;
  if (b.viewedAt === undefined) b.viewedAt = "";
  if (!MATERIALS.includes(b.material)) b.material = "book";
  if (CATEGORY_RENAME[b.category]) { b.category = CATEGORY_RENAME[b.category]; didMigrate = true; }
  if (b.almari === undefined) b.almari = b.shelf || "";   // almari no. is back — re-requested after being dropped
  if (b.borrowerContact === undefined) b.borrowerContact = "";
  /* Address and phone are separate questions with separate answers, and the
     issued-books list needs to show them apart. Older records carried both
     jammed into one "contact" box, so that value becomes the address and the
     phone starts empty rather than guessing which half was which. */
  if (b.borrowerAddress === undefined || b.borrowerPhone === undefined) didMigrate = true;
  if (b.borrowerAddress === undefined) b.borrowerAddress = b.borrowerContact || "";
  if (b.borrowerPhone === undefined) b.borrowerPhone = "";
  if (b.borrowDays === undefined) b.borrowDays = null;
  /* A book can leave its own almari two different ways: lent to a person, or
     moved to another department inside the madrassa. The second is not really
     a loan — nobody is taking it home — but the copy is no longer where the
     register says it is, so it has to be tracked just as carefully. */
  if (b.issueType === undefined) didMigrate = true;
  if (!ISSUE_TYPES.includes(b.issueType)) b.issueType = "person";
  if (b.toDepartment === undefined) b.toDepartment = "";
  if (b.toAlmari === undefined) b.toAlmari = "";
  delete b.filePath;   // superseded by files[]
  delete b.shelf;      // superseded by almari
  return b;
}

/* Register numbers are assigned once and never reused, so a number in a
   paper register always points at the same physical copy. */
function assignAccessions() {
  let max = DATA.books.reduce((m, b) => Math.max(m, parseInt(b.accession, 10) || 0), 0);
  let assigned = 0;
  for (const b of DATA.books) {
    if (!b.accession) { b.accession = String(++max); assigned++; }
  }
  return assigned;
}

/* Local calendar date, not UTC: toISOString() is UTC, so between midnight
   and 5am in Pakistan every issue/return was stamped with yesterday's date
   and due dates came out a day early. */
const localISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayISO = () => localISO(new Date());

function logHistory(b, action, detail) {
  b.history.unshift({ date: todayISO(), action, detail: detail || "" });
  if (b.history.length > 40) b.history.length = 40;  // a card, not an audit database
}

function isOverdue(b) {
  return b.status === "issued" && b.dueDate && b.dueDate < todayISO();
}

/* Bundled covers live beside the app and are referenced relatively so they
   survive being packaged; anything the librarian picks is an absolute path
   on their own machine and needs a file:// URL. */
let COVERS_DIR = "";

/* url -> local file path, for covers already downloaded. Filled once after
   load; until then a hosted cover simply loads from the network as before. */
const coverCache = new Map();

async function refreshCoverCache() {
  const urls = DATA.books.map((b) => b.image).filter((i) => typeof i === "string" && /^https?:\/\//i.test(i));
  if (!urls.length) return;
  const map = await window.maktaba.cachedImages(urls).catch(() => ({}));
  let added = false;
  for (const [url, local] of Object.entries(map)) {
    if (!coverCache.has(url)) { coverCache.set(url, local); added = true; }
  }
  if (added) renderAll();
}

function imageSrc(image) {
  if (!image) return "";
  const local = coverCache.get(image);
  if (local) return "file:///" + local.split("\\").join("/");
  if (image.startsWith("userdata:covers/")) {
    if (!COVERS_DIR) return "";
    return "file:///" + (COVERS_DIR + "/" + image.slice("userdata:covers/".length)).split("\\").join("/");
  }
  if (image.startsWith("covers/")) return "../seed/" + image;
  if (/^[a-z]+:\/\//i.test(image)) return image;
  return "file:///" + image.split("\\").join("/");
}

function fillMaktabaSelect(sel, value) {
  sel.innerHTML = `<option value=""></option>` + MAKTABA_OPTIONS.map((m) => `<option value="${m}">${m}</option>`).join("");
  sel.value = value || "";
}

/* Urdu-Indic digits for Urdu UI; Arabic keeps plain Western digits, which is
   how Arabic readers actually expect numerals to look. */
const AR_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ud = (n) => (LANG === "ur" ? String(n).replace(/[0-9]/g, (d) => AR_DIGITS[+d]) : String(n)); // ar and en both use plain digits

let toastHideTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  /* A plain z-index can't beat an open <dialog>'s top layer, so toasts were
     invisible whenever a dialog was open (the app's normal state). A popover
     enters the same top layer and stacks above dialogs shown before it. */
  try { el.showPopover(); } catch (e) {}
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    el.classList.remove("show");
    try { el.hidePopover(); } catch (e) {}
  }, 2200);
}

/* Browser-preview fallback: without Electron's preload there is no window.maktaba,
   so the page still renders from the seed file for visual checks. */
if (!window.maktaba) {
  window.maktaba = {
    load: () => fetch("../seed/books.json?cb=" + Date.now()).then((r) => r.json()),
    save: async (d) => d.updated,
    saveSync: (d) => d.updated,
    export: async () => null,
    dataPath: async () => "(browser preview)",
    getSettings: async () => ({ owner: "", repo: "", branch: "main", hasToken: false, isLibrarian: false, hasLibrarianPin: false }),
    setSettings: async () => ({ ok: true }),
    setLibrarianPin: async () => ({ ok: true }),
    checkLibrarianPin: async () => ({ ok: true }),
    authConfigured: async () => false,
    authLogin: async () => ({ ok: false, error: "preview" }),
    authLogout: async () => ({ ok: true }),
    authHeartbeat: async () => ({ ok: true }),
    authStatus: async () => ({ loggedIn: false }),
    authRestore: async () => ({ ok: false }),
    authLockStatus: async () => ({ held: false }),
    peekRemote: async () => ({ ok: false, error: "preview" }),
    publishState: async () => ({ unpublished: false, at: "" }),
    applyData: async () => ({ ok: true }),
    downloadFile: async () => ({ ok: false, error: "preview" }),
    filesDir: async () => "",
    searchCoverOnline: async () => ({ ok: true }),
    publish: async () => ({ ok: false, error: "preview" }),
    pickFile: async () => [],
    pickImage: async () => null,
    openFile: async () => ({ ok: true }),
    readText: async () => ({
      ok: true,
      text: [
        "بسم اللہ الرحمن الرحیم",
        "قال رسول الله صلى الله عليه وسلم: إنما الأعمال بالنيات",
        "وهذا كتاب فتاوى شامي",
        "الحمد لله رب العالمين"
      ].join("\n"),
      name: "preview.txt"
    }),
    cachedStatus: async (urls) => urls.map(() => false),
    cachedImages: async () => ({}),
    downloadAllTexts: async () => ({ total: 0, downloaded: 0, alreadyCached: 0, failed: 0 }),
    fileExists: async () => true,
    downloadImage: async () => ({ ok: false, error: "preview" }),
    coversDir: async () => "",
    checkUpdate: async () => ({ ok: false }),
    version: async () => "1.1.0",
    whatsNew: async () => ({
      data: await fetch("../seed/whatsnew.json?cb=" + Date.now()).then((r) => r.json()).catch(() => null),
      current: "1.1.0",
      fromRemote: false
    })
  };
}

async function boot() {
  applyLang();
  DATA = await window.maktaba.load();
  DATA.books.forEach(normalizeBook);
  categories();
  if (assignAccessions() || didMigrate) persist();
  /* After the one-off migration save above, not before: that save is the app
     tidying old records on launch, not something the librarian did, so the
     first Ctrl+Z must never undo it. */
  resetUndo();
  nextId = 1 + DATA.books.reduce((m, b) => Math.max(m, b.id || 0), 0);
  categories();
  refreshCategoryList();
  applyTheme();
  COVERS_DIR = await window.maktaba.coversDir();
  $("sbPath").textContent = await window.maktaba.dataPath();
  const v = await window.maktaba.version();
  const el = $("aboutVer");
  if (el) el.textContent = "Maktaba Naumania — v" + v;
  renderAll();
  refreshCoverCache();    // swap hosted covers for local copies once we know which exist
  showCatalog();          // opens on the picker, like Shamela does
  checkForUpdate();
  /* Sign the librarian back in from the saved session before deciding what
     the toolbar shows, so master rights survive a restart without a password
     prompt on every launch. */
  const restored = await window.maktaba.authRestore();
  if (restored && restored.ok) startHeartbeat();
  await refreshMasterUI();
  refreshPublishBadge();
  startAutoSync();
}

/* Background sync: a machine left open all day catches up on its own instead
   of needing someone to remember the "get updates" button. Interval is 6
   minutes, deliberately loose — the unauthenticated GitHub API doPull reads
   through allows 60 requests/hour PER IP, shared by every madrassa computer
   behind the same router, and this is the number of readers a small office
   network can poll from without tripping that limit (10/hr each). Every
   change still goes through the normal confirm-and-diff dialog; this only
   automates the CHECK, never the apply. */
const AUTO_SYNC_MS = 6 * 60 * 1000;
let autoSyncTimer = null;

function startAutoSync() {
  if (autoSyncTimer) return;
  /* Readers only. There is exactly one master (enforced by the Supabase
     master lock), so GitHub can never hold anything the master did not put
     there — polling it could only ever offer to undo their own work.
     Checked when the timer FIRES, not here, because whether this machine is
     master is resolved asynchronously after boot. */
  autoSyncTimer = setInterval(() => {
    if (IS_MASTER) return;
    doPull(true);
  }, AUTO_SYNC_MS);
}

/* Realtime nudge: the moment master publishes, a reader with this open finds
   out within a second or two instead of waiting for the 6-minute poll above.
   The poll is NOT replaced — it stays the real safety net. This only makes
   the common case fast.
   Supabase Realtime speaks the Phoenix channel wire protocol over a plain
   WebSocket; no client library needed, just join a channel and answer its
   heartbeat. Requires a one-time setup in the Supabase project (a
   catalogue_version table with Realtime enabled on it, done once via the SQL
   editor) — if that hasn't been run, or Supabase is unreachable, this simply
   never connects and the poll above covers everything exactly as before.
   Readers only: master already knows the instant their own publish
   finishes, and doPull(true) is a harmless no-op even if this fired for
   them, since their own DATA already matches what they just published. */
let rtSocket = null;
let rtHeartbeatTimer = null;
let rtReconnectTimer = null;
let rtWanted = false;   // should a connection exist right now, per current role
let rtRef = 0;

function stopRealtime() {
  if (rtHeartbeatTimer) clearInterval(rtHeartbeatTimer);
  if (rtReconnectTimer) clearTimeout(rtReconnectTimer);
  rtHeartbeatTimer = null;
  rtReconnectTimer = null;
  if (rtSocket) { try { rtSocket.close(); } catch { /* already closing */ } }
  rtSocket = null;
}

function scheduleRealtimeReconnect() {
  if (!rtWanted || rtReconnectTimer) return;
  rtReconnectTimer = setTimeout(() => { rtReconnectTimer = null; startRealtime(); }, 5000);
}

async function startRealtime() {
  if (rtSocket || !rtWanted) return;
  const s = await window.maktaba.getSettings();
  if (!s.supabaseUrl || !s.supabaseAnonKey) return;   // no setup done yet, poll covers it
  if (!rtWanted) return;   // role may have flipped during the await above

  let ws;
  try {
    const wsUrl = s.supabaseUrl.replace(/^http/, "ws").replace(/\/$/, "") +
      "/realtime/v1/websocket?apikey=" + encodeURIComponent(s.supabaseAnonKey) + "&vsn=1.0.0";
    ws = new WebSocket(wsUrl);
  } catch {
    scheduleRealtimeReconnect();
    return;
  }
  rtSocket = ws;

  ws.onopen = () => {
    rtRef = 0;
    ws.send(JSON.stringify({
      topic: "realtime:public:catalogue_version",
      event: "phx_join",
      payload: { config: { postgres_changes: [{ event: "UPDATE", schema: "public", table: "catalogue_version" }] } },
      ref: String(++rtRef)
    }));
    // Supabase drops a silent connection after ~30s with no client activity.
    rtHeartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++rtRef) }));
      }
    }, 25000);
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.topic === "realtime:public:catalogue_version" && msg.event === "postgres_changes" && !IS_MASTER) {
      doPull(true);
    }
  };

  ws.onclose = () => { stopRealtime(); scheduleRealtimeReconnect(); };
  ws.onerror = () => { try { ws.close(); } catch { /* onclose runs the actual cleanup */ } };
}

/* Publish only means anything if this machine can actually write — a reader
   install with no token/login just gets an error from clicking it. Hide it
   for anyone who isn't currently master, on whichever gate applies. */
async function refreshMasterUI() {
  const s = await window.maktaba.getSettings();
  const supabaseConfigured = Boolean(s.supabaseUrl && s.supabaseAnonKey);
  if (supabaseConfigured) {
    const auth = await window.maktaba.authStatus();
    IS_MASTER = auth.loggedIn;
  } else {
    IS_MASTER = Boolean(s.isLibrarian);
  }
  /* One attribute drives the whole read-only mode. Everything that writes to
     the catalogue is hidden by CSS off this, and the same flag is checked
     again in JS before any write actually runs. */
  document.documentElement.setAttribute("data-role", IS_MASTER ? "master" : "reader");
  const badge = $("roleBadge");
  if (badge) badge.textContent = IS_MASTER ? "" : t("readerMode");
  /* Same action, honest name for each role: a reader is fetching the
     librarian's latest; the master can only be restoring the last thing they
     published, over their own unpublished edits. */
  /* Short forms: this label sits under a rail icon, and the full sentence
     ("restore the last published version") wrapped onto two lines and made
     the whole row ragged. The full wording still lives on the tooltip. */
  const pullLabel = $("ibPullLabel");
  if (pullLabel) {
    pullLabel.textContent = IS_MASTER ? t("mRestoreShort") : t("mPullShort");
    const host = pullLabel.closest("button");
    if (host) host.title = IS_MASTER ? t("mRestorePublished") : t("mPull");
  }

  /* Add/Delete/Publish stay visible on the rail for a reader (they only look
     inactive, via CSS) rather than disappearing — the tooltip is what
     explains why nothing happens when clicked, since requireMaster() blocks
     the actual write silently otherwise. */
  for (const act of ["addOne", "addMany", "delete", "publish"]) {
    const btn = document.querySelector(`#iconbar [data-act="${act}"]`);
    if (btn) btn.title = IS_MASTER ? "" : t("readerBlocked");
  }

  /* Deliberate pre-handover freeze (shared/repo.js: publishFrozen) — hides
     Publish for EVERY master, including the client's own login, not only
     readers. Reading/pulling is completely unaffected. */
  document.documentElement.classList.toggle("publish-frozen", Boolean(s.publishFrozen));

  applyReadOnly();

  if (IS_MASTER) {
    rtWanted = false;
    stopRealtime();
  } else if (!rtWanted) {
    rtWanted = true;
    startRealtime();
  }

  /* The MAIN process makes its own sync decisions — whether to silently pull
     on launch, whether the close guard applies — entirely from
     settings.json's `isLibrarian` flag, which it cannot see the live Supabase
     session to double-check. Real bug found live: a Supabase login set
     IS_MASTER=true in the renderer while this flag stayed false, so every
     launch quietly overwrote this machine's own edits with the (older)
     remote copy, believing it was a reader syncing down. This is the one
     place both sides of that split now stay truthful, on every transition. */
  if (Boolean(s.isLibrarian) !== IS_MASTER) {
    await window.maktaba.setSettings({ isLibrarian: IS_MASTER });
  }
}

/* Locks the record editor for a reader. The detail pane is built fresh on
   every selection, so this runs after each render rather than once at boot. */
function applyReadOnly() {
  if (IS_MASTER) return;
  document.querySelectorAll(
    ".detail input, .detail select, .detail textarea"
  ).forEach((el) => {
    if (el.type === "checkbox" || el.type === "radio" || el.tagName === "SELECT") el.disabled = true;
    else el.readOnly = true;
  });
}

/* A reader's copy is a mirror, not a workbench. The UI hides the write
   controls, and this is the second gate behind them — belt and braces, since
   a stray keyboard shortcut or an old event handler should not be able to
   edit a catalogue this machine cannot publish anyway. */
function requireMaster() {
  if (IS_MASTER) return true;
  toast(t("readerBlocked"));
  return false;
}

/* Every sync-shaped confirmation (pull, restore, sync-conflict, publish)
   reuses dlgConfirm, and all three used to close it and start the async work
   with no guard at all: a native <dialog> closes silently on Escape with no
   event of its own to tell "confirmed" apart from "dismissed", so pressing
   Escape at the wrong moment looked exactly like nothing happened — the
   librarian saw the preview, closed it, and had no way to know whether
   anything had actually been written. It hadn't. This wires confirmGo once,
   for every caller: a failed write shows a real error instead of vanishing,
   and any dismissal that is NOT a confirmed click says so out loud instead
   of leaving the librarian to guess. */
function runConfirmedSync(action, { onFailToast, cancelToast } = {}) {
  let confirmed = false;
  const dlg = $("dlgConfirm");

  const onClose = () => {
    dlg.removeEventListener("close", onClose);
    if (!confirmed && cancelToast) toast(cancelToast);
  };
  dlg.addEventListener("close", onClose);

  $("confirmGo").onclick = async () => {
    confirmed = true;
    dlg.close();
    try {
      await action();
    } catch (err) {
      alert((onFailToast || t("publishFail")) + String((err && err.message) || err));
    }
  };
}

/* Becoming master is exactly the moment this machine might be behind: someone
   else may have published while it sat as a reader. So it checks the server
   straight away. If this machine has nothing of its own at stake it just takes
   the newer copy silently; if it does have unpublished work, it stops and
   shows the difference rather than choosing for the librarian. */
async function syncOnBecomingMaster() {
  const peek = await window.maktaba.peekRemote();
  if (!peek.ok) return;

  const d = diffCatalogues(DATA, peek.data);
  if (d.empty) return;

  const state = await window.maktaba.publishState();
  /* peek.moved: another machine published after this one last synced, so any
     local edits sit on a replaced copy and could never be published anyway.
     Take the library's copy; applyData snapshots the old one to backups. */
  if (!state.unpublished || peek.moved) {
    await adoptData(peek.data);
    toast(t("syncedFromServer"));
    return;
  }

  $("confirmTitle").textContent = t("syncConflictTitle");
  $("confirmLead").textContent = t("syncConflictLead");
  $("confirmBody").innerHTML = renderDiff(d);
  $("confirmGo").textContent = t("pullGo");
  $("dlgConfirm").showModal();
  runConfirmedSync(
    async () => { await adoptData(peek.data); toast(t("pulled")); },
    { onFailToast: t("pullFail"), cancelToast: t("syncCancelled") }
  );
}

/* Replaces the whole in-memory catalogue with one from the server and rebuilds
   everything that reads from it. Used by both the pull button and login sync. */
async function adoptData(next) {
  await flushSave();          // don't let a queued write land after the swap
  await window.maktaba.applyData(next);
  // Whatever local now matches server, any divergence auto-publish paused
  // on is resolved by definition.
  clearAutoPublishPause();
  /* Attachments may have been replaced by whatever we just pulled, and the
     search cache is keyed by path — same path, new contents would otherwise
     keep answering from the old text for the rest of the session. */
  ftsCacheClear();
  DATA = next;
  DATA.books.forEach(normalizeBook);
  nextId = 1 + DATA.books.reduce((m, b) => Math.max(m, b.id || 0), 0);
  // Drop any checked-for-search id a sync just removed the book behind.
  const liveIds = new Set(DATA.books.map((b) => b.id));
  for (const id of [...ftsScopedIds]) if (!liveIds.has(id)) ftsScopedIds.delete(id);
  if ($("ftsScope")) updateFtsScope();
  categories();
  resetUndo();
  refreshCategoryList();
  applyTheme();
  renderAll();
  refreshCoverCache();
  refreshPublishBadge();
}

/* Shows the librarian, without being asked, that this machine is holding work
   the rest of the madrassa cannot see yet. */
async function refreshPublishBadge() {
  const btn = $("ibPublish");
  if (!btn) return;
  if (!IS_MASTER) { btn.classList.remove("pending"); return; }
  const state = await window.maktaba.publishState();
  btn.classList.toggle("pending", Boolean(state.unpublished));
  btn.title = state.unpublished ? t("unpublishedTip") : "";
}

/* Quiet by design: a reader install should never be nagged, so this only
   speaks up when a newer build actually exists. */
async function checkForUpdate() {
  const res = await window.maktaba.checkUpdate();
  if (res && res.ok && res.newer) {
    toast(t("updateAvailable") + " v" + res.latest);
    const el = $("aboutUpdate");
    if (el) el.textContent = t("updateAvailable") + " v" + res.latest;
  }
}

async function persist() {
  pendingSave = false;
  clearTimeout(saveTimer);
  recordUndoStep();
  DATA.updated = await window.maktaba.save(DATA);
  renderStatus();
  refreshPublishBadge();
  scheduleAutoPublish();
}

/* Undo / redo for catalogue edits (master only).
   Every real edit already funnels through persist(), so that is where a step is
   recorded: the catalogue as it stood after the previous save is pushed onto the
   undo stack whenever the new state differs. Snapshots hold only books and
   categories, and leave out favourite and last-viewed -- those are incidental
   and save on a timer, so starring a book must not become an undo step and an
   undo must not un-star anything (current values are carried across a restore).
   Undo re-saves through persist() like any edit, so the restored state reaches
   disk and auto-publish the same way; undoing a published delete republishes
   the book. The stacks are dropped whenever the whole catalogue is replaced
   (pull, restore, login sync) so undo can never reach back across that. */
const UNDO_MAX = 30;
let undoStack = [];
let redoStack = [];
let undoBase = null;
let applyingHistory = false;

function snapshotOf() {
  return JSON.stringify({
    books: DATA.books.map((b) => { const { favorite, viewedAt, ...rest } = b; return rest; }),
    categories: DATA.categories || []
  });
}

function resetUndo(keepStacks) {
  if (!keepStacks) { undoStack = []; redoStack = []; }
  undoBase = snapshotOf();
  updateUndoButtons();
}

function recordUndoStep() {
  const snap = snapshotOf();
  if (undoBase === null || applyingHistory) { undoBase = snap; return; }
  if (snap === undoBase) return;
  undoStack.push(undoBase);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];
  undoBase = snap;
  updateUndoButtons();
}

function updateUndoButtons() {
  const u = document.querySelector('#iconbar [data-act="undo"]');
  const r = document.querySelector('#iconbar [data-act="redo"]');
  if (u) { u.disabled = !undoStack.length; u.title = t("mUndo") + " (Ctrl+Z)"; }
  if (r) { r.disabled = !redoStack.length; r.title = t("mRedo") + " (Ctrl+Y)"; }
}

async function stepHistory(dir) {
  if (!IS_MASTER) return;
  await flushSave();
  const from = dir === "undo" ? undoStack : redoStack;
  const to = dir === "undo" ? redoStack : undoStack;
  if (!from.length) { toast(t(dir === "undo" ? "nothingToUndo" : "nothingToRedo")); return; }

  const target = JSON.parse(from.pop());
  to.push(snapshotOf());
  const keep = new Map(DATA.books.map((b) => [b.id, b]));
  const before = DATA.books.length;
  DATA.books = target.books.map((b) => {
    const cur = keep.get(b.id);
    return { ...b, favorite: cur ? cur.favorite : false, viewedAt: cur ? cur.viewedAt : "" };
  });
  DATA.categories = target.categories;
  DATA.books.forEach(normalizeBook);
  nextId = Math.max(nextId, 1 + DATA.books.reduce((m, b) => Math.max(m, b.id || 0), 0));
  const live = new Set(DATA.books.map((b) => b.id));
  for (const id of [...ftsScopedIds]) if (!live.has(id)) ftsScopedIds.delete(id);
  if (!live.has(selectedId)) { selectedId = null; $("bookView").classList.add("hidden"); }
  if ($("ftsScope")) updateFtsScope();

  applyingHistory = true;
  try { await persist(); } finally { applyingHistory = false; }
  categories();
  refreshCategoryList();
  renderAll();
  updateUndoButtons();
  toast(`${t(dir === "undo" ? "undoDone" : "redoDone")} (${ud(before)} ← ${ud(DATA.books.length)})`);
}

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !IS_MASTER) return;
  const el = e.target;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
  if (document.querySelector("dialog[open]:not(#dlgCatalog)")) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); stepHistory("undo"); }
  else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); stepHistory("redo"); }
});

/* Auto-publish: a few seconds after a real edit (add/edit/issue/return/
   delete — anything that calls persist(), not the coalesced favourite/
   last-viewed writes), publish it, no button click. Debounced so five
   quick edits in a row become one publish, not five commits.
   Every real safety check still runs — this is the exact same IPC call the
   manual Publish button makes, so isMasterNow(), publishFrozen and the
   divergence guard all still apply server-side. What changes is only that
   nothing here shows a confirmation dialog, since the whole point is not
   to interrupt.
   Divergence is the one outcome that must NOT just retry silently and
   loop forever failing — it pauses further auto-publishing and says so,
   until a manual Pull/Publish resolves it (see clearAutoPublishPause()
   below, called wherever that resolution already happens). */
let autoPublishTimer = null;
const AUTO_PUBLISH_DELAY_MS = 5000;
let autoPublishInFlight = false;
let autoPublishPaused = false;

function scheduleAutoPublish() {
  if (!IS_MASTER || autoPublishPaused) return;
  clearTimeout(autoPublishTimer);
  autoPublishTimer = setTimeout(runAutoPublish, AUTO_PUBLISH_DELAY_MS);
}

function clearAutoPublishPause() {
  autoPublishPaused = false;
}

async function runAutoPublish() {
  if (!IS_MASTER || autoPublishInFlight) return;
  autoPublishInFlight = true;
  try {
    const res = await window.maktaba.publish(DATA);
    if (res.ok) {
      if (res.data) {
        DATA = res.data;
        DATA.books.forEach(normalizeBook);
        resetUndo(true);
        renderAll();
      }
      refreshPublishBadge();
      toast(t("autoPublished"));
    } else if (res.diverged) {
      autoPublishPaused = true;
      toast(t("autoPublishPaused"));
    } else if (res.errorCode === "no-token") {
      /* A new master machine with no GitHub token in Settings would
         otherwise fail silently on every single edit, forever, with the
         librarian believing their changes were reaching GitHub when
         nothing had gone anywhere. Same pause-and-say-so treatment as
         divergence, not the usual silence, because this one never
         resolves on its own. */
      autoPublishPaused = true;
      toast(t("autoPublishNoToken"));
    } else if (res.errorCode === "not-master") {
      /* The lock is gone (another desk claimed it, or this machine slept
         through its heartbeat). Local edits still save to this disk, but
         nothing can reach GitHub until they log in again — and until this
         said so out loud, every delete and edit looked successful on screen
         while readers kept seeing the old catalogue. */
      autoPublishPaused = true;
      toast(t("masterLockLost"));
    }
    // publish-frozen / dev-run-no-publish / a transient network error: not
    // worth a toast on every single edit — the manual Publish button (and
    // its own error messages) is still there for whenever they check.
  } finally {
    autoPublishInFlight = false;
  }
}

/* Some state is worth saving but not worth stopping for: which book was last
   looked at, whether a star is on. Those fired a full atomic write of the
   whole catalogue — with an fsync — on every single click, which at a few
   thousand books is megabytes of disk per selection.
   These coalesce instead. Anything a librarian would be upset to lose (adding,
   editing, issuing, returning, deleting) still calls persist() directly and
   still lands immediately. */
const SAVE_DELAY_MS = 1000;
let saveTimer = null;
let pendingSave = false;

function persistSoon() {
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (pendingSave) persist(); }, SAVE_DELAY_MS);
}

/* Must be awaited anywhere the in-memory catalogue is about to be read from
   disk, replaced, or sent somewhere — otherwise a coalesced write could still
   be waiting and the wrong version would be used. */
async function flushSave() {
  if (pendingSave) await persist();
}

/* Last chance: the window is going away and an async save may not survive
   teardown, so a queued write is committed synchronously here. Only ever
   carries the incidental state, since everything else already saved. */
window.addEventListener("beforeunload", () => {
  if (!pendingSave) return;
  pendingSave = false;
  clearTimeout(saveTimer);
  try { window.maktaba.saveSync(DATA); } catch { /* closing anyway */ }
});

/* ── Grouping ─────────────────────────────────────────────────────────── */

const FLAT_MODES = ["books", "favorites", "recent"];
const isFlat = () => FLAT_MODES.includes(mode);

/* The search panel is open on arrival — it is the reason most people open
   this window — and closing it is remembered per machine, like the display
   settings are, rather than travelling with the synced catalogue. */
const FTS_OPEN_KEY = "maktaba-fts-open";
let ftsOpen = localStorage.getItem(FTS_OPEN_KEY) !== "0";

function setFtsOpen(open) {
  ftsOpen = open;
  try { localStorage.setItem(FTS_OPEN_KEY, open ? "1" : "0"); } catch { /* private mode */ }
  applyFtsOpen();
}

function applyFtsOpen() {
  /* Used to be restricted to the flat "books" tab only, on the reasoning
     that searching text inside a category/author/shelf/status tree would
     search whatever happened to be in the open group, not "all books". That
     reasoning no longer holds now that the checkbox scope below exists —
     selecting a category scopes the search to exactly that category's
     books, so searching from inside that tab is now exactly what a
     librarian means by it. Visible on every rail tab. */
  $("ftsPane").classList.toggle("hidden", !ftsOpen);
  $("railFts").classList.toggle("active", ftsOpen);
  // A lone drag handle with nothing beside it to resize looks broken.
  $("ftsResizer").classList.toggle("hidden", !ftsOpen);
}

function groupLabel() {
  return {
    category: t("railCategory"), author: t("railAuthor"),
    status: t("railStatus"), shelf: t("railShelf")
  }[mode] || "";
}

function groupKey(b) {
  if (mode === "category") return b.category || t("noCategory");
  if (mode === "author") return b.author || t("noAuthor");
  if (mode === "status") return t("st_" + b.status);
  return b.maktaba || t("noMaktaba"); // "shelf" rail mode groups by مکتبہ (library building)
}

/* Counts follow the type filter (كتب / مجلات ...) like the table does; they
   used to count every book, so a category could say 85 over an empty table. */
function groups() {
  const map = new Map();
  for (const b of DATA.books) {
    if (!materialFilter.has(b.material)) continue;
    const k = groupKey(b);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/* Material filter, mirroring Shamela's printed / non-printed checkboxes.
   Empty set means "no kind excluded", which is the sane default. */
let materialFilter = new Set(MATERIALS);

function visibleBooks() {
  const out = DATA.books.filter((b) => {
    if (mode === "favorites" && !b.favorite) return false;
    if (mode === "recent" && !b.viewedAt) return false;
    if (!isFlat() && groupSel.size && !groupSel.has(groupKey(b))) return false;
    if (!materialFilter.has(b.material)) return false;
    /* The shelf-status tabs (موجود / معار / مطلوب) only mean something for a
       book that physically exists. A digital-only record is never on a shelf,
       never lent and never missing, so it belongs in "all" and nowhere else —
       otherwise every PDF would pad the "available" count and make the
       physical stock-take wrong. */
    if (filter === "overdue") { if (!isOverdue(b)) return false; }
    else if (filter !== "all") {
      if (!b.hasPrint) return false;
      if (b.status !== filter) return false;
    }
    return matches(b, $("search").value);
  });
  // "Recently opened" is inherently ordered by when it was opened.
  const sorted = mode === "recent"
    ? out.sort((a, b) => String(b.viewedAt).localeCompare(String(a.viewedAt)))
    : sortBooks(out);
  /* While searching, best matches first (see matchRank in shared/norm.js);
     the chosen order still holds inside each group, as sort() is stable. */
  const q = $("search").value;
  if (!norm(q)) return sorted;
  const rank = new Map(sorted.map((b) => [b.id, matchRank(b, q)]));
  return sorted.sort((a, b) => rank.get(a.id) - rank.get(b.id));
}

/* Shamela offers "arrange alphabetically" and "arrange by author"; the
   register number is the third axis a physical library actually uses. */
function sortBooks(list) {
  const by = sortMode;
  const cmp = {
    title: (a, b) => String(a.title).localeCompare(String(b.title), "ar"),
    author: (a, b) => String(a.author).localeCompare(String(b.author), "ar"),
    accession: (a, b) => (parseInt(a.accession, 10) || 0) - (parseInt(b.accession, 10) || 0),
    added: (a, b) => (b.id || 0) - (a.id || 0)
  }[by];
  return cmp ? [...list].sort(cmp) : list;
}

/* ── Render ───────────────────────────────────────────────────────────── */

function renderAll() {
  document.querySelector(".groups").classList.toggle("hidden", isFlat());
  $("groupsResizer").classList.toggle("hidden", isFlat());
  document.querySelector(".matbar").classList.toggle("hidden", mode !== "category");
  applyFtsOpen();
  renderGroups();
  renderBooks();
  renderDetail();
  renderStatus();
}

function renderGroups() {
  if (isFlat()) return;
  $("groupColName").textContent = groupLabel();
  const list = $("groupList");
  // Rebuilding the rows would jump the list back to the top on every click,
  // which makes picking several groups down a long list impossible.
  const keepScroll = list.scrollTop;
  list.innerHTML = "";

  const all = document.createElement("div");
  all.className = "grouprow" + (groupSel.size === 0 ? " sel" : "");
  all.innerHTML = `<div class="c-name"><svg><use href="#i-grid"/></svg><span>${t("tabAll")}</span></div>
                   <div class="c-count">${ud(DATA.books.filter((b) => materialFilter.has(b.material)).length)}</div>`;
  all.onclick = () => {
    groupSel.clear();
    selectedId = null;
    if (mode === "category") { ftsScopedIds.clear(); updateFtsScope(); }
    renderAll();
  };
  list.appendChild(all);

  const icon = { category: "i-tag", author: "i-pen", status: "i-check", shelf: "i-shelf" }[mode];
  for (const [name, count] of groups()) {
    const row = document.createElement("div");
    row.className = "grouprow" + (groupSel.has(name) ? " checked" : "");
    row.innerHTML = `<div class="c-name"><span class="g-check${groupSel.has(name) ? " on" : ""}"><svg><use href="#i-tick"/></svg></span><svg><use href="#${icon}"/></svg><span>${esc(name)}</span></div>
                     <div class="c-count">${ud(count)}</div>`;
    row.onclick = () => {
      if (groupSel.has(name)) groupSel.delete(name); else groupSel.add(name);
      selectedId = null;
      /* In the category tab the selection is also the search scope: every book
         in the selected categories is checked into the full-text search, and
         un-selecting a category takes its books back out. */
      if (mode === "category") {
        ftsScopedIds.clear();
        for (const b of DATA.books) if (groupSel.has(groupKey(b)) && materialFilter.has(b.material)) ftsScopedIds.add(b.id);
        updateFtsScope();
      }
      renderAll();
    };
    list.appendChild(row);
  }
  list.scrollTop = keepScroll;
}

function renderBooks() {
  const list = $("bookList");
  list.innerHTML = "";
  const books = visibleBooks();

  for (const b of books) {
    const row = document.createElement("div");
    row.className = "bookrow st-" + b.status + (b.id === selectedId ? " sel" : "") + (isOverdue(b) ? " overdue" : "");
    const hostedUrl = (b.files || []).find((f) => /^https?:\/\//i.test(f));
    const badges = [
      b.format === "pdf" ? `<span class="fmt-badge">PDF</span>` : "",
      b.format === "unicode" ? `<span class="fmt-badge">TXT</span>` : "",
      /* Shamela shows which books are already on disk; this used to happen
         silently in the background with no way to see it had. Starts hidden,
         revealed by refreshOfflineBadges() once the real answer is known —
         showing it eagerly would claim "offline ready" for books that
         haven't actually been checked yet. */
      hostedUrl ? `<span class="fmt-badge offline hidden" data-offline-for="${b.id}" title="${t("offlineReady")}">${t("offlineBadge")}</span>` : "",
      (b.files || []).length > 1 ? `<span class="fmt-badge">×${ud(b.files.length)}</span>` : "",
      isOverdue(b) ? `<span class="fmt-badge od">${t("overdue")}</span>` : ""
    ].join("");
    row.innerHTML = `<span class="br-check${ftsScopedIds.has(b.id) ? " on" : ""}" data-check="${b.id}" title="${t("ftsCheckTip")}"><svg><use href="#i-tick"/></svg></span>
                     <span class="br-bookicon"><svg><use href="#i-book"/></svg></span>
                     <span class="br-star${b.favorite ? " on" : ""}" data-star="${b.id}" title="${t("favorite")}">${b.favorite ? "★" : "☆"}</span>
                     <span class="br-acc">${ud(b.accession || "—")}</span>
                     <span class="br-title"><span class="dot" title="${t("st_" + b.status)}"></span>${esc(b.title)}${badges}</span>
                     <span class="br-author">${esc(b.author) || t("noAuthor")}</span>
                     <span class="br-publisher">${esc(b.publisher)}</span>`;
    /* Shamela: one click selects, a double click opens. Opening on a single
       click meant every mis-click popped a book over the list. */
    row.onclick = () => {
      selectedId = b.id;
      /* Moving the highlight used to rebuild every row in the list — at a few
         thousand books that is the whole list thrown away and recreated just
         to shift one class. Move the class instead. */
      const prev = list.querySelector(".bookrow.sel");
      if (prev) prev.classList.remove("sel");
      row.classList.add("sel");
      $("footDel").disabled = false;
    };
    row.ondblclick = () => {
      row.onclick();       // highlight follows the opened book even without a preceding click
      selectedId = b.id;
      b.viewedAt = new Date().toISOString();
      persistSoon();
      renderDetail();
      openBook();          // the book opens over the list; closing it returns here
    };
    if (theme().hoverCard) {
      row.onmouseenter = (e) => showCard(b, row, e.clientX);
      row.onmouseleave = scheduleHideCard;
    }
    list.appendChild(row);
  }

  list.querySelectorAll("[data-check]").forEach((el) => {
    el.onclick = (ev) => {
      ev.stopPropagation();   // checking must not also open the row
      const id = +el.dataset.check;
      if (ftsScopedIds.has(id)) ftsScopedIds.delete(id); else ftsScopedIds.add(id);
      el.classList.toggle("on", ftsScopedIds.has(id));
      updateFtsScope();
    };
  });
  list.querySelectorAll("[data-star]").forEach((el) => {
    el.onclick = (ev) => {
      ev.stopPropagation();   // starring must not also select the row
      const bk = DATA.books.find((x) => x.id === +el.dataset.star);
      bk.favorite = !bk.favorite;
      persistSoon();
      /* Update just this star, unless we are looking at the favourites list —
         where unstarring genuinely removes the row and the list must redraw. */
      if (mode === "favorites") { renderBooks(); return; }
      el.classList.toggle("on", bk.favorite);
      el.textContent = bk.favorite ? "★" : "☆";
    };
  });

  /* A filter that matches nothing used to leave a blank white panel, which
     reads as "this button is broken" rather than "there are none of these".
     Say which list is empty, and offer the way back. */
  if (!books.length) {
    const label = filter === "all" ? "" : (filter === "overdue" ? t("overdue") : t("st_" + filter));
    list.innerHTML = `
      <div class="list-empty">
        <svg><use href="#i-search"/></svg>
        <div class="le-title">${filter === "all" ? t("emptyAll") : t("emptyFiltered").replace("{what}", label)}</div>
        ${filter === "all" ? "" : `<button type="button" class="le-btn" id="leShowAll">${t("emptyShowAll")}</button>`}
      </div>`;
    const back = $("leShowAll");
    if (back) back.onclick = () => {
      const allTab = document.querySelector('#tabs [data-filter="all"]');
      if (allTab) allTab.click();
    };
    /* The type chips (كتب / مجلات ...) hide whole kinds of record. If that is
       what emptied the list, say so and offer the one click that undoes it. */
    if (materialFilter.size < MATERIALS.length) {
      const hint = document.createElement("button");
      hint.type = "button";
      hint.className = "le-btn";
      hint.textContent = t("emptyMaterialReset");
      hint.onclick = () => { materialFilter = new Set(MATERIALS); syncMaterialUI(); renderGroups(); renderBooks(); };
      const note = document.createElement("div");
      note.className = "le-title";
      note.textContent = t("emptyMaterial");
      list.querySelector(".list-empty").append(note, hint);
    }
  }

  $("listCount").textContent = `${ud(books.length)} / ${ud(DATA.books.length)} ${t("tabAll")}`;
  const none = selectedId === null;
  $("footDel").disabled = none;

  /* The header never scrolls but the list does, so it carries a scrollbar the
     header lacks — reserve that exact width on the header or every column
     drifts out of line with its heading the moment the list needs to scroll. */
  syncListGeometry();
  refreshOfflineBadges();
}

/* Reveals the "already offline" badge on rows whose Unicode text is actually
   cached to disk — one batched IPC call instead of asking once per row, and
   starts hidden rather than guessing, so it never claims a book is offline-
   ready before that has actually been checked. */
async function refreshOfflineBadges() {
  const badges = [...document.querySelectorAll(".fmt-badge.offline[data-offline-for]")];
  if (!badges.length) return;
  const urlByBook = new Map(DATA.books.map((b) => [
    b.id, (b.files || []).find((f) => /^https?:\/\//i.test(f))
  ]));
  const urls = badges.map((el) => urlByBook.get(+el.dataset.offlineFor) || "");
  const status = await window.maktaba.cachedStatus(urls).catch(() => urls.map(() => false));
  badges.forEach((el, i) => el.classList.toggle("hidden", !status[i]));
}

/* The explicit "download everything for offline" action — Shamela's own
   "download the software with all the books" option. The background
   pre-cache already does this quietly over time; this is for a librarian who
   wants a real, waited-for answer before leaving somewhere with no internet,
   not a promise that it happened at some point. */
let downloadingAll = false;
async function doDownloadAllTexts() {
  if (downloadingAll) return;
  downloadingAll = true;
  const btn = document.querySelector('[data-act="downloadAllTexts"]');
  const label = btn && btn.querySelector("span");
  const original = label ? label.textContent : "";
  if (label) label.textContent = t("downloadingAll");
  try {
    const res = await window.maktaba.downloadAllTexts(DATA);
    if (!res || res.total === 0) toast(t("noOfflineTexts"));
    else if (res.failed) toast(t("downloadAllPartial").replace("{ok}", ud(res.downloaded + res.alreadyCached)).replace("{n}", ud(res.total)));
    else toast(t("downloadAllDone").replace("{n}", ud(res.total)));
    refreshOfflineBadges();
  } finally {
    if (label) label.textContent = original;
    downloadingAll = false;
  }
}

function renderDetail() {
  const r = _renderDetail();
  applyReadOnly();
  return r;
}

function _renderDetail() {
  const body = $("detailBody");
  const b = DATA.books.find((x) => x.id === selectedId);
  if (!b) {
    body.innerHTML = `<div class="dempty"><svg><use href="#i-book"/></svg><span>${t("detailEmpty")}</span></div>`;
    /* The book window now stays open over the list, so anything that clears
       the selection (side menu, category click, delete, a sync) would leave
       it showing an empty "choose a book" card. No book, no window. */
    $("bookView").classList.add("hidden");
    return;
  }

  body.innerHTML = `
    <div class="coverbox" id="coverBox"></div>
    <label class="lead">${t("fTitle").replace(" *", "")}</label><input id="dTitle" />
    <label class="lead">${t("fAuthor")}</label><input id="dAuthor" />
    <label class="lead">${t("fPublisher")}</label><input id="dPublisher" />
    <label>${t("fCategory")}</label><input id="dCategory" autocomplete="off" />
    <label>${t("fVolumes")}</label><input id="dVolumes" type="number" min="0" />
    <label class="lead">${t("fMaktaba")}</label>
    <select id="dMaktaba"></select>
    <label class="lead">${t("fDepartment")}</label><input id="dDepartment" autocomplete="off" />
    <label class="lead">${t("fShelf")}</label><input id="dAlmari" />
    <label>${t("fNotes")}</label><textarea id="dNotes"></textarea>
    <label>${t("fFormat")}</label>
    <select id="dFormat">
      <option value="physical">${t("fmtPhysical")}</option>
      <option value="pdf">${t("fmtPdf")}</option>
      <option value="unicode">${t("fmtUnicode")}</option>
    </select>
    <label class="chk hasprint"><input type="checkbox" id="dHasPrint" /><span>${t("hasPrintLabel")}</span></label>
    <p class="hint" id="hasPrintHint"></p>
    <div class="filerow" id="fileRow"></div>
    <div class="tracking" id="tracking"></div>`;

  $("dTitle").value = b.title || "";
  $("dAuthor").value = b.author || "";
  $("dPublisher").value = b.publisher || "";
  $("dCategory").value = b.category || "";
  $("dVolumes").value = b.volumes ?? 0;
  fillMaktabaSelect($("dMaktaba"), b.maktaba);
  updateDeptList(b.maktaba);
  $("dDepartment").value = b.department || "";
  $("dAlmari").value = b.almari || "";
  $("dNotes").value = b.notes || "";
  $("dFormat").value = b.format || "physical";
  // Rebuilt from scratch on every renderDetail() call — re-attach each time.
  attachCombobox($("dCategory"), () => categoryChoices());
  attachCombobox($("dDepartment"), () => departmentsFor($("dMaktaba").value));
  renderCover(b);
  renderFileRow(b);

  const bind = (id, field, cast) => {
    $(id).onchange = () => {
      b[field] = cast ? cast($(id).value) : $(id).value.trim();
      persist();
      renderGroups();
      renderBooks();
    };
  };
  $("dTitle").onchange = () => {
    const v = $("dTitle").value.trim();
    const dupEdit = findDuplicateTitle(v, b.id, b.author);
    if (!v || dupEdit) {
      $("dTitle").value = b.title || "";
      if (dupEdit) toast(dupMessage(dupEdit));
      return;
    }
    b.title = v;
    persist();
    renderGroups();
    renderBooks();
  };
  bind("dAuthor", "author");
  bind("dPublisher", "publisher");
  bind("dCategory", "category");
  bind("dVolumes", "volumes", (v) => parseInt(v, 10) || 0);
  bind("dDepartment", "department");
  bind("dAlmari", "almari");
  bind("dNotes", "notes");
  $("dMaktaba").onchange = () => {
    b.maktaba = $("dMaktaba").value;
    updateDeptList(b.maktaba);
    persist();
    renderGroups();
    renderBooks();
  };
  $("dHasPrint").checked = Boolean(b.hasPrint);
  $("hasPrintHint").textContent = b.hasPrint ? "" : t("digitalOnlyHint");

  $("dFormat").onchange = () => {
    b.format = $("dFormat").value;
    // "No digital file" cannot have digital files attached to it.
    if (b.format === "physical") b.files = [];
    /* Choosing a digital format no longer implies the printed copy is gone —
       that is now the librarian's own separate answer, so it is left alone. */
    persist();
    renderFileRow(b);
    renderDetail();
    renderBooks();
  };

  /* The one control that decides whether this record can be lent at all.
     Turning it off on a book that is currently out would strand that loan,
     so the loan has to be closed first. */
  $("dHasPrint").onchange = () => {
    const want = $("dHasPrint").checked;
    if (!want && b.status === "issued") {
      $("dHasPrint").checked = true;
      toast(t("cannotDropPrintWhileIssued"));
      return;
    }
    b.hasPrint = want;
    if (!want) { b.status = "available"; b.present = true; }
    persist();
    renderDetail();
    renderBooks();
    renderGroups();
  };

  renderTracking(b);
}

/* The tracking panel is the heart of a physical catalogue: where is this
   copy right now, who has it, and when is it due back. */
function renderTracking(b) {
  const box = $("tracking");
  if (!box) return;

  /* Circulation is about a physical object. A record that is only a PDF or a
     text file has nothing to hand over, nothing to put back on an almari and
     nothing that can go missing, so the whole panel is replaced by a note
     saying why rather than showing controls that cannot mean anything. */
  if (!b.hasPrint) {
    box.innerHTML = `
      <div class="track-head">${t("trackingHead")}</div>
      <div class="digital-only">
        <svg><use href="#i-searchbook"/></svg>
        <div>${t("digitalOnlyNote")}</div>
      </div>`;
    return;
  }

  const hist = b.history.length
    ? `<div class="hist">${b.history.slice(0, 6).map((h) =>
        `<div class="hist-row"><span class="hist-date">${esc(h.date)}</span><span>${t("ev_" + h.action) || esc(h.action)}${h.detail ? " — " + esc(h.detail) : ""}</span></div>`
      ).join("")}</div>`
    : "";

  /* The panel leads with where the copy is right now, in plain words, then
     offers only the moves that make sense from that state. Showing "issue"
     next to a book that is already out is how registers drift out of step. */
  const isDept = b.issueType === "department";
  const whereClass = b.status === "available" ? "ok" : b.status === "missing" ? "bad" : "out";
  const whereText = b.status === "available"
    ? `${t("whereShelf")}${b.almari ? ` · ${t("fShelf")} ${esc(b.almari)}` : ""}`
    : b.status === "missing"
      ? t("whereMissing")
      : `${isDept ? t("whereDept") : t("wherePerson")} · ${esc(heldByLine(b))}`;

  box.innerHTML = `
    <div class="track-head">${t("trackingHead")}</div>

    <div class="where ${whereClass}">
      <span class="where-dot"></span>
      <div>
        <div class="where-k">${t("st_" + b.status)}</div>
        <div class="where-v">${whereText}</div>
      </div>
    </div>

    ${b.status === "issued" ? `
      ${isDept ? `
        <label>${t("fToDepartment")}</label><input id="dToDept" />
        <label>${t("fToAlmari")}</label><input id="dToAlmari" />
      ` : `
        <label>${t("fBorrower")}</label><input id="dBorrower" />
        <label>${t("fBorrowerAddress")}</label><input id="dBorrowerAddress" data-t-ph="addressPh" />
        <label>${t("fBorrowerPhone")}</label><input id="dBorrowerPhone" data-t-ph="phonePh" />
      `}
      <label>${t("fIssueDate")}</label><input id="dIssueDate" type="date" />
      <label>${t("fDueDate")}</label><input id="dDueDate" type="date" />
      <div class="hint" id="durationLine"></div>
      <button class="wide-btn ok" id="btnReturn"><svg><use href="#i-check"/></svg><span>${isDept ? t("markBack") : t("markReturned")}</span></button>
    ` : `
      <div class="track-acts">
        <button class="wide-btn" id="btnIssue" ${b.status === "missing" ? "disabled" : ""}>
          <svg><use href="#i-upload"/></svg><span>${t("issueBook")}</span>
        </button>
        <button class="wide-btn" id="btnTransfer" ${b.status === "missing" ? "disabled" : ""}>
          <svg><use href="#i-shelf"/></svg><span>${t("transferBook")}</span>
        </button>
      </div>`}

    <div class="track-more">
      ${b.status !== "missing"
        ? `<button class="link-btn danger" id="btnMissing">${t("markMissing")}</button>`
        : `<button class="link-btn" id="btnFound">${t("markFound")}</button>`}
    </div>
    ${hist}`;

  if (b.status === "issued") {
    const bindT = (id, field, onDateChange) => {
      const el = $(id);
      if (!el) return;
      el.onchange = () => {
        b[field] = el.value.trim();
        if (onDateChange) renderDurationLine(b);
        persist();
        renderBooks();
        renderTracking(b);
      };
    };
    if (isDept) {
      $("dToDept").value = b.toDepartment || "";
      $("dToAlmari").value = b.toAlmari || "";
      bindT("dToDept", "toDepartment");
      bindT("dToAlmari", "toAlmari");
    } else {
      $("dBorrower").value = b.borrower || "";
      $("dBorrowerAddress").value = b.borrowerAddress || "";
      $("dBorrowerPhone").value = b.borrowerPhone || "";
      bindT("dBorrower", "borrower");
      bindT("dBorrowerAddress", "borrowerAddress");
      bindT("dBorrowerPhone", "borrowerPhone");
    }
    $("dIssueDate").value = b.issueDate || "";
    $("dDueDate").value = b.dueDate || "";
    renderDurationLine(b);
    bindT("dIssueDate", "issueDate", true);
    bindT("dDueDate", "dueDate", true);

    $("btnReturn").onclick = async () => {
      const ok = await askConfirm({
        title: isDept ? t("confirmBackTitle") : t("confirmReturnTitle"),
        body: `<p class="ask-book">${esc(b.title)}</p>
               <p>${isDept ? t("confirmBackBody") : t("confirmReturnBody")}</p>
               <p class="ask-who">${esc(heldByLine(b))}</p>
               ${b.almari ? `<p class="hint">${t("backToAlmari")} ${esc(b.almari)}</p>` : ""}`,
        go: isDept ? t("markBack") : t("markReturned")
      });
      if (ok) setStatus(b, "available");
    };
  } else {
    const iss = $("btnIssue");
    if (iss) iss.onclick = () => openIssueDialog(b, "person");
    const tr = $("btnTransfer");
    if (tr) tr.onclick = () => openIssueDialog(b, "department");
  }

  const miss = $("btnMissing");
  if (miss) miss.onclick = async () => {
    const ok = await askConfirm({
      title: t("confirmMissingTitle"),
      body: `<p class="ask-book">${esc(b.title)}</p><p>${t("confirmMissingBody")}</p>`,
      go: t("markMissing"),
      danger: true
    });
    if (ok) setStatus(b, "missing");
  };
  const found = $("btnFound");
  if (found) found.onclick = () => setStatus(b, "available");
}

/* One confirmation dialog, reused. Circulation is the part of this app where
   a mistaken click rewrites a physical fact — a book marked returned that is
   still out, or marked missing when it is only on another department's shelf.
   Every one of those asks first, and says what it is about to do. */
function askConfirm(opts) {
  return new Promise((resolve) => {
    $("askTitle").textContent = opts.title || "";
    $("askBody").innerHTML = opts.body || "";
    const go = $("askGo");
    go.textContent = opts.go || t("btnConfirm");
    go.classList.toggle("danger", Boolean(opts.danger));
    const dlg = $("dlgAsk");

    const done = (yes) => {
      go.onclick = null;
      $("askCancel").onclick = null;
      dlg.close();
      resolve(yes);
    };
    go.onclick = () => done(true);
    $("askCancel").onclick = () => done(false);
    dlg.onclose = () => resolve(false);
    dlg.showModal();
    setTimeout(() => go.focus(), 50);
  });
}

/* Where the copy physically is right now, in one line, whoever holds it. */
/* On this machine's own records, borrower is the real name. On a synced copy
   it is deliberately blank — GitHub never carries it — so an empty string
   there means "issued to a person, name kept private", not "no name was
   ever recorded", and the two must not look the same. */
function heldByLine(b) {
  if (b.status !== "issued") return "";
  if (b.issueType === "department") {
    return `${b.toDepartment || "—"}${b.toAlmari ? ` · ${t("fShelf")} ${b.toAlmari}` : ""}`;
  }
  return b.borrower || t("borrowerHidden");
}

/* Shows how many days a loan runs and how many remain — the "کتنے دن کے
   لیے کتاب لی ہے" answer, computed rather than separately stored so the
   issue date and due date stay the single source of truth. */
function renderDurationLine(b) {
  const el = $("durationLine");
  if (!el) return;
  if (!b.issueDate || !b.dueDate) { el.textContent = ""; return; }
  const MS_DAY = 86400000;
  const total = Math.round((new Date(b.dueDate) - new Date(b.issueDate)) / MS_DAY);
  const left = Math.round((new Date(b.dueDate) - new Date(todayISO())) / MS_DAY);
  const leftText = left < 0
    ? t("daysOverdue").replace("{n}", ud(Math.abs(left)))
    : t("daysLeft").replace("{n}", ud(left));
  // A due date typed before the issue date has no meaningful length; say only how late it is.
  el.textContent = total >= 0 ? `${t("durationDays").replace("{n}", ud(total))} — ${leftText}` : leftText;
}

/* Issuing asks who is taking the book before it leaves the shelf — a loan
   with no borrower recorded is exactly the untracked case this replaces. */
function openIssueDialog(b, kind) {
  if (!requireMaster()) return;
  let mode = ISSUE_TYPES.includes(kind) ? kind : "person";

  $("iBook").textContent = `${b.title} — ${t("fAccession")} ${ud(b.accession || "")}`;
  $("iBorrower").value = "";
  $("iAddress").value = "";
  $("iPhone").value = "";
  $("iDept").value = "";
  $("iAlmari").value = "";
  $("iDays").value = 14;
  $("iHint").textContent = "";

  /* One dialog, two kinds of movement. The fields swap rather than both being
     shown, because a department transfer has no borrower and a personal loan
     has no receiving almari, and offering both invites half-filled records. */
  const paint = () => {
    document.querySelectorAll("#dlgIssue [data-itype]").forEach((btn) =>
      btn.classList.toggle("on", btn.dataset.itype === mode));
    $("iPersonFields").classList.toggle("hidden", mode !== "person");
    $("iDeptFields").classList.toggle("hidden", mode !== "department");
    $("iTitle").textContent = mode === "department" ? t("transferTitle") : t("issueTitle");
    $("iSave").textContent = mode === "department" ? t("transferBook") : t("issueBook");
    setTimeout(() => (mode === "department" ? $("iDept") : $("iBorrower")).focus(), 40);
  };

  document.querySelectorAll("#dlgIssue [data-itype]").forEach((btn) => {
    btn.onclick = () => { mode = btn.dataset.itype; $("iHint").textContent = ""; paint(); };
  });

  const recalc = () => {
    const days = parseInt($("iDays").value, 10) || 0;
    const due = new Date();
    due.setDate(due.getDate() + days);
    $("iDue").value = localISO(due);
  };
  recalc();
  $("iDays").oninput = recalc;
  paint();
  $("dlgIssue").showModal();

  $("iSave").onclick = async () => {
    const who = mode === "department" ? $("iDept").value.trim() : $("iBorrower").value.trim();
    if (!who) {
      $("iHint").textContent = mode === "department" ? t("needDept") : t("needBorrower");
      (mode === "department" ? $("iDept") : $("iBorrower")).focus();
      return;
    }
    const almari = $("iAlmari").value.trim();

    const ok = await askConfirm({
      title: mode === "department" ? t("confirmTransferTitle") : t("confirmIssueTitle"),
      body: `<p class="ask-book">${esc(b.title)}</p>
             <p>${mode === "department" ? t("confirmTransferBody") : t("confirmIssueBody")}</p>
             <p class="ask-who">${esc(who)}${mode === "department" && almari ? ` · ${t("fShelf")} ${esc(almari)}` : ""}</p>
             <p class="hint">${t("fDueDate")}: ${esc($("iDue").value)}</p>`,
      go: mode === "department" ? t("transferBook") : t("issueBook")
    });
    if (!ok) return;

    b.issueType = mode;
    if (mode === "department") {
      b.toDepartment = who;
      b.toAlmari = almari;
      b.borrower = "";
      b.borrowerContact = "";
      b.borrowerAddress = "";
      b.borrowerPhone = "";
    } else {
      b.borrower = who;
      b.borrowerAddress = $("iAddress").value.trim();
      b.borrowerPhone = $("iPhone").value.trim();
      b.borrowerContact = b.borrowerAddress;   // kept so older readers still show something
      b.toDepartment = "";
      b.toAlmari = "";
    }
    b.issueDate = todayISO();
    b.dueDate = $("iDue").value || b.dueDate;
    b.borrowDays = parseInt($("iDays").value, 10) || null;
    b.status = "issued";
    b.present = true;
    logHistory(b, mode === "department" ? "transferred" : "issued", who);
    persist();
    $("dlgIssue").close();
    renderGroups();
    renderBooks();
    renderTracking(b);
    toast((mode === "department" ? t("transferredTo") : t("issuedTo")) + " " + who);
  };
}

/* Subject list management. Deleting a subject never edits a book: the books
   keep whatever subject text they already have, the label simply stops being
   offered for new entries. The count is shown so nobody deletes blind. */
function renderCategoryManager() {
  const box = $("catManBody");
  const counts = new Map();
  DATA.books.forEach((b) => counts.set(b.category, (counts.get(b.category) || 0) + 1));

  box.innerHTML = categories().map((c, i) => `
    <div class="cat-row">
      <span class="cat-name">${esc(c)}</span>
      <span class="cat-count">${ud(counts.get(c) || 0)}</span>
      <button class="tbtn danger" data-delcat="${i}" title="${t("mDelete")}"><svg><use href="#i-x"/></svg></button>
    </div>`).join("") || `<div class="hint">${t("noCategories")}</div>`;

  box.querySelectorAll("[data-delcat]").forEach((btn) => {
    btn.onclick = () => {
      /* showCategoryManager() already gates opening this dialog to master
         only, but that check runs once at open time — if master status is
         lost while the dialog is still sitting open (heartbeat loss,
         another device claiming the lock), this button would otherwise
         still fire and the UI would show the category gone while the
         write silently never reaches disk. Same reasoning as the cover-
         removal fix right above. */
      if (!requireMaster()) return;
      const idx = +btn.dataset.delcat;
      const name = categories()[idx];
      const inUse = counts.get(name) || 0;
      const msg = inUse
        ? `${name} — ${t("catInUse").replace("{n}", ud(inUse))}`
        : `${name} — ${t("confirmDelete")}`;
      if (!confirm(msg)) return;
      categories().splice(idx, 1);
      persist();
      refreshCategoryList();
      renderCategoryManager();
      renderAll();
    };
  });
}

function addCategory() {
  const name = $("catNew").value.trim();
  if (!name) { $("catNew").focus(); return; }
  if (categories().includes(name)) { toast(t("catExists")); return; }
  categories().push(name);
  $("catNew").value = "";
  persist();
  refreshCategoryList();
  renderCategoryManager();
  renderAll();
  toast(t("catAdded"));
}

function showCategoryManager() {
  if (!requireMaster()) return;
  renderCategoryManager();
  $("dlgCats").showModal();
  $("catNew").value = "";
}

/* The loan register: who has what, and what is late. This is the report a
   librarian actually needs at the desk. */
function showIssued() {
  const issued = DATA.books.filter((b) => b.status === "issued")
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const body = $("issuedBody");
  body.innerHTML = issued.length
    ? `<div class="iss-table wide">
        <div class="iss-head">
          <span>${t("colAccession")}</span><span>${t("colBook")}</span>
          <span>${t("fBorrower")}</span><span>${t("fBorrowerAddress")}</span>
          <span>${t("fBorrowerPhone")}</span><span>${t("fDueDate")}</span>
        </div>
        ${issued.map((b) => `
          <div class="iss-row${isOverdue(b) ? " late" : ""}">
            <span>${ud(b.accession || "")}</span>
            <span>${esc(b.title)}</span>
            <span>${esc(heldByLine(b)) || "—"}<span class="who-kind">${b.issueType === "department" ? t("whereDept") : t("wherePerson")}</span></span>
            <span>${b.issueType === "person" ? esc(b.borrowerAddress || b.borrowerContact || "—") : "—"}</span>
            <span dir="ltr" class="iss-phone">${b.issueType === "person" ? esc(b.borrowerPhone || "—") : "—"}</span>
            <span>${esc(b.dueDate) || "—"}${isOverdue(b) ? ` · ${t("overdue")}` : ""}</span>
          </div>`).join("")}
      </div>`
    : `<div class="hint">${t("noneIssued")}</div>`;
  $("dlgIssued").showModal();
}

function setStatus(b, next) {
  if (!requireMaster()) return;
  if (b.status === next) return;
  if (next === "issued") {
    b.issueDate = todayISO();
    const due = new Date();
    due.setDate(due.getDate() + 14);          // 14-day loan, the usual madrassa period
    b.dueDate = localISO(due);
    logHistory(b, "issued", b.borrower);
  } else if (b.status === "issued" && next === "available") {
    // Clears whichever holder it had, so a book cannot come back still
    // carrying the last borrower's name or the other department's almari.
    logHistory(b, b.issueType === "department" ? "broughtBack" : "returned", heldByLine(b));
    b.borrower = "";
    b.borrowerContact = "";
    b.borrowerAddress = "";
    b.borrowerPhone = "";
    b.toDepartment = "";
    b.toAlmari = "";
    b.issueType = "person";
    b.issueDate = "";
    b.dueDate = "";
    b.borrowDays = null;
  } else {
    logHistory(b, next);
  }
  b.status = next;
  b.present = next !== "missing";
  persist();
  renderGroups();
  renderBooks();
  renderTracking(b);
}

const baseName = (p) => String(p || "").split(/[\\/]/).pop();

/* بطاقۃ الکتاب — Shamela shows a book card; this is that card on hover, with
   the cover image when the record has one. */
let cardTimer = null;

const CARD_HOVER_DELAY_MS = 350;

function showCard(b, row, cursorX) {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    const card = $("bookCard");
    const src = imageSrc(b.image);
    /* Shamela writes each fact as one running line, "label: value", not as
       two aligned columns — that is what makes its card read like a title
       page rather than a form. */
    const line = (label, value) => value
      ? `<div class="bc-line"><span class="bc-k">${label}:</span> <span class="bc-v">${esc(value)}</span></div>`
      : "";

    /* Laid out like Shamela's own book card: the title carrying its author in
       brackets, the section beneath it, a full-width rule, then the record as
       running "label: value" lines. The cover is the one addition, floated to
       the inline-end so it never breaks that column of text, and drawn only
       when the book actually has one. */
    card.innerHTML = `
      ${src ? `<img class="bc-img" src="${esc(src)}" alt="" />` : ""}
      <div class="bc-head">${esc(b.title)}${b.author ? `  <span class="bc-paren">(${esc(b.author)})</span>` : ""}</div>
      ${b.category ? `<div class="bc-cat">${t("fCategory")}: ${esc(b.category)}</div>` : ""}
      <div class="bc-rule"></div>
      <div class="bc-body">
        ${line(t("fTitle").replace(" *", ""), b.title)}
        ${line(t("fAuthor"), b.author)}
        ${line(t("fPublisher"), b.publisher)}
        ${/* Where the copy physically sits is the whole point of this card, so
              it is shown even when nobody has filled it in yet — a blank line
              prompts the librarian; a missing line just looks like a bug. */""}
        ${line(t("fShelf"), b.almari || "—")}
        ${line(t("fAccession"), ud(b.accession || ""))}
        ${line(t("fVolumes"), b.volumes ? ud(b.volumes) : "")}
        ${line(t("fMaktaba"), b.maktaba)}
        ${line(t("fDepartment"), b.department)}
        ${line(t("railStatus"), t("st_" + b.status))}
        ${b.status === "issued"
          ? line(b.issueType === "department" ? t("fToDepartment") : t("fBorrower"), heldByLine(b))
          : ""}
        ${b.status === "issued" && b.issueType === "person" ? line(t("fBorrowerAddress"), b.borrowerAddress || b.borrowerContact) : ""}
        ${b.status === "issued" && b.issueType === "person" ? line(t("fBorrowerPhone"), b.borrowerPhone) : ""}
        ${line(t("fDueDate"), b.dueDate)}
        ${line(t("fFormat"), b.format === "physical" ? t("fmtPhysical") : b.format === "pdf" ? t("fmtPdf") : t("fmtUnicode"))}
        ${(b.files || []).length ? line(t("attachedFiles"), ud(b.files.length)) : ""}
        ${line(t("fNotes"), b.notes)}
        ${isOverdue(b) ? `<div class="bc-note">[${t("overdue")}]</div>` : ""}
      </div>`;

    card.classList.add("show");
    positionCard(row, cursorX);
  }, CARD_HOVER_DELAY_MS);
}

/* Which SIDE the card opens on follows the pointer: hovering on the left
   half of the window opens it to the right, hovering on the right half
   opens it to the left — so the card lands in the space you are not
   looking at, never on top of it.
   It is offset clear of the pointer rather than placed under it. A card
   that sits under the cursor takes the hover for itself: its own
   mouseenter keeps cancelling the hide timer, the row beneath stops
   getting the mouseleave it needs, and it stays stuck on screen covering
   whatever was there. Vertically it stays level with its own row. */
function positionCard(row, cursorX) {
  const card = $("bookCard");
  const r = row.getBoundingClientRect();
  /* getBoundingClientRect, not offsetWidth/offsetHeight — the app's text-size
     setting is CSS `zoom` on body (see style.css's --z comment), and under
     zoom those two disagree: offsetWidth/offsetHeight report the UNZOOMED
     value the CSS declares, while getBoundingClientRect (and the mouse's own
     cursorX, and window.innerWidth/innerHeight, and every row's own rect)
     report the real ON-SCREEN pixel the cursor actually sits at. Mixing them
     — as this used to — computes correct-looking math in the wrong unit
     system: at the "large" text size (zoom 1.12) offsetWidth said 470 while
     the card's real rendered width was 526, so every position came out
     scaled by that same 1.12 and landed in the wrong place entirely. Do the
     comparisons in real pixels throughout, then divide back by the zoom
     factor once, at the very end, only when actually assigning to
     style.left/top (a CSS length, which zoom scales up again on render). */
  const cardRect = card.getBoundingClientRect();
  const w = cardRect.width;
  const h = cardRect.height;
  const GAP = 10;
  const VGAP = 4;
  const OFFSET = 18;
  const x = typeof cursorX === "number" ? cursorX : r.left + r.width / 2;

  /* Compare against the picker (or the nearest dialog, for the book-view
     panel's own row uses), not window.innerWidth — the dialog rarely fills
     the whole application window. */
  const host = row.closest("dialog") || document.body;
  const hostRect = host.getBoundingClientRect();

  /* Which side actually has room, not just "which half of the dialog" —
     a row near the dialog's own edge could measure as being in the "wrong"
     half while still having plenty of space on its real near side. Prefer
     whichever side the card fits on outright; if neither fits cleanly,
     take whichever offers more room rather than always defaulting to one
     side and letting the clamp below squash it. */
  const spaceRight = hostRect.right - x - OFFSET;
  const spaceLeft = x - hostRect.left - OFFSET;
  const openRight = spaceRight >= w || spaceRight >= spaceLeft;
  let left = openRight ? x + OFFSET : x - OFFSET - w;
  left = Math.max(GAP, Math.min(left, window.innerWidth - w - GAP));

  /* Vertical: never let the clamp drag the card back over the row that
     triggered it. Opening downward from the row is the normal case — most
     rows have room below. When they don't (the last few rows of a scrolled
     list), the old code just clamped to the window's bottom edge, which
     could pull the card's top back up ABOVE the row and cover the very
     name/details the librarian was hovering to read. Open upward instead —
     the card's bottom lands just above the row, never touching it — and
     only fall back to a plain clamp if the window is too short for either
     direction to fit cleanly. */
  let top;
  if (r.top + h <= window.innerHeight - GAP) {
    top = r.top;
  } else if (r.top - h - VGAP >= GAP) {
    top = r.top - h - VGAP;
  } else {
    top = Math.max(GAP, window.innerHeight - GAP - h);
  }

  // Convert back from real screen pixels to the unzoomed CSS length that
  // zoom will scale up again on render — see the comment at the top of
  // this function for why this has to happen exactly once, right here.
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 1;
  card.style.left = (left / z) + "px";
  card.style.top = (top / z) + "px";
  card.style.right = "auto";
}

/* A short grace period before hiding, and cancelling that hide if the mouse
   lands on the card itself — otherwise moving toward the card to actually
   read it is exactly what made it vanish. */
function hideCard() {
  clearTimeout(cardTimer);
  $("bookCard").classList.remove("show");
}
function scheduleHideCard() {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(hideCard, 180);
}
/* The card is pointer-events:none (deliberately — it must never steal a
   click from whatever it happens to be floating over), which means it can
   never receive its own mouseenter/mouseleave: every mouse event over it
   passes straight through to the row or panel underneath. The card's own
   enter/leave listeners that used to sit here never fired at all — dead
   code, not a working "stay open while reading it" feature.
   What was actually happening: the card is real content sitting fully
   opaque on top of the list, so as the cursor kept moving — down toward
   the next row, say — it would end up geometrically UNDER the card, which
   kept right on showing whatever it last showed while the row and its
   title text the cursor was now sitting over stayed hidden behind it.
   Tracked here instead: whenever the cursor's real position falls inside
   the card's own box while it's visible, drop the card immediately, so
   the cursor is never sitting on top of something it can't see under. */
document.addEventListener("mousemove", (e) => {
  const card = $("bookCard");
  if (!card.classList.contains("show")) return;
  const r = card.getBoundingClientRect();
  if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
    hideCard();
  }
});

function renderCover(b) {
  const box = $("coverBox");
  if (!box) return;
  const src = imageSrc(b.image);
  box.innerHTML = src
    ? `<img class="cover-img" src="${esc(src)}" alt="" />
       <div class="cover-acts">
         <button class="tbtn" id="btnPickImg" title="${t("changePhoto")}"><svg><use href="#i-image"/></svg></button>
         <button class="tbtn" id="btnSearchImg" title="${t("searchCover")}"><svg><use href="#i-search"/></svg></button>
         <button class="tbtn" id="btnUrlImg" title="${t("photoFromUrl")}"><svg><use href="#i-globe"/></svg></button>
         <button class="tbtn danger" id="btnDropImg" title="${t("removePhoto")}"><svg><use href="#i-x"/></svg></button>
       </div>`
    : `<div class="cover-empty-wrap">
         <button class="cover-empty" id="btnPickImg">
           <svg><use href="#i-image"/></svg><span>${t("addPhoto")}</span>
         </button>
         <div class="cover-empty-row">
           <button class="tbtn url-btn" id="btnSearchImg"><svg><use href="#i-search"/></svg><span>${t("searchCover")}</span></button>
           <button class="tbtn url-btn" id="btnUrlImg"><svg><use href="#i-globe"/></svg><span>${t("photoFromUrl")}</span></button>
         </div>
       </div>`;

  $("btnPickImg").onclick = async () => {
    const p = await window.maktaba.pickImage();
    if (p) { b.image = p; persist(); renderCover(b); renderBooks(); }
  };

  /* Opens a real Google Images search for this book, so the librarian can
     look at the result and copy a link — see the note in main.js on why this
     is not fully automatic: cover art is copyrighted design, not a fact. */
  $("btnSearchImg").onclick = () => {
    const q = [b.title, b.author].filter(Boolean).join(" ") + " كتاب غلاف";
    window.maktaba.searchCoverOnline(q);
    toast(t("searchOpened"));
  };

  /* Downloading the cover rather than hot-linking it: the picture must still
     be there when the madrassa PC is offline.

     This used window.prompt() before — Electron does not implement it in a
     normal window, so the call silently returned nothing and the button did
     visibly nothing. A real dialog, matching every other input in this app,
     replaces it. */
  $("btnUrlImg").onclick = () => {
    $("imgUrlInput").value = "";
    $("dlgImgUrl").showModal();
    setTimeout(() => $("imgUrlInput").focus(), 50);
    $("imgUrlInput").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("imgUrlSave").click(); } };

    $("imgUrlSave").onclick = async () => {
      const url = $("imgUrlInput").value.trim();
      if (!url) { $("imgUrlInput").focus(); return; }
      $("dlgImgUrl").close();
      toast(t("downloading"));
      const res = await window.maktaba.downloadImage(url, b.id);
      if (res.ok) {
        b.image = res.path;
        persist();
        renderCover(b);
        renderBooks();
        toast(t("photoSaved"));
      } else {
        alert(t("photoFailed") + " " + (res.error || ""));
      }
    };
  };

  const drop = $("btnDropImg");
  if (drop) drop.onclick = () => {
    // Every other delete action (file, category, book) re-checks this —
    // cover removal didn't, so a reader could see the cover vanish from
    // their own screen while the write silently never reached disk, since
    // the main process refuses it anyway. Consistent now, and it means the
    // UI never shows a change that didn't actually happen.
    if (!requireMaster()) return;
    b.image = "";
    persist();
    renderCover(b);
    renderBooks();
  };
}

/* One book can hold many scans — a PDF per volume is the normal case for a
   multi-volume fatawa set, so the attachment is a list, not a single slot. */
function renderFileRow(b) {
  const row = $("fileRow");
  if (!row) return;
  if (b.format === "physical") { row.innerHTML = ""; return; }

  const items = (b.files || []).map((p, i) => `
    <div class="fileitem">
      <span class="filename" title="${p}">${baseName(p)}</span>
      ${/* A Unicode text file opens in the app so it can be searched; a PDF
            still goes to the system viewer, because its pages are images. */""}
      ${b.format === "unicode"
        ? `<button class="tbtn" data-read="${i}" title="${t("readInApp")}"><svg><use href="#i-searchbook"/></svg></button>`
        : ""}
      <button class="tbtn" data-open="${i}" title="${t("openFile")}"><svg><use href="#i-book"/></svg></button>
      <button class="tbtn danger" data-drop="${i}" title="${t("removeFile")}"><svg><use href="#i-x"/></svg></button>
    </div>`).join("");

  row.innerHTML = `
    ${items || `<div class="hint">${t("noFileAttached")}</div>`}
    <div class="attach-row">
      <button class="tbtn attach-btn" id="btnAttach">
        <svg><use href="#i-upload"/></svg><span>${t("attachFile")}</span>
      </button>
      <button class="tbtn attach-btn" id="btnAttachUrl">
        <svg><use href="#i-globe"/></svg><span>${t("attachFromUrl")}</span>
      </button>
    </div>`;

  $("btnAttach").onclick = async () => {
    const picked = await window.maktaba.pickFile(b.format);
    const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (!list.length) return;
    b.files = [...(b.files || []), ...list.filter((p) => !(b.files || []).includes(p))];
    persist();
    renderFileRow(b);
    renderBooks();
  };

  /* A GitHub Release asset, or any other stable link — downloaded once so it
     keeps working offline, same reasoning as the cover-image download. */
  $("btnAttachUrl").onclick = () => {
    $("fileUrlInput").value = "";
    $("dlgFileUrl").showModal();
    setTimeout(() => $("fileUrlInput").focus(), 50);
    $("fileUrlInput").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("fileUrlSave").click(); } };

    $("fileUrlSave").onclick = async () => {
      const url = $("fileUrlInput").value.trim();
      if (!url) { $("fileUrlInput").focus(); return; }
      $("dlgFileUrl").close();
      toast(t("downloading"));
      const res = await window.maktaba.downloadFile(url, b.format);
      if (res.ok) {
        b.files = [...(b.files || []), res.path];
        persist();
        renderFileRow(b);
        renderBooks();
        toast(t("photoSaved"));
      } else {
        alert(t("photoFailed") + " " + (res.error || ""));
      }
    };
  };
  row.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = async () => {
      const res = await window.maktaba.openFile(b.files[+btn.dataset.open]);
      /* A hosted scan is downloaded on first open. Offline, that is the one
         thing that cannot be done, and saying nothing looked like a dead
         button. */
      if (res && !res.ok) toast(t(res.error === "offline" ? "fileOffline" : "fileMissing"));
      else refreshOfflineBadges();
    };
  });
  row.querySelectorAll("[data-read]").forEach((btn) => {
    btn.onclick = () => openReader(b, b.files[+btn.dataset.read]);
  });
  row.querySelectorAll("[data-drop]").forEach((btn) => {
    btn.onclick = () => {
      if (!requireMaster()) return;
      ftsCacheDrop(b.files[+btn.dataset.drop]);   // dropped text must leave the search cache too
      b.files.splice(+btn.dataset.drop, 1);
      persist();
      renderFileRow(b);
      renderBooks();
    };
  });
}

function renderStatus() {
  const n = (s) => DATA.books.filter((b) => b.status === s).length;
  const overdue = DATA.books.filter(isOverdue).length;
  $("sbTotal").innerHTML = `${t("total")} <b>${ud(DATA.books.length)}</b>`;
  $("sbPresent").innerHTML = `${t("st_available")} <b>${ud(n("available"))}</b>`;
  $("sbIssued").innerHTML = `${t("st_issued")} <b>${ud(n("issued"))}</b>`;
  $("sbMissing").innerHTML = `${t("st_missing")} <b>${ud(n("missing"))}</b>`;
  $("sbOverdue").innerHTML = overdue ? `<span class="warn">${t("overdue")} <b>${ud(overdue)}</b></span>` : "";
  $("sbUpdated").innerHTML = `${t("updated")} <b>${DATA.updated || "—"}</b>`;
}

/* ── Rail + tabs + search ─────────────────────────────────────────────── */

/* Shamela keeps its artwork as the window and floats the picker over it.
   The background is never swapped out; only the dialog opens and closes. */
/* Non-modal on purpose. showModal() puts the dialog in the browser's top
   layer, which greys out the toolbar behind it and floats above every
   z-index — so the hover card could never sit in front of it. Shamela's
   picker is not modal: its toolbar stays live while the picker is open. */
function showCatalog() {
  const dlg = $("dlgCatalog");
  if (!dlg.open) dlg.show();
  fitPicker();
}

/* The picker is a normal, freely movable window now — NOT forced to fill
   the working height. It opens at its default CSS size (centred), and a
   drag only has to be re-clamped so a window resize can't leave it hanging
   off the edge or larger than the screen. */
function fitPicker() {
  const dlg = $("dlgCatalog");
  if (!dlg.open) return;
  // Leave size/position exactly as opened or dragged, only re-clamp so it
  // can't end up off-screen after the window shrinks.
  if (pickerLeftPx !== null || pickerTopPx !== null) {
    const w = dlg.offsetWidth || Math.min(1560, window.innerWidth * 0.96);
    const h = dlg.offsetHeight || Math.min(760, window.innerHeight * 0.88);
    if (pickerLeftPx !== null) {
      pickerLeftPx = Math.max(0, Math.min(pickerLeftPx, window.innerWidth - w));
      dlg.style.left = pickerLeftPx + "px";
    }
    if (pickerTopPx !== null) {
      pickerTopPx = Math.max(0, Math.min(pickerTopPx, window.innerHeight - h));
      dlg.style.top = pickerTopPx + "px";
    }
  }
}
window.addEventListener("resize", fitPicker);

/* The picker can be dragged freely in both directions, the way a normal
   window moves — same pattern as the book-view panel's makeDraggable(). */
let pickerLeftPx = null;
let pickerTopPx = null;
(function makePickerDraggable() {
  const dlg = $("dlgCatalog");
  const bar = document.querySelector("#dlgCatalog .picker-bar");
  let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;

  bar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;              // buttons stay clickable
    const r = dlg.getBoundingClientRect();
    // The centring rule pins left:0/right:0/margin-inline:auto horizontally
    // and top:0/bottom:0/margin-block:auto vertically — all four sides have
    // to be broken, or the browser fights the drag back to centre exactly
    // like the earlier horizontal-only bug this fixes for both axes.
    dlg.style.right = "auto";
    dlg.style.bottom = "auto";
    dlg.style.left = r.left + "px";
    dlg.style.top = r.top + "px";
    startX = e.clientX;
    startY = e.clientY;
    startLeft = r.left;
    startTop = r.top;
    dragging = true;
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = dlg.offsetWidth, h = dlg.offsetHeight;
    pickerLeftPx = Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - w));
    pickerTopPx = Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - h));
    dlg.style.left = pickerLeftPx + "px";
    dlg.style.top = pickerTopPx + "px";
  });

  window.addEventListener("mouseup", () => { dragging = false; });
})();

/* Drag-to-resize for the picker's own columns (category list, search panel).
   Narrowed defaults are a starting point, not a ceiling — this is how a
   librarian who wants one wider just pulls it, no Settings dialog.
   Geometric rather than sign-hardcoded: works out which of the panel's two
   edges the handle sits on and keeps THAT edge fixed while dragging, so it
   behaves correctly regardless of which side of the panel it happens to be
   on under this app's RTL layout — no separate "reversed" variant needed. */
function makeColumnResizable(handle, panel, { min = 160, max = 480, storageKey } = {}) {
  if (!handle || !panel) return;
  let dragging = false;
  let fixedEdgeX = 0;
  let anchorRight = false;

  const zoom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 1;

  if (storageKey) {
    const saved = localStorage.getItem(storageKey);
    if (saved) panel.style.width = saved;
  }

  handle.addEventListener("mousedown", (e) => {
    const r = panel.getBoundingClientRect();
    const hr = handle.getBoundingClientRect();
    anchorRight = hr.left < r.left + r.width / 2;   // handle on panel's left -> right edge stays put
    fixedEdgeX = anchorRight ? r.right : r.left;
    dragging = true;
    handle.classList.add("active");
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const realWidth = anchorRight ? fixedEdgeX - e.clientX : e.clientX - fixedEdgeX;
    /* realWidth is measured in actual on-screen pixels (getBoundingClientRect/
       clientX space); style.width is a CSS length that the app's zoom text
       setting scales again on render — the exact unit mismatch fixed in
       positionCard() above. Divide back to CSS pixels here, once, same as
       there, or the panel wanders as this session's own text-size setting
       changes rather than resizing to where the cursor actually is. */
    const cssWidth = Math.max(min, Math.min(max, realWidth / zoom()));
    panel.style.width = cssWidth + "px";
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("active");
    document.body.style.cursor = "";
    if (storageKey) { try { localStorage.setItem(storageKey, panel.style.width); } catch { /* private mode */ } }
  });
}
makeColumnResizable($("groupsResizer"), document.querySelector(".groups"), { min: 160, max: 420, storageKey: "maktaba-w-groups" });
makeColumnResizable($("ftsResizer"), document.querySelector(".ftspane"), { min: 200, max: 480, storageKey: "maktaba-w-fts" });

/* The book table's columns are the user's to size, Shamela style: drag a
   heading's left edge to widen or squeeze that column; double-click any grip
   to go back to the default layout. The first drag freezes every column at
   its current width, so from then on each column is a fixed width, the row
   is as wide as its columns, and when they no longer fit the list scrolls
   sideways (the header scrolls with it). In RTL a column's right edge stays
   put while it resizes, so the edge follows the mouse. Header and rows read
   the same CSS variables, so they never drift apart. Saved per machine. */
/* Row width = the header's columns added up (see the CSS for why rows cannot
   size themselves). Also re-run by renderBooks, since showing or hiding a
   column in Options changes the total. */
/* Measured, so only valid while the list is on screen: the first render
   happens before the catalogue window is visible and read 0 for both, which
   pushed the header into the scrollbar's strip until the next redraw. The
   ResizeObserver below re-measures the moment the list appears or resizes. */
let refreshAutoColumns = () => {};   // set by makeBookColumnsResizable below
function syncListGeometry() {
  const list = $("bookList");
  refreshAutoColumns();
  document.documentElement.style.setProperty("--scrollbar-w", (list.offsetWidth - list.clientWidth) + "px");
  syncRowWidth();
}
// Next frame: re-fitting columns inside the callback changed layout mid-notification
// ("ResizeObserver loop completed with undelivered notifications").
new ResizeObserver(() => requestAnimationFrame(syncListGeometry)).observe($("bookList"));
function syncRowWidth() {
  const root = document.documentElement;
  if (!root.hasAttribute("data-cols-fixed")) return;
  const z = parseFloat(getComputedStyle(root).getPropertyValue("--z")) || 1;
  let w = 0;
  for (const c of document.querySelector(".bookhead").children) w += c.getBoundingClientRect().width;
  // floor, not ceil: rounding up made rows 1px wider than the list and
  // showed a useless 1px scrollbar.
  root.style.setProperty("--row-w", Math.floor(w / z) + "px");
}
(function makeBookColumnsResizable() {
  const root = document.documentElement;
  const zoom = () => parseFloat(getComputedStyle(root).getPropertyValue("--z")) || 1;
  const KEY = "maktaba-table-cols";
  const COLS = ["acc", "title", "author", "publisher"];
  const DEFAULT = { acc: 44, title: 260, author: 160, publisher: 120 };   // for a column hidden when frozen
  let sizes = null;
  try { sizes = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { sizes = null; }
  /* Until the user sizes a column by hand, the columns share the visible
     width by what their text needs (measured with a canvas in each cell's
     own font, over all books, so filtering does not make them jump). The old
     default gave the title all the spare room while author names were cut to
     "…". Pure fit-to-longest made one long entry stretch a whole column past
     the screen, so each column is capped at a share of the visible width
     (author 45%, title 30%, publisher 25%); room a column does not need goes
     to the ones still cut, author first. The few longest entries end in "…"
     and show in full on the hover card or when the column is dragged wider.
     Double-clicking a grip returns here. */
  let manual = Boolean(sizes);
  const canvas = document.createElement("canvas").getContext("2d");
  const TEXT = {
    acc: (b) => ud(b.accession || "—"),
    title: (b) => b.title || "",
    author: (b) => b.author || t("noAuthor"),
    publisher: (b) => b.publisher || ""
  };
  const autoWidths = () => {
    if (typeof DATA === "undefined" || !DATA || !DATA.books.length) return null;
    const out = {};
    for (const k of COLS) {
      const cell = document.querySelector(".bookrow .br-" + k);
      if (!cell) return null;
      const cs = getComputedStyle(cell);
      canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      let max = 0;
      for (const b of DATA.books) {
        // the title cell also holds the status dot and any PDF/TXT badge
        const extra = k === "title" ? 13 + ((b.format === "pdf" || b.format === "unicode") ? 40 : 0) : 0;
        max = Math.max(max, canvas.measureText(TEXT[k](b)).width + extra);
      }
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 8;   // padding, border, rounding slack
      out[k] = Math.ceil(Math.min(1200, Math.max(k === "acc" ? 44 : 60, max + pad)));
    }
    // Share out the visible width: needs above, caps below.
    const fixed = [".bh-check", ".bh-bookicon", ".bh-star"].reduce((a, sel) => a + head.querySelector(sel).getBoundingClientRect().width, 0) / zoom();
    // clientWidth is already in CSS px (unlike getBoundingClientRect, which the zoom scales).
    const avail = list.clientWidth - fixed - out.acc - 2;
    if (avail < 200) return out;   // list not laid out yet; keep the plain fit
    const need = { title: out.title, author: out.author, publisher: out.publisher };
    const SHARE = { author: 0.45, title: 0.30, publisher: 0.25 };
    let left = avail;
    for (const k of ["author", "title", "publisher"]) { out[k] = Math.min(need[k], Math.floor(avail * SHARE[k])); left -= out[k]; }
    for (const k of ["author", "title", "publisher"]) { const add = Math.min(left, need[k] - out[k]); if (add > 0) { out[k] += add; left -= add; } }
    return out;
  };
  try { localStorage.removeItem("maktaba-table-sizes"); } catch { /* old key from an earlier build */ }
  const apply = () => {
    for (const k of COLS) {
      if (sizes && sizes[k]) root.style.setProperty("--w-" + k, sizes[k] + "px");
      else root.style.removeProperty("--w-" + k);
    }
    if (sizes) root.setAttribute("data-cols-fixed", ""); else root.removeAttribute("data-cols-fixed");
    syncRowWidth();
  };
  const save = () => { try { sizes ? localStorage.setItem(KEY, JSON.stringify(sizes)) : localStorage.removeItem(KEY); } catch { /* private mode */ } };
  const head = document.querySelector(".bookhead");
  const list = $("bookList");
  apply();
  /* Measuring every book costs ~22ms, too much for every redraw. Re-measure
     only when the texts, the list width or the language change; the length
     fingerprint is a ~0.1ms pass (an edit that keeps a field's exact length
     changes its width by a hair at most). */
  let lastKey = "";
  refreshAutoColumns = () => {
    if (manual) return;
    if (typeof DATA === "undefined" || !DATA) return;
    let fp = DATA.books.length;
    for (const b of DATA.books) fp = (fp * 31 + String(b.title || "").length * 7 + String(b.author || "").length * 3 + String(b.publisher || "").length + String(b.accession || "").length) % 1000000007;
    const key = [fp, list.clientWidth, LANG, ...["data-show-acc", "data-show-pub", "data-size", "data-font", "data-density"].map((a) => root.getAttribute(a))].join("|");
    if (key === lastKey && sizes) return;
    const w = autoWidths();
    if (w) lastKey = key;
    if (!w || COLS.every((k) => sizes && sizes[k] === w[k])) return;
    sizes = w;
    apply();
  };
  /* The header follows the list by being shifted the same distance, not by
     scrolling itself: its own scroll range came out a few px shorter than
     the list's in RTL, so at the far end it lagged behind the rows. */
  const follow = () => head.style.setProperty("--hx", (-list.scrollLeft) + "px");
  list.addEventListener("scroll", follow);

  let drag = null;
  head.querySelectorAll(".th-grip").forEach((grip) => {
    grip.addEventListener("mousedown", (e) => {
      if (!sizes) {
        sizes = {};
        for (const k of COLS) {
          const w = head.querySelector(".bh-" + k).getBoundingClientRect().width / zoom();
          sizes[k] = Math.round(w >= 30 ? w : DEFAULT[k]);
        }
        apply();
      }
      // Start from the width on screen: the last column may be stretched
      // wider than its stored width, and the edge must move from where it is.
      const onScreen = head.querySelector(".bh-" + grip.dataset.col).getBoundingClientRect().width / zoom();
      drag = { col: grip.dataset.col, grip, startX: e.clientX, startW: Math.round(onScreen) };
      manual = true;   // from now on these are the user's widths, saved below
      grip.classList.add("active");
      document.body.style.cursor = "col-resize";
      e.preventDefault();
      e.stopPropagation();
    });
    // Double-click: back to auto-fit (forget the hand-set widths).
    grip.addEventListener("dblclick", () => { manual = false; sizes = null; save(); refreshAutoColumns(); });
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    // The grip sits on the column's end edge: left in RTL, right in English.
    const dx = (root.dir === "ltr" ? e.clientX - drag.startX : drag.startX - e.clientX) / zoom();
    sizes[drag.col] = Math.round(Math.max(30, Math.min(1200, drag.startW + dx)));
    apply();
    follow();
  });
  window.addEventListener("mouseup", () => {
    if (!drag) return;
    drag.grip.classList.remove("active");
    drag = null;
    document.body.style.cursor = "";
    save();
  });
})();

/* Closing the list starts the next visit fresh, like Shamela: no ticked
   books, no selected categories, no type filter, no search left over. A
   leftover type filter was what emptied the table on the client's machine
   while the category counts still said 85. */
function showHome() {
  const dlg = $("dlgCatalog");
  if (!dlg.open) return;
  dlg.close();
  groupSel.clear();
  ftsScopedIds.clear();
  ftsScopePicked.clear();
  materialFilter = new Set(MATERIALS);
  syncMaterialUI();
  $("search").value = "";
  selectedId = null;
  updateFtsScope();
  renderAll();
}

/* The book opens as a window over the list; closing it goes back to the
   list exactly as it was (the client expected this, not the list closing). */
function openBook() {
  hideCard();                                  // the hover card from the row just clicked must not linger
  $("bookView").classList.remove("hidden");
  $("detailBody").scrollTop = 0;               // start at the top, not wherever the last book was scrolled to
  const b = DATA.books.find((x) => x.id === selectedId);
  $("bvTitle").textContent = b ? b.title : "";
}

function closeBook() {
  $("bookView").classList.add("hidden");
  renderBooks();                               // keeps the row selected; shows any edit just made
  renderDetail();
}

function setMode(next) {
  $("rail").querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
  mode = next;
  groupSel.clear();
  selectedId = null;
  showCatalog();
  renderAll();
}

$("rail").querySelectorAll("[data-mode]").forEach((btn) => {
  btn.onclick = () => setMode(btn.dataset.mode);
});
/* Non-rail buttons with data-mode (currently just the home screen's "Open
   Library" button) open straight into that mode. Was hardcoded to only ever
   match data-mode="category", so it silently stopped working the day that
   button's mode changed to "books" and nothing rebound it. */
document.querySelectorAll("[data-mode]").forEach((btn) => {
  if (!btn.closest("#rail")) btn.onclick = () => setMode(btn.dataset.mode);
});
$("railHome").onclick = showHome;
$("pickerClose").onclick = showHome;
$("bvClose").onclick = closeBook;

/* A non-modal dialog gets no Escape handling from the browser, so wire it. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.querySelector("dialog[open]:modal")) return;   // let real modals handle their own Esc
  // Topmost first: the book window, then the list under it.
  if (!$("bookView").classList.contains("hidden")) { closeBook(); e.preventDefault(); return; }
  if ($("dlgCatalog").open) { showHome(); e.preventDefault(); }
});

/* Book card: drag by its bar, and maximise to fill the working area. */
function makeDraggable(handle, panel) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;

  handle.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;          // buttons stay clickable
    if (panel.classList.contains("max")) return;     // nothing to drag when maximised
    const r = panel.getBoundingClientRect();
    // switch from translate-centring to explicit coordinates on first drag
    panel.style.transform = "none";
    panel.style.left = r.left + "px";
    panel.style.top = r.top + "px";
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    dragging = true;
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    // clamp so the card can never be dragged off screen
    const nl = Math.max(0, Math.min(ox + (e.clientX - sx), window.innerWidth - w));
    const nt = Math.max(0, Math.min(oy + (e.clientY - sy), window.innerHeight - h));
    panel.style.left = nl + "px";
    panel.style.top = nt + "px";
  });

  window.addEventListener("mouseup", () => { dragging = false; });
}
makeDraggable($("bvBar"), $("bookView"));

function toggleMaxBook() {
  const bv = $("bookView");
  const btn = $("bvMax");
  const now = bv.classList.toggle("max");
  if (now) {
    bv.dataset.prev = JSON.stringify({ left: bv.style.left, top: bv.style.top, transform: bv.style.transform });
    const bar = document.querySelector(".toolbar");
    const st = document.querySelector(".statusbar");
    const top = bar ? bar.getBoundingClientRect().bottom + 10 : 110;
    const bottom = st ? st.getBoundingClientRect().height + 10 : 34;
    bv.style.top = top + "px";
    bv.style.height = (window.innerHeight - top - bottom) + "px";
  } else {
    const p = JSON.parse(bv.dataset.prev || "{}");
    bv.style.left = p.left || "";
    bv.style.top = p.top || "";
    bv.style.transform = p.transform || "";
    bv.style.height = "";
  }
  btn.querySelector("use").setAttribute("href", now ? "#i-restore" : "#i-max");
}
$("bvMax").onclick = toggleMaxBook;
// "Another book": back to the list (it sits under the book window).
$("bvPick").onclick = () => { closeBook(); showCatalog(); };
// Esc closes the dialog natively; keep our state in step with that.
$("dlgCatalog").addEventListener("close", () => {});

$("tabs").querySelectorAll("button").forEach((btn) => {
  btn.onclick = () => {
    $("tabs").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    renderBooks();
  };
});

$("sortSel").onchange = () => { sortMode = $("sortSel").value; renderBooks(); };
/* Material filter wiring. The two checkboxes are Shamela's printed /
   non-printed masters; the buttons under them toggle individual kinds. */
function syncMaterialUI() {
  document.querySelectorAll("[data-mat]").forEach((btn) => {
    btn.classList.toggle("on", materialFilter.has(btn.dataset.mat));
  });
  const printedOn = PRINTED.some((m) => materialFilter.has(m));
  const unprintedOn = MATERIALS.filter((m) => !PRINTED.includes(m)).some((m) => materialFilter.has(m));
  $("matPrinted").checked = printedOn;
  $("matUnprinted").checked = unprintedOn;
  // A book the table no longer shows must not stay ticked in the search panel.
  for (const b of DATA.books) if (!materialFilter.has(b.material)) ftsScopedIds.delete(b.id);
  updateFtsScope();
}

document.querySelectorAll("[data-mat]").forEach((btn) => {
  btn.onclick = () => {
    const m = btn.dataset.mat;
    if (materialFilter.has(m)) materialFilter.delete(m); else materialFilter.add(m);
    syncMaterialUI();
    renderGroups();
    renderBooks();
  };
});

const setGroupMaterials = (list, on) => {
  list.forEach((m) => (on ? materialFilter.add(m) : materialFilter.delete(m)));
  syncMaterialUI();
  renderGroups();
  renderBooks();
};
$("matPrinted").onchange = () => setGroupMaterials(PRINTED, $("matPrinted").checked);
$("matUnprinted").onchange = () =>
  setGroupMaterials(MATERIALS.filter((m) => !PRINTED.includes(m)), $("matUnprinted").checked);

// Redraw once typing pauses, not on every key: each redraw lays out the list.
let searchTimer = null;
$("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderBooks, 180); });
$("btnClearSearch").onclick = () => { $("search").value = ""; renderBooks(); };

/* ── Add / delete ─────────────────────────────────────────────────────── */

function syncAddOneHasPrint() {
  $("oShelfFields").classList.toggle("hidden", !$("oHasPrint").checked);
}

function openAddOne() {
  if (!requireMaster()) return;
  for (const id of ["oTitle", "oAuthor", "oPublisher", "oCategory", "oDepartment", "oShelf", "oNotes"]) $(id).value = "";
  $("oVolumes").value = 1;
  $("oFormat").value = "physical";
  $("oHasPrint").checked = true;      // most books added are physical; unchecking is the exception
  syncAddOneHasPrint();
  fillMaktabaSelect($("oMaktaba"), mode === "shelf" && singleGroup() ? singleGroup() : "");
  updateDeptList($("oMaktaba").value);
  if (mode === "category" && singleGroup()) $("oCategory").value = singleGroup();
  const next = DATA.books.reduce((m, x) => Math.max(m, parseInt(x.accession, 10) || 0), 0) + 1;
  /* Where a librarian first meets a register number, so this is where the
     explanation belongs — the client said the bare word meant nothing. */
  $("oAccHint").textContent =
    `${t("fAccession")}: ${ud(next)} — ${t("accessionAuto")}
${t("accessionExplain")}`;
  $("dlgOne").showModal();
}
$("oMaktaba").onchange = () => updateDeptList($("oMaktaba").value);
$("oHasPrint").onchange = syncAddOneHasPrint;
// Static fields on a dialog that never gets rebuilt — attach once.
attachCombobox($("oCategory"), () => categoryChoices());
attachCombobox($("oDepartment"), () => departmentsFor($("oMaktaba").value));
/* The type chosen up top sets a sensible starting point for "is there also
   a physical copy on the shelf" — checked for a physical book, unchecked
   for a PDF/Unicode text, since most of those are digital-only additions —
   but stays a real checkbox the librarian can still override either way. */
$("oFormat").onchange = () => {
  $("oHasPrint").checked = $("oFormat").value === "physical";
  syncAddOneHasPrint();
};

/* One book, one record -- but a TITLE is not a book. أحكام القرآن by al-Jassas
   and أحكام القرآن by Zafar Ahmad Usmani are two different works, and معارف
   القرآن, لغات القرآن and شرح المجلة each have several authors, so refusing a
   second entry on the title alone wrongly blocked real books. A duplicate is
   the same title AND the same author. Authors are compared loosely, because the
   same author is written many ways ("الإمام الحافظ ... العسقلاني" vs "العلامة
   ... العسقلاني ،(ت 852هـ)"): they match when they share a meaningful name
   word, or when either one is blank (no author given cannot prove a
   difference). Used by Add Book, a title edit in the detail panel, and both
   bulk modes; spelling variants of the title count as the same title. */
const AUTHOR_NOISE = new Set(["الإمام", "الامام", "العلامة", "علامه", "الشيخ", "حضرت", "مولانا", "رحمه", "الله", "محمد", "عبد", "ابو", "أبو", "ابن", "بن", "الحافظ", "للإمام", "امام", "مفتی", "المتوفى", "للعلامة"]);
const authorWords = (a) => new Set(norm(a || "").split(/[^\u0600-\u06FFA-Za-z]+/).map((w) => w.replace(/^ال/, "")).filter((w) => w.length >= 4 && !AUTHOR_NOISE.has(w)));
function sameAuthor(a, b) {
  if (!norm(a || "") || !norm(b || "")) return true;
  const x = authorWords(a), y = authorWords(b);
  if (!x.size || !y.size) return norm(a) === norm(b);
  for (const w of x) if (y.has(w)) return true;
  return false;
}
function findDuplicateTitle(title, exceptId, author) {
  const key = norm(title || "");
  if (!key) return null;
  return DATA.books.find((x) => x.id !== exceptId && norm(x.title) === key && sameAuthor(x.author, author)) || null;
}
function dupMessage(b) {
  return t("dupTitle").replace("{t}", b.title).replace("{n}", ud(b.accession || "—"));
}

$("oSave").onclick = () => {
  const hasPrint = $("oHasPrint").checked;
  /* A book with no physical copy has nowhere to sit — a branch, department or
     almari would be a fiction. Only real fields for the shelf it's on are
     required, and only when there is a shelf. */
  const required = ["oTitle", "oAuthor", "oPublisher", "oCategory", "oVolumes"]
    .concat(hasPrint ? ["oMaktaba", "oDepartment", "oShelf"] : []);
  for (const id of required) {
    const el = $(id);
    if (!el.value || !String(el.value).trim()) { el.focus(); toast(t("fieldRequired")); return; }
  }
  const title = $("oTitle").value.trim();
  const dupOne = findDuplicateTitle(title, undefined, $("oAuthor").value.trim());
  if (dupOne) { $("oTitle").focus(); toast(dupMessage(dupOne)); return; }
  const b = {
    id: nextId++,
    title,
    author: $("oAuthor").value.trim(),
    publisher: $("oPublisher").value.trim(),
    category: $("oCategory").value.trim(),
    volumes: parseInt($("oVolumes").value, 10) || 0,
    format: $("oFormat").value,
    maktaba: hasPrint ? $("oMaktaba").value : "",
    department: hasPrint ? $("oDepartment").value.trim() : "",
    almari: hasPrint ? $("oShelf").value.trim() : "",
    hasPrint,
    status: "available",
    notes: $("oNotes").value.trim()
  };
  normalizeBook(b);
  b.accession = String(DATA.books.reduce((m, x) => Math.max(m, parseInt(x.accession, 10) || 0), 0) + 1);
  logHistory(b, "added");
  DATA.books.push(b);
  selectedId = b.id;
  $("dlgOne").close();
  persist();
  renderAll();
};

/* Bulk add and bulk update share one dialog and one column order, so the
   text a librarian pastes in looks the same either way, and it carries every
   field the single Add Book form does:
     Title | Author | Category | Volumes | Publisher | Branch | Department |
     Almari | Notes | Format
   Update puts the register number first (the only identity that never changes)
   and then the same columns; an empty cell leaves that field alone and "-"
   clears it, since an empty cell has to mean "no change" for a half-filled
   sheet to be safe. A line starting with # is a comment and is ignored, which is
   what lets the template carry its own column titles and an example row. */
let manyMode = "add";
const NL = String.fromCharCode(10);

const toLatinDigits = (str) => String(str).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776);

/* What the Format column may say: the internal word, or the label in any of the
   three languages ("PDF", "متنی", "طباعتی"...). Empty means the form's default. */
function parseManyFormat(v) {
  const x = String(v || "").trim().toLowerCase();
  if (!x) return "";
  if (x.includes("pdf")) return "pdf";
  if (x.includes("unicode") || x.includes("text") || x.includes("txt") || x.includes("متنی") || x.includes("نصي")) return "unicode";
  if (x.includes("physical") || x.includes("print") || x.includes("طباع") || x.includes("مطبوع")) return "physical";
  return null;
}

/* The template is always Urdu, whatever language the app is showing: it is meant
   to be sent to whoever types the books in, and they enter Urdu. */
const MANY_UR = {
  reg: "رجسٹر نمبر",
  head: "کتاب کا نام | مصنف | موضوع | جلدیں | ناشر | مکتبہ | شعبہ | الماری نمبر | نوٹس | شکل",
  example: "ریاض الصالحین | امام نووی | الحديث | 2 | دار السلام | نعمانیہ جدید | لائبریری | الف-۱ | نیا نسخہ | طباعتی",
  word: "مثال"
};

function manyTemplate() {
  const head = (manyMode === "update" ? MANY_UR.reg + " | " : "") + MANY_UR.head;
  const ex = (manyMode === "update" ? "28 | " : "") + MANY_UR.example;
  return "# " + head + NL + "# " + MANY_UR.word + ": " + ex + NL;
}

function paintManyMode() {
  document.querySelectorAll("#mModes [data-mmode]").forEach((b) => b.classList.toggle("on", b.dataset.mmode === manyMode));
  $("mHint").textContent = t(manyMode === "update" ? "manyHintUpdate" : "manyHintAdd");
  $("mFill").classList.toggle("hidden", manyMode !== "update");
  $("mSave").textContent = manyMode === "update" ? t("manyUpdateBtn") : t("btnAdd");
  refreshManyCount();
}

function refreshManyCount() {
  const n = $("mText").value.split(NL).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  $("mCount").textContent = `${ud(n)} ${t("tabAll")}`;
}

function openAddMany() {
  if (!requireMaster()) return;
  manyMode = "add";
  $("mText").value = "";
  paintManyMode();
  $("dlgMany").showModal();
}

document.querySelectorAll("#mModes [data-mmode]").forEach((btn) => {
  btn.onclick = () => { manyMode = btn.dataset.mmode; paintManyMode(); };
});

/* Fills the box with the column titles (as a # comment, so they are never
   saved as a book) and one example row, in the interface language. */
$("mTemplate").onclick = () => {
  const cur = $("mText").value;
  $("mText").value = manyTemplate() + (cur && !cur.startsWith("#") ? cur : "");
  refreshManyCount();
  $("mText").focus();
};

/* Copies that same template to the clipboard, so it can be pasted into a
   WhatsApp message or a document and sent to whoever is typing the books in. */
$("mCopy").onclick = async () => {
  const text = manyTemplate();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const tmp = document.createElement("textarea");
    tmp.value = text; document.body.appendChild(tmp); tmp.select();
    document.execCommand("copy"); tmp.remove();
  }
  toast(t("manyCopied"));
};

$("mFill").onclick = () => {
  $("mText").value = manyTemplate() + DATA.books
    .slice()
    .sort((a, b) => (parseInt(a.accession, 10) || 0) - (parseInt(b.accession, 10) || 0))
    .map((b) => [b.accession, b.title, b.author, b.category, b.volumes || "", b.publisher, b.maktaba, b.department, b.almari, b.notes, b.format]
      .map((v) => String(v == null ? "" : v).split("|").join("/").split(NL).join(" ")).join(" | "))
    .join(NL);
  refreshManyCount();
};

$("mText").addEventListener("input", refreshManyCount);

$("mSave").onclick = () => {
  /* Keep the line number the user sees in the box, so a skipped-line message
     points at the right row even with blank lines and # comments around it. */
  const lines = $("mText").value.split(NL)
    .map((l, i) => ({ text: l.trim(), n: i + 1 }))
    .filter((l) => l.text && !l.text.startsWith("#"));
  const skipped = [];
  const cell = (v) => (v === undefined ? "" : v.trim());

  if (manyMode === "update") {
    const jobs = [];
    for (const { text, n } of lines) {
      const c = text.split("|").map((x) => x.trim());
      const reg = toLatinDigits(cell(c[0]));
      const b = DATA.books.find((x) => String(x.accession) === reg);
      if (!b) { skipped.push(`${n}: ${t("manyNoReg")}`); continue; }
      const branch = cell(c[6]);
      if (branch && branch !== "-" && !canonBranch(branch)) { skipped.push(`${n}: ${t("manyBadBranch")} (${branch})`); continue; }
      if (branch && branch !== "-") c[6] = canonBranch(branch);
      if (cell(c[7]) && cell(c[7]) !== "-") c[7] = canonDept(cell(c[7]));
      if (cell(c[3]) && cell(c[3]) !== "-") c[3] = canonCat(cell(c[3]));
      const fmt = parseManyFormat(c[10]);
      if (fmt === null) { skipped.push(`${n}: ${t("manyBadFormat")} (${cell(c[10])})`); continue; }
      const newTitle = cell(c[1]);
      if (newTitle && newTitle !== "-" && findDuplicateTitle(newTitle, b.id, b.author)) { skipped.push(`${n}: ${t("manyDupName")} (${newTitle})`); continue; }
      jobs.push({ b, c, fmt });
    }
    if (!jobs.length) { if (skipped.length) alert(t("manySkipped") + NL + skipped.join(NL)); return; }
    if (!confirm(t("manyConfirmUpdate").replace("{n}", ud(jobs.length)))) return;

    /* A value of "-" blanks the field; an empty cell is skipped, so a sheet
       filled in for only some columns can't wipe the rest. */
    for (const { b, c, fmt } of jobs) {
      const title = cell(c[1]);
      if (title && title !== "-") b.title = title;
      const set = (col, field) => { const v = cell(c[col]); if (v) b[field] = v === "-" ? "" : v; };
      set(2, "author"); set(3, "category"); set(5, "publisher"); set(6, "maktaba"); set(7, "department"); set(8, "almari"); set(9, "notes");
      const vol = cell(c[4]);
      if (vol) b.volumes = vol === "-" ? 0 : parseInt(toLatinDigits(vol), 10) || 0;
      if (fmt) b.format = fmt;
      logHistory(b, "updated");
    }
    $("dlgMany").close();
    persist();
    renderAll();
    toast(`${ud(jobs.length)}${t("manyUpdated")}`);
    if (skipped.length) alert(t("manySkipped") + NL + skipped.join(NL));
    return;
  }

  let added = 0, merged = 0;
  let nextAcc = DATA.books.reduce((m, x) => Math.max(m, parseInt(x.accession, 10) || 0), 0);
  for (const { text, n } of lines) {
    const c = text.split("|").map((x) => x.trim());
    let [title, author = "", category = "", volumes = "", publisher = "", maktaba = "", department = "", almari = "", notes = "", formatRaw = ""] = c;
    if (!title) { skipped.push(`${n}: ${t("manyNoTitle")}`); continue; }
    if (maktaba && !canonBranch(maktaba)) { skipped.push(`${n}: ${t("manyBadBranch")} (${maktaba})`); continue; }
    if (maktaba) maktaba = canonBranch(maktaba);
    department = canonDept(department);
    category = canonCat(category);
    const fmt = parseManyFormat(formatRaw);
    if (fmt === null) { skipped.push(`${n}: ${t("manyBadFormat")} (${formatRaw})`); continue; }
    /* The same book pasted again is the same book: the app already treats an
       identical normalized title + author as a duplicate, so adding it twice
       would just create the cataloguing error the duplicates screen exists to
       find. An existing match gets this line's non-empty cells instead (a blank
       author on either side still counts as the same book). */
    const same = findDuplicateTitle(title, undefined, author);
    if (same) {
      const fill = (v, field) => { if (v) same[field] = v; };
      fill(author, "author"); fill(category, "category"); fill(publisher, "publisher");
      fill(maktaba, "maktaba"); fill(department, "department"); fill(almari, "almari"); fill(notes, "notes");
      const vol = parseInt(toLatinDigits(volumes), 10);
      if (vol) same.volumes = vol;
      if (fmt) same.format = fmt;
      logHistory(same, "updated");
      merged++;
      continue;
    }
    /* Same rule as the single form: a PDF or text file has no shelf, so branch,
       department and almari are only kept for a physical book. */
    const physical = !fmt || fmt === "physical";
    const bk = {
      id: nextId++,
      title,
      author,
      publisher,
      category: category || (mode === "category" && singleGroup() ? singleGroup() : ""),
      volumes: parseInt(toLatinDigits(volumes), 10) || 0,
      format: fmt || "physical",
      maktaba: physical ? (maktaba || (mode === "shelf" && singleGroup() ? singleGroup() : "")) : "",
      department: physical ? department : "",
      almari: physical ? almari : "",
      hasPrint: physical,
      status: "available",
      notes
    };
    normalizeBook(bk);
    bk.accession = String(++nextAcc);
    logHistory(bk, "added");
    DATA.books.push(bk);
    added++;
  }
  $("dlgMany").close();
  persist();
  renderAll();
  toast(`${ud(added)}${t("added")}` + (merged ? ` · ${ud(merged)}${t("manyUpdated")}` : ""));
  if (skipped.length) alert(t("manySkipped") + NL + skipped.join(NL));
};

function deleteSelected() {
  if (!requireMaster()) return;

  /* Ticking rows and pressing Delete used to remove only whichever book was
     last opened (selectedId, set by clicking INTO a row) and ignore the tick
     boxes entirely -- so ticking exactly one box and pressing Delete deleted
     nothing and just said "select a book from the list", which reads as
     broken since ticking a box is the obvious way to "select" one. Screen
     recording confirmed this exact sequence live. The tick boxes are this
     list's only real multi-selection, so any number of them ticked (one or
     many) is now what Delete acts on; selectedId is only the fallback for
     when nothing is ticked at all (deleting from the open detail panel). */
  const checked = DATA.books.filter((x) => ftsScopedIds.has(x.id));

  if (checked.length === 1) {
    const b = checked[0];
    if (!confirm(`"${b.title}" — ${t("confirmDelete")}`)) return;
    DATA.books = DATA.books.filter((x) => x.id !== b.id);
    ftsScopedIds.delete(b.id);
    if (selectedId === b.id) {
      selectedId = null;
      $("bookView").classList.add("hidden");
    }
    persist();
    renderAll();
    toast(t("bookDeleted"));
    return;
  }

  if (checked.length > 1) {
    if (!confirm(t("confirmDeleteMany").replace("{n}", ud(checked.length)))) return;
    const doomed = new Set(checked.map((x) => x.id));
    DATA.books = DATA.books.filter((x) => !doomed.has(x.id));
    doomed.forEach((id) => ftsScopedIds.delete(id));
    if (doomed.has(selectedId)) {
      selectedId = null;
      $("bookView").classList.add("hidden");
    }
    persist();
    renderAll();
    toast(t("booksDeleted").replace("{n}", ud(checked.length)));
    return;
  }

  const b = DATA.books.find((x) => x.id === selectedId);
  /* Nothing ticked and nothing open either -- from the toolbar's own Delete
     button there was never any guarantee something was selected, and
     clicking it then looked exactly like a broken button: no error, no
     toast, genuinely nothing happened. Confirmed live -- reused
     detailEmpty, which already says exactly this for the same empty state
     elsewhere in the app. */
  if (!b) { toast(t("detailEmpty")); return; }
  if (!confirm(`"${b.title}" — ${t("confirmDelete")}`)) return;
  DATA.books = DATA.books.filter((x) => x.id !== selectedId);
  ftsScopedIds.delete(selectedId);
  selectedId = null;
  $("bookView").classList.add("hidden");
  persist();
  renderAll();
  /* Deleting used to succeed in complete silence: the row vanished and
     nothing confirmed it, so when anything else looked off (a stale list, a
     publish that never went out) there was no way to tell whether the delete
     itself had run. Say it plainly. */
  toast(t("bookDeleted"));
}

$("footAdd").onclick = openAddOne;
$("footAddMany").onclick = openAddMany;
$("footDel").onclick = deleteSelected;
// Same action, reachable from the book-detail panel's own titlebar too, not
// just the picker's footer — deleteSelected() already reads selectedId and
// gates on requireMaster() itself, so no new logic needed here.
$("bvDelete").onclick = deleteSelected;

/* ── Export / pull / settings / publish ───────────────────────────────── */

async function doExport() {
  const path = await window.maktaba.export(DATA);
  if (path) toast(t("backedUp"));
}

/* Pulling replaces this machine's whole catalogue with the library's copy.
   A reader gets the same courtesy the librarian gets before publishing:
   see what changes, plus whatever the librarian wrote in the release note,
   then decide. */
/* `auto` is set by the background timer: a machine left open all day should
   not need someone to remember to press "get updates", but it also must
   never interrupt someone mid-task or apply anything without the same
   confirm-and-diff step a manual pull gets. Silent on anything that would
   otherwise be a toast — going offline for a minute, or already being
   current, happens constantly in the background and is not news. */
async function doPull(auto = false) {
  if (auto) {
    if (document.querySelector("dialog[open]")) return;      // never interrupt
    if (IS_MASTER) {
      const state = await window.maktaba.publishState().catch(() => null);
      if (state && state.unpublished) return;                // don't offer to overwrite their own draft
    }
  }

  const peek = await window.maktaba.peekRemote();
  if (!peek.ok) { if (!auto) toast(t("pullFail") + peek.error); return; }

  const incoming = peek.data;
  const d = diffCatalogues(DATA, incoming);

  if (d.empty) { if (!auto) toast(t("alreadyLatest")); return; }
  if (auto && document.querySelector("dialog[open]")) return; // re-check: fetching takes time

  /* For the master this is not "here is newer data" — they are the only
     writer, so it is "throw away my unpublished edits and go back to what I
     last published". Say that, because it is the destructive reading. */
  $("confirmTitle").textContent = IS_MASTER ? t("restoreConfirmTitle") : t("pullConfirmTitle");
  $("confirmLead").textContent = IS_MASTER ? t("restoreConfirmLead") : t("pullConfirmLead");

  let html = "";
  // The librarian's own note about this release, when there is one.
  const wn = await window.maktaba.whatsNew().catch(() => null);
  const latest = wn && wn.data && Array.isArray(wn.data.releases) && wn.data.releases[0];
  if (latest) {
    html += `<div class="diff-note">
        <div class="diff-note-h">${esc(latest.version ? "v" + latest.version : "")} ${esc(latest.date || "")}</div>
        ${Array.isArray(latest.items)
          ? `<ul class="diff-note-list">${latest.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
          : ""}
      </div>`;
  }
  if (incoming.updated) {
    html += `<p class="diff-updated">${t("diffUpdatedOn")} ${String(incoming.updated)}</p>`;
  }
  html += renderDiff(d);

  $("confirmBody").innerHTML = html;
  $("confirmGo").textContent = IS_MASTER ? t("restoreGo") : t("pullGo");
  $("dlgConfirm").showModal();

  runConfirmedSync(
    async () => { await adoptData(incoming); toast(IS_MASTER ? t("restored") : t("pulled")); },
    { onFailToast: t("pullFail"), cancelToast: t("syncCancelled") }
  );
}

async function openSettings() {
  const s = await window.maktaba.getSettings();
  $("sOwner").value = s.owner;
  $("sRepo").value = s.repo;
  $("sBranch").value = s.branch;
  $("sToken").value = "";
  $("sToken").placeholder = s.hasToken ? "•••••••• (تبدیلی کے لیے نیا لکھیں)" : "";
  $("sSbUrl").value = s.supabaseUrl || "";
  $("sSbKey").value = s.supabaseAnonKey || "";
  const auth = await window.maktaba.authStatus();
  const supabaseConfigured = Boolean(s.supabaseUrl && s.supabaseAnonKey);
  /* Once Supabase is set up, the checkbox must reflect the REAL login state,
     not a leftover local flag from earlier PIN-mode testing — otherwise it
     opens pre-checked, and the first click just logs out silently instead
     of opening the login dialog. This was a real bug, found live. */
  $("sLibrarian").checked = supabaseConfigured ? auth.loggedIn : Boolean(s.isLibrarian);
  $("librarianFallbackNote").textContent = supabaseConfigured ? "" : t("librarianFallbackNote");
  $("dlgSettings").showModal();
}

function openAppearance() {
  renderThemeControls();
  $("dlgAppearance").showModal();
}

/* Librarian mode is meant for one desk's machine at a time. With Supabase
   set up (Settings), turning it ON requires a real login, and that login is
   refused outright if another device currently holds the lock — this is the
   actual "one master, login-based, not machine-based" behaviour. Without
   Supabase configured, it falls back to the local password gate, which only
   protects THIS machine and cannot see or stop a second machine — that gap
   is named out loud in the UI, not hidden. */
let heartbeatTimer = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    const res = await window.maktaba.authHeartbeat();
    /* Only a definite answer from Supabase that this device no longer holds
       the lock ends master mode. A request that simply failed to get through
       leaves the timer running so the next beat can try again: this used to
       stop the heartbeat on any failure at all, so a single blip or a short
       sleep retired it for the whole session, the lock then went stale, and
       every publish from then on was refused — silently, since auto-publish
       had no message for that case either. */
    if (res.lost) {
      stopHeartbeat();
      $("sLibrarian").checked = false;
      toast(t("masterLockLost"));
      refreshMasterUI();
    }
  }, 60000);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

$("sLibrarian").addEventListener("change", async (e) => {
  const box = e.target;

  if (!box.checked) {
    stopHeartbeat();
    /* Giving up master rights must take effect NOW, not when the network
       agrees. auth:logout releases the Supabase lock before it clears the
       session, so until that round-trip returns, auth:status still answers
       "logged in" — and refreshing the UI off it left Add and Delete live on
       a machine whose librarian had just switched to reader. Worse, if the
       connection is down that call can hang or fail outright, and the UI
       would stay master indefinitely.
       So drop the role locally first and confirm afterwards: revoking access
       never waits, granting it still goes through the authoritative check. */
    IS_MASTER = false;
    document.documentElement.setAttribute("data-role", "reader");
    applyReadOnly();
    await window.maktaba.authLogout();
    await refreshMasterUI();
    return;
  }

  box.checked = false; // stays off until the gate actually passes
  const configured = await window.maktaba.authConfigured();

  if (configured) {
    /* Just the email, in plain localStorage — never the password. A
       librarian re-entering master mode every session shouldn't have to
       retype an address that never changes; the password still gates it. */
    const rememberedEmail = localStorage.getItem("maktaba_rememberedEmail") || "";
    $("loginEmail").value = rememberedEmail;
    $("loginRememberEmail").checked = Boolean(rememberedEmail);
    $("loginPassword").value = "";
    $("loginHint").textContent = "";
    $("dlgLogin").showModal();
    setTimeout(() => (rememberedEmail ? $("loginPassword") : $("loginEmail")).focus(), 50);

    $("loginSave").onclick = async () => {
      const email = $("loginEmail").value.trim();
      const pw = $("loginPassword").value;
      if (!email || !pw) return;
      $("loginSave").disabled = true;
      const res = await window.maktaba.authLogin(email, pw, navigator.userAgent.slice(0, 40));
      $("loginSave").disabled = false;
      if (res.ok) {
        if ($("loginRememberEmail").checked) localStorage.setItem("maktaba_rememberedEmail", email);
        else localStorage.removeItem("maktaba_rememberedEmail");
        $("dlgLogin").close();
        box.checked = true;
        startHeartbeat();
        toast(t("masterLoggedIn"));
        await refreshMasterUI();
        await syncOnBecomingMaster();
      } else if (res.error === "held") {
        $("loginHint").textContent = t("masterHeldBy").replace("{who}", res.heldBy || "?");
      } else if (res.error === "invalid-credentials") {
        // Supabase gives the same generic error for an unknown email as for
        // a wrong password (deliberately, so a failed login can't be used to
        // discover which emails are registered) — "wrong password" alone
        // would mislead someone who actually mistyped the email.
        $("loginHint").textContent = t("wrongCredentials");
      } else {
        $("loginHint").textContent = res.error || t("wrongPassword");
      }
    };
    return;
  }

  // Fallback: local password only, no cross-machine awareness.
  const s = await window.maktaba.getSettings();
  $("pinInput").value = "";
  if (s.hasLibrarianPin) {
    $("pinTitle").textContent = t("librarianPinTitle");
    $("pinHint").textContent = t("librarianPinVerifyHint");
  } else {
    $("pinTitle").textContent = t("librarianPinSetTitle");
    $("pinHint").textContent = t("librarianPinSetHint");
  }
  $("dlgPin").showModal();
  setTimeout(() => $("pinInput").focus(), 50);
  $("pinInput").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); $("pinSave").click(); } };

  $("pinSave").onclick = async () => {
    const pin = $("pinInput").value;
    if (!pin) { $("pinInput").focus(); return; }

    if (s.hasLibrarianPin) {
      const res = await window.maktaba.checkLibrarianPin(pin);
      if (!res.ok) { toast(t("wrongPassword")); return; }
    } else {
      await window.maktaba.setLibrarianPin(pin);
    }
    $("dlgPin").close();
    box.checked = true;
    await refreshMasterUI();
    await syncOnBecomingMaster();
  };
});

/* ── Change preview ───────────────────────────────────────────────────────
   Both directions (publishing up, pulling down) show the same readable
   summary before anything is written, because both overwrite a whole
   catalogue in one shot and "27 books replaced by 12" is not something
   anyone should discover afterwards. */

/* Borrower name and contact are deliberately left out — GitHub never carries
   them (see redactForPublish in main.js), so comparing them against the
   local copy would show every active personal loan as "changed" on every
   single publish. Status and due date still show, which is what a librarian
   actually needs to confirm before publishing. */
const DIFF_FIELDS = [
  ["title", "fTitle"], ["author", "fAuthor"], ["category", "fCategory"],
  ["publisher", "fPublisher"], ["almari", "fShelf"], ["volumes", "fVolumes"],
  ["status", "railStatus"], ["dueDate", "fDueDate"], ["accession", "fAccession"],
  ["notes", "fNotes"], ["image", "diffCover"], ["format", "fFormat"]
];

function diffCatalogues(from, to) {
  /* The remote/incoming copy is written LEAN — default-valued fields
     stripped to keep the published file small — while the in-memory local
     copy has already been through normalizeBook() and carries every default
     explicitly. Comparing those two shapes directly reported "format:
     physical → —" on every single book that still had the default format,
     a false diff with nothing actually different, on every pull and publish.
     Normalizing a throwaway clone of both sides first makes the comparison
     shape-independent, the same fix catalogueHash() already needed. */
  const fromBooks = ((from && from.books) || []).map((b) => normalizeBook({ ...b }));
  const toBooks = ((to && to.books) || []).map((b) => normalizeBook({ ...b }));
  const byId = (arr) => new Map(arr.map((b) => [b.id, b]));
  const fm = byId(fromBooks), tm = byId(toBooks);

  const added = toBooks.filter((b) => !fm.has(b.id));
  const removed = fromBooks.filter((b) => !tm.has(b.id));
  const changed = [];

  for (const b of toBooks) {
    const old = fm.get(b.id);
    if (!old) continue;
    const fields = [];
    for (const [key, label] of DIFF_FIELDS) {
      const a = old[key] == null ? "" : String(old[key]);
      const c = b[key] == null ? "" : String(b[key]);
      if (a !== c) fields.push({ label, from: a, to: c });
    }
    if (fields.length) changed.push({ book: b, fields });
  }

  const fromCats = (from && from.categories) || [];
  const toCats = (to && to.categories) || [];
  const catsAdded = toCats.filter((c) => !fromCats.includes(c));
  const catsRemoved = fromCats.filter((c) => !toCats.includes(c));

  const themeChanged =
    JSON.stringify((from && from.theme) || {}) !== JSON.stringify((to && to.theme) || {});

  return {
    added, removed, changed, catsAdded, catsRemoved, themeChanged,
    countFrom: fromBooks.length,
    countTo: toBooks.length,
    empty: !added.length && !removed.length && !changed.length &&
           !catsAdded.length && !catsRemoved.length && !themeChanged
  };
}

function renderDiff(d) {
  const shorten = (s) => {
    s = String(s == null ? "" : s);
    return s.length > 60 ? s.slice(0, 60) + "…" : (s || "—");
  };
  const parts = [];

  parts.push(`<div class="diff-count">
      <span class="diff-from">${d.countFrom}</span>
      <span class="diff-arrow">←</span>
      <span class="diff-to">${d.countTo}</span>
      <span class="diff-count-label">${esc(t("diffBookCount"))}</span>
    </div>`);

  if (d.empty) {
    parts.push(`<p class="diff-none">${esc(t("diffNone"))}</p>`);
    return parts.join("");
  }

  const section = (cls, sign, title, rows) => {
    if (!rows.length) return "";
    return `<div class="diff-sec ${cls}">
        <div class="diff-sec-h"><span class="diff-sign">${sign}</span>${esc(title)} (${rows.length})</div>
        <ul class="diff-list">${rows.join("")}</ul>
      </div>`;
  };

  parts.push(section("add", "+", t("diffAdded"),
    d.added.map((b) => `<li><b>${esc(b.title)}</b> <span class="diff-sub">${esc(b.author || "")}</span></li>`)));

  parts.push(section("del", "−", t("diffRemoved"),
    d.removed.map((b) => `<li><b>${esc(b.title)}</b> <span class="diff-sub">${esc(b.author || "")}</span></li>`)));

  parts.push(section("mod", "•", t("diffChanged"),
    d.changed.map((c) => `<li><b>${esc(c.book.title)}</b>
        <ul class="diff-fields">${c.fields.map((f) =>
          `<li><span class="diff-k">${esc(t(f.label))}</span>
             <span class="diff-old">${esc(shorten(f.from))}</span>
             <span class="diff-arrow">←</span>
             <span class="diff-new">${esc(shorten(f.to))}</span></li>`).join("")}</ul>
      </li>`)));

  if (d.catsAdded.length || d.catsRemoved.length) {
    parts.push(`<div class="diff-sec cat">
        <div class="diff-sec-h"><span class="diff-sign">•</span>${esc(t("diffCategories"))}</div>
        <ul class="diff-list">
          ${d.catsAdded.map((c) => `<li><span class="diff-sign add">+</span> ${esc(c)}</li>`).join("")}
          ${d.catsRemoved.map((c) => `<li><span class="diff-sign del">−</span> ${esc(c)}</li>`).join("")}
        </ul>
      </div>`);
  }

  if (d.themeChanged) {
    parts.push(`<div class="diff-sec cat">
        <div class="diff-sec-h"><span class="diff-sign">•</span>${esc(t("diffTheme"))}</div>
      </div>`);
  }

  return parts.join("");
}

/* Publishing overwrites the copy every other machine reads, so it asks first
   and shows exactly what is about to change on GitHub. */
async function doPublish() {
  const btn = $("ibPublish");
  const label = btn.querySelector("span");
  const original = label.textContent;
  btn.disabled = true;
  label.textContent = t("checking");

  await flushSave();          // never publish a stale copy
  const peek = await window.maktaba.peekRemote();
  btn.disabled = false;
  label.textContent = original;

  // No remote yet (first ever publish) diffs against an empty catalogue.
  const remote = peek.ok ? peek.data : { books: [], categories: [] };
  const d = diffCatalogues(remote, DATA);

  $("confirmTitle").textContent = t("publishConfirmTitle");
  $("confirmLead").textContent = peek.ok ? t("publishConfirmLead") : t("publishFirstLead");
  $("confirmBody").innerHTML = renderDiff(d);
  $("confirmGo").textContent = t("publishGo");
  $("dlgConfirm").showModal();

  runConfirmedSync(async () => {
    btn.disabled = true;
    label.textContent = t("publishing");
    const res = await window.maktaba.publish(DATA);
    btn.disabled = false;
    label.textContent = original;
    if (res.ok) {
      /* Adopt the rewritten records (covers and files are hosted URLs now),
         or the next autosave would put the local paths back on disk. */
      if (res.data) {
        DATA = res.data;
        DATA.books.forEach(normalizeBook);
        resetUndo(true);
        renderAll();
      }
      toast(t("published"));
      refreshPublishBadge();
      clearAutoPublishPause();
    } else if (res.diverged) {
      /* GitHub holds something this machine never saw. Publishing would wipe
         it, so the one safe way out is to fetch that copy first and look at
         it. This used to be an OK-only alert naming a menu path, which left
         the librarian stuck in a loop: publish, read the message, press OK,
         nothing changes, publish again. Offer to run the restore right here
         — it still shows the full diff and still asks before replacing
         anything, so nothing is lost by saying yes. */
      const ask = t("divergedOfferRestore")
        .replace("{remote}", ud(res.remoteBooks == null ? "?" : res.remoteBooks))
        .replace("{local}", ud(res.localBooks == null ? "?" : res.localBooks));
      if (confirm(ask)) doPull();
    } else if (res.error === "publish-frozen") {
      alert(t("publishFrozenMsg"));
    } else if (res.error === "dev-run-no-publish") {
      alert(t("publishDevRunMsg"));
    } else if (res.errorCode === "no-token") {
      // Was res.error — main.js's message for this is hardcoded Urdu, so
      // it used to show in Urdu no matter what language the UI was in.
      alert(t("noTokenMsg"));
    } else alert(t("publishFail") + res.error);
  }, { cancelToast: t("syncCancelled") });
}

/* Not `= doPull` — that would pass the click event through as `auto`, and a
   MouseEvent is truthy, silently turning every manual click into a background
   check no dialog is allowed to appear from. */

$("sSave").onclick = async () => {
  const token = $("sToken").value.trim();
  await window.maktaba.setSettings({
    owner: $("sOwner").value.trim(),
    repo: $("sRepo").value.trim(),
    branch: $("sBranch").value.trim(),
    token,
    isLibrarian: $("sLibrarian").checked,
    supabaseUrl: $("sSbUrl").value.trim(),
    supabaseAnonKey: $("sSbKey").value.trim()
  });
  /* Auto-publish may be sitting paused (no token, or a divergence). Used to
     only clear this when the token field itself was just retyped — but the
     field is deliberately left BLANK even when a real token is already
     saved (the placeholder says so: "•••• type new to change"), so saving
     Settings for any OTHER reason without retyping it never cleared a
     pause that a perfectly good token had already resolved. Clear it
     unconditionally on every settings save instead: worst case, nothing
     was actually fixed and the next edit just re-pauses with the same
     toast, which is harmless; the alternative was auto-publish staying
     silently stuck long after the real problem was gone. */
  clearAutoPublishPause();
  $("dlgSettings").close();
  toast(t("settingsSaved"));
};

document.querySelectorAll("dialog [data-close]").forEach((b) => {
  b.onclick = () => b.closest("dialog").close();
});

/* ── Menu bar ─────────────────────────────────────────────────────────── */

/* An open <dialog> — even a non-modal one via .show(), which this app
   only ever uses — still paints above ordinary content no matter how high
   a z-index the dropdown is given; proved by forcing z-index: 999999 on it
   live and watching the picker's own content still win every hit-test.
   Moving the dropdown to be a direct child of <body> while it is open (a
   DOM "portal", positioned in fixed coordinates computed from the button
   that opened it) sidesteps that entirely — it is no longer nested inside
   anything the dialog could out-rank, it is a sibling of the dialog itself.
   Moved back into the menu on close, so the DOM stays tidy and the CSS
   layout rules apply again next time it opens in its normal position. */
document.querySelectorAll(".menu > span").forEach((label) => {
  const menu = label.parentElement;
  const dropdown = menu.querySelector(".dropdown");
  if (!dropdown) return;
  const homeParent = menu;

  label.onclick = (e) => {
    e.stopPropagation();
    const wasOpen = dropdown.classList.contains("show");
    closeAllMenus();
    if (wasOpen) return;

    menu.classList.add("open");
    const r = label.getBoundingClientRect();
    document.body.appendChild(dropdown);
    dropdown.classList.add("show", "portaled");
    dropdown.style.top = (r.bottom + 6) + "px";
    /* Anchored from whichever edge the trigger is actually closest to —
       #menuMore sits at the layout's near edge (physical left in this RTL
       app), so opening from its right edge pushed most of the panel off
       the visible screen; anchoring from the trigger's own left edge keeps
       it inside the window regardless of where the menu sits. */
    if (r.left < window.innerWidth - r.right) {
      dropdown.style.left = r.left + "px";
      dropdown.style.right = "auto";
    } else {
      dropdown.style.right = (window.innerWidth - r.right) + "px";
      dropdown.style.left = "auto";
    }
  };

  function closeThis() {
    if (!dropdown.classList.contains("show")) return;
    menu.classList.remove("open");
    dropdown.classList.remove("show", "portaled");
    dropdown.style.top = dropdown.style.left = dropdown.style.right = "";
    homeParent.appendChild(dropdown);
  }
  dropdown._closePortal = closeThis;
});
function closeAllMenus() {
  document.querySelectorAll(".menu").forEach((m) => {
    const dd = m.querySelector(".dropdown") || document.querySelector(".dropdown.portaled");
    if (dd && dd._closePortal) dd._closePortal();
  });
  /* A portaled dropdown is no longer inside its .menu, so the query above
     can miss it once moved — catch any leftover portaled node directly. */
  document.querySelectorAll(".dropdown.portaled").forEach((dd) => {
    if (dd._closePortal) dd._closePortal();
  });
}
document.addEventListener("click", closeAllMenus);

const MENU_ACTIONS = {
  addOne: openAddOne,
  addMany: openAddMany,
  delete: deleteSelected,
  undo: () => stepHistory("undo"),
  redo: () => stepHistory("redo"),
  export: doExport,
  publish: doPublish,
  quit: () => window.close(),
  /* The search box lives inside the picker's book-list pane, so calling
     this from the welcome screen (picker closed) or from a non-book tab
     (category/author/shelf, where that pane is hidden) focused an input
     nobody could see — a no-op that looked exactly like "not working".
     Open the picker onto the books list first, then focus once it has
     actually painted. */
  focusSearch: () => {
    showCatalog();
    setMode("books");
    setTimeout(() => $("search").focus(), 30);
  },
  clearSearch: () => { $("search").value = ""; renderBooks(); },
  settings: openSettings,
  appearance: openAppearance,
  pull: doPull,
  downloadAllTexts: doDownloadAllTexts,
  duplicates: showDuplicates,
  issued: showIssued,
  categoriesMan: showCategoryManager,
  whatsNew: showWhatsNew,
  about: () => $("dlgAbout").showModal()
};

/* Covers both the icon row's own direct buttons and the items inside the
   "More" overflow dropdown — one dispatcher for both, since they share the
   same data-act vocabulary. */
document.querySelectorAll("#iconbar [data-act]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
    const fn = MENU_ACTIONS[btn.dataset.act];
    if (fn) fn();
  };
});
document.querySelectorAll(".dropdown [data-mode]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
    setMode(btn.dataset.mode);
  };
});

/* Language is per-machine and deliberately does NOT travel with the
   catalogue. It used to: the librarian's choice was published and every
   reader adopted it on the next sync. In practice that meant one person
   switching to Urdu at the desk silently flipped the language on machines
   across the madrassa, and it made language something you had to think
   about before publishing. setLang() already stores the choice in
   localStorage, so each machine simply keeps its own.
   The old appSettings.lang value is left alone in the catalogue rather than
   stripped: nobody reads it now, and removing a field would change
   catalogueHash() on every machine at once — which is exactly what makes the
   divergence guard fire and block publishing everywhere. */

/* ── Theme ────────────────────────────────────────────────────────────────
   Theme lives inside the catalogue rather than in local settings, so the
   librarian's choice travels to every reader install with the next sync —
   the alternative is each machine looking different for no reason. */

const ACCENTS = [
  { id: "blue",   base: "#125fb0", light: "#1873cf", deep: "#0d4a8a" },
  { id: "green",  base: "#14724a", light: "#1c8c5c", deep: "#0d5334" },
  { id: "maroon", base: "#94302a", light: "#b23c34", deep: "#6d211d" },
  { id: "teal",   base: "#0f6b72", light: "#12858e", deep: "#0a4d52" },
  { id: "indigo", base: "#3b3f9e", light: "#4a4fbd", deep: "#2a2d74" },
  { id: "brass",  base: "#8a6a1f", light: "#a98226", deep: "#664d14" }
];

/* The actual display faces, pickable by name. "auto" keeps the original
   behaviour (Jameel Noori for Urdu, My Lotus for Arabic); the rest let the
   librarian override that per taste, which is what makes the choice visible
   in Appearance instead of being an invisible consequence of the language. */
const UI_FONTS = [
  { id: "auto",     stack: null },
  { id: "jameel",   stack: '"Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", serif' },
  { id: "mylotus",  stack: '"My Lotus", "Noto Naskh Arabic", serif' },
  { id: "notoNast", stack: '"Noto Nastaliq Urdu", serif' },
  { id: "naskhUi",  stack: '"Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif' }
];

/* Which parts of the window can be styled independently, mirroring Shamela's
   own per-element font list ("خط بطاقة الكتاب" and friends). Each slot writes
   a CSS variable that the stylesheet already reads. */
const FONT_SLOTS = [
  { id: "ui",    varName: "--ui-font",   sizeVar: "--ui-size",   label: "slotUi",    def: { family: "auto", weight: "400", size: 16 } },
  { id: "list",  varName: "--list-font", sizeVar: "--list-size", label: "slotList",  def: { family: "auto", weight: "400", size: 15.5 } },
  { id: "card",  varName: "--card-font", sizeVar: "--card-size", label: "slotCard",  def: { family: "auto", weight: "400", size: 15 } },
  { id: "head",  varName: "--head-font", sizeVar: "--head-size", label: "slotHead",  def: { family: "auto", weight: "500", size: 22 } },
  { id: "detail",varName: "--det-font",  sizeVar: "--det-size",  label: "slotDetail",def: { family: "auto", weight: "400", size: 19 } }
];

const COLOR_SLOTS = [
  { id: "headings", varName: "--c-headings", label: "slotHeadings", def: "" },
  { id: "text",     varName: "--c-text",     label: "slotText",     def: "" },
  { id: "muted",    varName: "--c-muted",    label: "slotMuted",    def: "" },
  { id: "searchHit",varName: "--c-hit",      label: "slotSearchHit",def: "#c8531f" },
  { id: "cardBg",   varName: "--c-cardbg",   label: "slotCardBg",   def: "" },
  { id: "rowSel",   varName: "--c-rowsel",   label: "slotRowSel",   def: "" }
];

const PALETTE = [
  "#000000","#8a1b1b","#14532d","#8a5a1f","#166534","#8a8a1f","#1f8a4c","#a3c93a",
  "#1e2f6b","#8a1b6b","#155e75","#8a5a6b","#0f766e","#8a8a6b","#3fae7f","#b8e0c0",
  "#0b3fa8","#6b21a8","#1d6fd0","#7c5cd0","#1f9ed0","#9db8e8","#3fc8d0","#bfe8f0",
  "#5a0f0f","#d61f1f","#4a5a0f","#e0691f","#3f8a1f","#e0a01f","#5fd01f","#f0e81f",
  "#3f1f6b","#d61f9e","#4a4a8a","#e06b9e","#3f8a8a","#e0a89e","#7fe0c0","#f0f0c0",
  "#17222e","#5c6a7a","#8794a4","#c3ccd8","#d8dfe8","#eef2f7","#f5f7fa","#ffffff"
];

/* Appearance is a preference of the person sitting at the machine, not a
   property of the library. A reader on a small screen needs bigger text; the
   librarian's choice of accent colour has no business overruling that, and a
   sync should never quietly undo someone's font size. So the theme lives on
   this computer, and every user can change it — including read-only ones.
   The first time an install runs it seeds itself from whatever the catalogue
   was carrying, so nothing looks different the day this changed. */
const THEME_KEY = "maktaba-theme";
let LOCAL_THEME = null;

function loadLocalTheme() {
  let th = null;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) th = JSON.parse(raw);
  } catch { /* private mode, corrupt value — fall through to the seed */ }
  if (!th) th = (DATA && DATA.theme) ? JSON.parse(JSON.stringify(DATA.theme)) : {};
  return clearFontOverrides(th);
}

/* The language is what decides the face: Urdu reads in Jameel Noori
   Nastaleeq, Arabic in My Lotus. Any per-element font choice saved earlier
   silently outranked that rule — a stored "My Lotus" on the general-text slot
   kept Arabic type on screen even while the app was in Urdu, and a stored
   "naskh" book-title choice kept titles out of Nastaliq entirely.
   Cleared once, so the language rule governs everything again. Anyone who
   genuinely wants a different face can still pick one in Options; this only
   discards the settings that were fighting the language. */
const FONT_RESET_KEY = "maktaba-font-reset";

function clearFontOverrides(th) {
  try {
    if (localStorage.getItem(FONT_RESET_KEY)) return th;
  } catch { return th; }

  th.font = "nastaliq";            // book titles follow the language, not naskh
  th.uiFont = "auto";              // "auto" means: let the language decide
  if (th.fonts) {
    for (const slot of Object.keys(th.fonts)) {
      if (th.fonts[slot]) th.fonts[slot].family = "auto";
    }
  }
  try {
    localStorage.setItem(FONT_RESET_KEY, "1");
    localStorage.setItem(THEME_KEY, JSON.stringify(th));
  } catch { /* not fatal */ }
  return th;
}

function saveLocalTheme() {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(LOCAL_THEME)); } catch { /* not fatal */ }
}

function theme() {
  if (!LOCAL_THEME) LOCAL_THEME = loadLocalTheme();
  const th = LOCAL_THEME;
  if (!th.accent)  th.accent  = "blue";
  if (!th.mode)    th.mode    = "light";
  if (!th.size)    th.size    = "normal";   // small | normal | large
  if (!th.font)    th.font    = "nastaliq"; // nastaliq | naskh (book titles)
  if (!th.uiFont)  th.uiFont  = "auto";     // display face, see UI_FONTS
  if (!th.density) th.density = "comfortable";
  if (typeof th.toolbarLabels !== "boolean") th.toolbarLabels = true;
  if (typeof th.showAcc !== "boolean") th.showAcc = true;
  if (typeof th.showPub !== "boolean") th.showPub = true;
  if (typeof th.hoverCard !== "boolean") th.hoverCard = true;
  if (!th.lineSpacing) th.lineSpacing = "1.0";
  if (!th.fonts) th.fonts = {};
  for (const s of FONT_SLOTS) if (!th.fonts[s.id]) th.fonts[s.id] = { ...s.def };
  if (!th.colors) th.colors = {};
  for (const c of COLOR_SLOTS) if (th.colors[c.id] === undefined) th.colors[c.id] = c.def;
  return th;
}

function applyTheme() {
  const th = theme();
  const a = ACCENTS.find((x) => x.id === th.accent) || ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--blue", a.base);
  root.style.setProperty("--blue-2", a.light);
  root.style.setProperty("--blue-deep", a.deep);
  root.style.setProperty("--blue-ring", a.light + "38");
  root.setAttribute("data-mode", th.mode === "dark" ? "dark" : "light");
  root.setAttribute("data-size", th.size);
  root.setAttribute("data-font", th.font);
  /* An inline --nastaliq beats the stylesheet's language rules; clearing it
     hands control back to them, which is exactly what "auto" means. */
  const face = UI_FONTS.find((f) => f.id === th.uiFont);
  if (face && face.stack) root.style.setProperty("--nastaliq", face.stack);
  else root.style.removeProperty("--nastaliq");
  root.setAttribute("data-density", th.density);

  /* Per-element fonts. "auto" means "leave it to the language rules", so it
     clears the variable rather than writing a value. */
  for (const s of FONT_SLOTS) {
    const f = th.fonts[s.id] || s.def;
    const stack = fontStack(f.family);
    if (stack) root.style.setProperty(s.varName, stack);
    else root.style.removeProperty(s.varName);
    if (f.size) root.style.setProperty(s.sizeVar, f.size + "px");
    else root.style.removeProperty(s.sizeVar);
    root.style.setProperty(s.varName + "-w", f.weight || "400");
  }
  root.style.setProperty("--line-spacing", th.lineSpacing || "1.0");

  for (const c of COLOR_SLOTS) {
    const v = th.colors[c.id];
    if (v) root.style.setProperty(c.varName, v);
    else root.style.removeProperty(c.varName);
  }

  root.setAttribute("data-toolbar-labels", th.toolbarLabels ? "on" : "off");
  root.setAttribute("data-show-acc", th.showAcc ? "on" : "off");
  root.setAttribute("data-show-pub", th.showPub ? "on" : "off");
}

/* Resolves a saved family name to a real stack. Bundled faces get their
   documented fallbacks; anything else is a font installed on this PC and is
   used as-is with a generic fallback behind it. */
function fontStack(family) {
  if (!family || family === "auto") return null;
  const known = UI_FONTS.find((f) => f.id === family);
  if (known) return known.stack;
  return `"${family}", serif`;
}

/* The families offered in the Fonts panel: the two shipped with the app, the
   web fallbacks, then the common Windows faces a madrassa PC actually has. */
const FONT_FAMILIES = [
  "auto",
  "Jameel Noori Nastaleeq",
  "My Lotus",
  "Noto Nastaliq Urdu",
  "Noto Naskh Arabic",
  "Amiri",
  "Traditional Arabic",
  "Urdu Typesetting",
  "Tahoma",
  "Segoe UI",
  "Times New Roman"
];

function renderThemeControls() {
  const wrap = $("swatches");
  if (!wrap) return;
  const th = theme();
  wrap.innerHTML = ACCENTS.map((a) =>
    `<button type="button" class="sw${a.id === th.accent ? " on" : ""}" data-accent="${a.id}"
             style="background:${a.base}" title="${a.id}"></button>`
  ).join("");
  wrap.querySelectorAll("[data-accent]").forEach((btn) => {
    btn.onclick = () => {
      theme().accent = btn.dataset.accent;
      applyTheme();
      renderThemeControls();
      saveLocalTheme();
    };
  });
  const bindGroup = (attr, key) => {
    document.querySelectorAll("[" + attr + "]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute(attr) === th[key]);
      btn.onclick = () => {
        theme()[key] = btn.getAttribute(attr);
        applyTheme();
        renderThemeControls();
        saveLocalTheme();
      };
    });
  };
  bindGroup("data-size-theme", "size");
  bindGroup("data-font-theme", "font");
  bindGroup("data-density-theme", "density");

  // Mode is a radio group here, matching the original's Appearance panel.
  document.querySelectorAll("[data-mode-theme]").forEach((r) => {
    r.checked = r.getAttribute("data-mode-theme") === th.mode;
    r.onchange = () => { theme().mode = r.getAttribute("data-mode-theme"); applyTheme(); saveLocalTheme(); };
  });

  const check = (id, key) => {
    const el = $(id);
    if (!el) return;
    el.checked = Boolean(th[key]);
    el.onchange = () => { theme()[key] = el.checked; applyTheme(); saveLocalTheme(); renderBooks(); };
  };
  check("optToolbarLabels", "toolbarLabels");
  check("optShowAcc", "showAcc");
  check("optShowPub", "showPub");
  check("optHoverCard", "hoverCard");

  renderColorPanel();
  renderFontPanel();
}

/* ── Options dialog ───────────────────────────────────────────────────────
   Edits a working copy of the theme. Apply commits it and keeps the window
   open, OK commits and closes, Cancel puts the original back — which is the
   contract those three buttons imply and the reason Cancel has to snapshot
   the theme on open. */

let themeBackup = null;
let activeColorSlot = COLOR_SLOTS[0].id;
let activeFontSlot = FONT_SLOTS[0].id;

function openAppearance() {
  themeBackup = JSON.parse(JSON.stringify(theme()));
  renderThemeControls();
  showOptPane(document.querySelector("#optRail button.on")?.dataset.opt || "look");
  loadFolderPaths();
  $("dlgAppearance").showModal();
}

function showOptPane(id) {
  document.querySelectorAll("#optRail button").forEach((b) => b.classList.toggle("on", b.dataset.opt === id));
  document.querySelectorAll(".opt-pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === id));
}

function renderColorPanel() {
  const th = theme();
  const wrap = $("colorSlots");
  if (!wrap) return;
  wrap.innerHTML = COLOR_SLOTS.map((c) => `
    <div class="opt-slot${c.id === activeColorSlot ? " on" : ""}" data-cslot="${c.id}">
      <span>${t(c.label)}</span>
      <span class="sw-box" style="background:${th.colors[c.id] || "transparent"}"></span>
    </div>`).join("");

  wrap.querySelectorAll("[data-cslot]").forEach((el) => {
    el.onclick = () => { activeColorSlot = el.dataset.cslot; renderColorPanel(); };
  });

  const pal = $("colorPalette");
  pal.innerHTML = PALETTE.map((hex) => `<button type="button" style="background:${hex}" data-hex="${hex}" title="${hex}"></button>`).join("");
  pal.querySelectorAll("[data-hex]").forEach((b) => {
    b.onclick = () => { theme().colors[activeColorSlot] = b.dataset.hex; applyTheme(); saveLocalTheme(); renderColorPanel(); };
  });

  const pick = $("colorPick");
  pick.value = th.colors[activeColorSlot] || "#125fb0";
  pick.oninput = () => { theme().colors[activeColorSlot] = pick.value; applyTheme(); saveLocalTheme(); renderColorPanel(); };
}

function renderFontPanel() {
  const th = theme();
  const wrap = $("fontSlots");
  if (!wrap) return;
  wrap.innerHTML = FONT_SLOTS.map((s) => {
    const f = th.fonts[s.id];
    const name = f.family === "auto" ? t("uiFontAuto") : f.family;
    return `<div class="opt-slot${s.id === activeFontSlot ? " on" : ""}" data-fslot="${s.id}">
        <span>${t(s.label)}</span>
        <span class="slot-val">${name} · ${f.size}</span>
      </div>`;
  }).join("");
  wrap.querySelectorAll("[data-fslot]").forEach((el) => {
    el.onclick = () => { activeFontSlot = el.dataset.fslot; renderFontPanel(); };
  });

  const cur = th.fonts[activeFontSlot];

  const fam = $("fontFamily");
  fam.innerHTML = FONT_FAMILIES.map((f) =>
    `<option value="${f}"${f === cur.family ? " selected" : ""} style="font-family:${fontStack(f) || "inherit"}">${f === "auto" ? t("uiFontAuto") : f}</option>`
  ).join("");
  fam.onchange = () => { theme().fonts[activeFontSlot].family = fam.value; applyTheme(); saveLocalTheme(); renderFontPanel(); };

  const wt = $("fontWeight");
  wt.value = cur.weight || "400";
  wt.onchange = () => { theme().fonts[activeFontSlot].weight = wt.value; applyTheme(); saveLocalTheme(); renderFontPanel(); };

  const sz = $("fontSize");
  const SIZES = [11,12,13,14,15,16,17,18,19,20,22,24,26,28];
  sz.innerHTML = SIZES.map((n) => `<option value="${n}"${Number(cur.size) === n ? " selected" : ""}>${n}</option>`).join("");
  sz.onchange = () => { theme().fonts[activeFontSlot].size = Number(sz.value); applyTheme(); saveLocalTheme(); renderFontPanel(); };

  const ln = $("fontLine");
  ln.value = th.lineSpacing || "1.0";
  ln.onchange = () => { theme().lineSpacing = ln.value; applyTheme(); saveLocalTheme(); };

  const sample = $("fontSample");
  sample.style.fontFamily = fontStack(cur.family) || "var(--ui)";
  sample.style.fontSize = cur.size + "px";
  sample.style.fontWeight = cur.weight || "400";
  sample.style.lineHeight = 1.2 + Number(th.lineSpacing || 1) * 0.55;
}

async function loadFolderPaths() {
  const c = $("optCoversPath"), f = $("optFilesPath"), d = $("optDataPath");
  if (c) c.value = COVERS_DIR || (await window.maktaba.coversDir());
  if (f) f.value = await window.maktaba.filesDir();
  if (d) d.value = await window.maktaba.dataPath();
}

document.querySelectorAll("#optRail button").forEach((b) => {
  b.onclick = () => showOptPane(b.dataset.opt);
});

$("optApply").onclick = () => { applyTheme(); renderAll(); saveLocalTheme(); toast(t("settingsSaved")); };
$("optOk").onclick = () => { applyTheme(); renderAll(); saveLocalTheme(); $("dlgAppearance").close(); };
$("optCancel").onclick = () => {
  if (themeBackup) LOCAL_THEME = JSON.parse(JSON.stringify(themeBackup));
  applyTheme();
  renderAll();
  $("dlgAppearance").close();
};

document.querySelectorAll("[data-reset]").forEach((btn) => {
  btn.onclick = () => {
    const th = theme();
    const which = btn.dataset.reset;
    if (which === "colors") { for (const c of COLOR_SLOTS) th.colors[c.id] = c.def; }
    else if (which === "fonts") { for (const s of FONT_SLOTS) th.fonts[s.id] = { ...s.def }; th.lineSpacing = "1.0"; }
    else if (which === "look") { th.mode = "light"; th.accent = "blue"; th.size = "normal"; th.density = "comfortable"; th.toolbarLabels = true; }
    else if (which === "list") { th.font = "nastaliq"; th.showAcc = true; th.showPub = true; th.hoverCard = true; }
    applyTheme();
    saveLocalTheme();
    renderThemeControls();
    renderAll();
  };
});

$("optOpenCovers").onclick = () => window.maktaba.openFile($("optCoversPath").value);
$("optOpenFiles").onclick = () => window.maktaba.openFile($("optFilesPath").value);

/* ── Unicode reader ───────────────────────────────────────────────────────
   Shamela offers two different searches and the client asked for both: one
   finds a BOOK in the catalogue, this one finds a WORD inside the open book.
   Only Unicode text can work this way — a scanned PDF is pictures of words,
   which needs OCR and is a separate piece of work.
   Both searches share `norm()`, so the same typing finds the same thing in
   either place: Arabic yeh matches Urdu yeh, diacritics are ignored. */

let readerText = "";
let readerHits = [];
let readerAt = 0;
let readerPages = [];      // [{ start, end }] char offsets into readerText
let readerPage = 0;
let readerToc = [];        // [{ title, start, page }]
let readerIndex = null;    // prepared search index, built once per open book

/* Pages.
   The uploaded texts carry no page markers, so pages are display pages cut on
   line boundaries within a character budget — never mid-line, so a verse is
   never split down the middle. This is also what keeps the reader fast: the
   Qur'an file is 754,000 characters, and the previous version rendered ALL of
   it into one node on every keystroke of a search. */
const PAGE_CHARS = 1800;

function paginate(text) {
  const pages = [];
  let start = 0, at = 0;
  while (at < text.length) {
    let end = Math.min(text.length, at + PAGE_CHARS);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > at) end = nl + 1;                  // cut on a line break
    }
    pages.push({ start: at, end });
    at = end;
    start = at;
  }
  return pages.length ? pages : [{ start: 0, end: text.length }];
}

/* Chapter headings, for the tree the reference app shows beside the text.
   "1. الفاتحة" style numbered headings are what the uploaded Qur'an uses;
   when a text has none the tree simply stays hidden rather than inventing
   structure that is not in the file. */
/* Same numbered-line pattern buildToc() uses for the reader's own table of
   contents, reused here as the honest definition of "a heading" for
   full-text search scoping. Returns whole-line spans (not just the match)
   so a hit anywhere on that line counts. There is no equivalent for
   footnotes or editor's comments — the attached texts are plain files with
   no markup telling those apart from ordinary body text, so scoping to
   either of those would just be guessing, not a real filter. */
function headingLineSpans(text) {
  const spans = [];
  const re = /^[ \t]*(\d+)[.．)][ \t]+(\S.*)$/gm;
  let m;
  while ((m = re.exec(text)) !== null && spans.length < 4000) {
    if (m[2].trim().length > 80) continue;
    spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}
function offsetInSpans(offset, spans) {
  for (const [start, end] of spans) if (offset >= start && offset < end) return true;
  return false;
}

function buildToc(text, pages) {
  const toc = [];
  const re = /^[ \t]*(\d+)[.．)][ \t]+(\S.*)$/gm;
  let m;
  while ((m = re.exec(text)) !== null && toc.length < 2000) {
    const title = m[2].trim();
    if (title.length > 80) continue;              // a long line is prose, not a heading
    toc.push({ title: `${m[1]}. ${title}`, start: m.index });
  }
  for (const e of toc) e.page = pageOfOffset(e.start, pages);
  return toc;
}

function pageOfOffset(offset, pages = readerPages) {
  for (let i = 0; i < pages.length; i++) if (offset < pages[i].end) return i;
  return Math.max(0, pages.length - 1);
}

/* Urdu and Arabic share the same Arabic script, so "which font" cannot be
   decided by which alphabet is used — it has to be decided by which LETTERS
   are used. These codepoints are the standard Urdu-specific forms that
   essentially never appear in Arabic-language text: ی ہ ک (Farsi/Urdu yeh,
   goal heh, keheh — Arabic uses ي ة/ه ك instead) plus the retroflex and
   extra consonants Arabic has no letter for at all (ٹ ڈ ڑ ں ھ ے پ چ گ ژ).
   A ratio, not a raw count, so a short snippet with one stray character
   doesn't get misclassified against a much longer sample. */
const URDU_MARKERS = /[ٹپچڈڑژکگںھہیےﭖ-ﭙﭦ-ﭩﭺ-ﭽﮈﮉﮊﮋﮌﮍﮎ-ﮕﮞﮟﮦ-ﮯﯼ-ﯿ]/g;
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

/* Sampled from three places, not just the opening. A madrassa Urdu book
   almost always begins with an Arabic bismillah, ayat or hadith before the
   Urdu commentary starts, so judging by the first few thousand characters
   alone declared those books Arabic and set them in the wrong face. */
const SCRIPT_WINDOW = 4000;

function scriptSample(text) {
  const s = String(text || "");
  if (s.length <= SCRIPT_WINDOW * 3) return s;
  const mid = Math.floor((s.length - SCRIPT_WINDOW) / 2);
  return s.slice(0, SCRIPT_WINDOW)
       + s.slice(mid, mid + SCRIPT_WINDOW)
       + s.slice(s.length - SCRIPT_WINDOW);
}

function detectScript(text) {
  const sample = scriptSample(text);
  const arabicChars = (sample.match(ARABIC_SCRIPT) || []).length;
  if (arabicChars < 20) return null;                  // not really Arabic-script text at all
  const urduChars = (sample.match(URDU_MARKERS) || []).length;
  return (urduChars / arabicChars) > 0.01 ? "ur" : "ar";
}

function applyReaderScript(text) {
  const el = $("rdText");
  el.classList.remove("script-ur", "script-ar");
  const script = detectScript(text);
  if (script) el.classList.add("script-" + script);
}

async function openReader(book, filePath, preset, presetOpts, presetHeadingsOnly) {
  $("rdTitle").textContent = book.title || "";
  $("rdFile").textContent = baseName(filePath);
  $("rdQuery").value = preset || "";   // a search result opens already on its word
  $("rdCount").textContent = "";
  $("rdBookTitle").textContent = book.title || "";
  $("rdText").innerHTML = `<div class="hint">${t("readerLoading")}</div>`;
  $("rdRows").innerHTML = "";
  $("rdResults").classList.add("hidden");
  $("rdFoot").classList.add("hidden");
  $("rdToc").innerHTML = "";
  $("dlgReader").showModal();

  const res = await window.maktaba.readText(filePath);
  if (!res.ok) {
    $("rdText").innerHTML = `<div class="hint err">${res.error || t("readerFailed")}</div>`;
    return;
  }
  readerText = res.text;
  applyReaderScript(readerText);
  readerHits = [];
  readerAt = 0;
  readerPage = 0;
  readerIndex = null;
  readerPages = paginate(readerText);
  readerToc = buildToc(readerText, readerPages);
  renderRdToc();
  if (preset) runReaderSearch(presetOpts, presetHeadingsOnly); else { paintReader(); renderRdResults(); }
  setTimeout(() => $("rdQuery").focus(), 60);
}


/* Renders ONE page, with any hits that fall inside it wrapped, and the
   current one marked. Built by slicing between hits rather than by replacing
   text, so overlapping or repeated words cannot corrupt the output. */
function paintReader() {
  const box = $("rdText");
  const page = readerPages[readerPage] || { start: 0, end: readerText.length };
  const body = readerText.slice(page.start, page.end);
  const inPage = readerHits
    .map((h, i) => ({ ...h, i }))
    .filter((h) => h.start >= page.start && h.start < page.end);

  let html = "", cursor = page.start;
  for (const h of inPage) {
    html += escapeHtml(readerText.slice(cursor, h.start)).replace(/\n/g, "<br>");
    html += `<mark class="rd-hit${h.i === readerAt ? " on" : ""}" data-hit="${h.i}">`
          + escapeHtml(readerText.slice(h.start, Math.min(h.end, page.end))) + "</mark>";
    cursor = Math.min(h.end, page.end);
  }
  html += escapeHtml(readerText.slice(cursor, page.end)).replace(/\n/g, "<br>");

  box.innerHTML = `<div class="rd-para">${html}</div>`
    + `<div class="rd-pageno-wrap"><span class="rd-pageno">${ud(readerPage + 1)}</span></div>`;
  box.scrollTop = 0;
  const cur = box.querySelector(".rd-hit.on");
  if (cur) cur.scrollIntoView({ block: "center" });
  syncPager();
}

/* Page controls: the slider, the page box and the four arrows all describe
   the same position, so they are all written from one place. */
function syncPager() {
  const total = readerPages.length;
  $("rdSlider").max = String(Math.max(0, total - 1));
  $("rdSlider").value = String(readerPage);
  $("rdPageBox").value = ud(readerPage + 1);
  $("rdPageTotal").textContent = t("readerOfPages").replace("{n}", ud(total));
  $("rdFirst").disabled = $("rdPrevPage").disabled = readerPage === 0;
  $("rdLast").disabled = $("rdNextPage").disabled = readerPage >= total - 1;
  const pct = total > 1 ? (readerPage / (total - 1)) * 100 : 0;
  $("rdSlider").style.setProperty("--rd-pct", pct + "%");
  const active = readerToc.filter((e) => e.page <= readerPage).pop();
  $("rdToc").querySelectorAll(".rd-toc-item").forEach((el) =>
    el.classList.toggle("on", active && +el.dataset.start === active.start));
}

function goToPage(n) {
  const total = readerPages.length;
  readerPage = Math.max(0, Math.min(n, total - 1));
  paintReader();
}

function renderRdToc() {
  const box = $("rdToc");
  box.classList.toggle("hidden", readerToc.length < 2);
  if (readerToc.length < 2) { box.innerHTML = ""; return; }
  box.innerHTML = readerToc.map((e) =>
    `<div class="rd-toc-item" data-start="${e.start}" data-page="${e.page}">${escapeHtml(e.title)}</div>`
  ).join("");
  box.querySelectorAll(".rd-toc-item").forEach((el) => {
    el.onclick = () => goToPage(+el.dataset.page);
  });
}

function runReaderSearch(scopeOpts, headingsOnly) {
  const q = $("rdQuery").value;
  if (q.trim()) {
    /* Only the jump straight from an FTS result carries scopeOpts/
       headingsOnly — typing a fresh query into the reader's own search box
       calls this with neither, which is the reader's ordinary unscoped
       in-book search and always has been. Re-using readerIndex across the
       two would be wrong when the diacritics/hamza options differ, so a
       scoped call gets its own index instead of touching the cached one. */
    const opts = scopeOpts || null;
    const idx = scopeOpts ? prepareIndex(readerText, opts) : (readerIndex || (readerIndex = prepareIndex(readerText, null)));
    let hits = findInTextOpts(readerText, q, opts, idx);
    if (headingsOnly) hits = hits.filter((h) => offsetInSpans(h.start, headingLineSpans(readerText)));
    readerHits = hits;
  } else {
    readerHits = [];
  }
  readerAt = 0;
  $("rdCount").textContent = !q.trim()
    ? ""
    : readerHits.length
      ? t("readerHits").replace("{n}", ud(readerHits.length))
      : t("readerNoHits");
  $("rdPrev").disabled = $("rdNext").disabled = readerHits.length < 2;
  // a search jumps to wherever the first hit actually is, not page one
  if (readerHits.length) readerPage = pageOfOffset(readerHits[0].start);
  paintReader();
  renderRdResults();
}

function stepReader(delta) {
  if (!readerHits.length) return;
  readerAt = (readerAt + delta + readerHits.length) % readerHits.length;
  $("rdCount").textContent = t("readerAt")
    .replace("{i}", ud(readerAt + 1)).replace("{n}", ud(readerHits.length));
  readerPage = pageOfOffset(readerHits[readerAt].start);
  paintReader();
  markRdResultCurrent();
}

/* Docked results list — every hit at a glance, the way Shamela's own
   in-book search shows a results table below the reading pane. A few words
   of context on each side of the match, not the whole paragraph, so a long
   book's hit list stays scannable. */
const RD_CONTEXT = 28;
/* A common word in a big book hits thousands of times — "الله" finds 2,557 in
   the uploaded Qur'an — so there is a ceiling here. It used to be 300, which
   cut off ordinary searches: قال alone finds 928, and a librarian looking for
   the 400th one simply could not reach it, with only a small line of footer
   text to say why.
   The old limit was really guarding against the row build being quadratic:
   every row rescanned the whole table of contents and the whole page list
   from the start to label itself. Hits come back in ascending offset order,
   so renderRdResults now walks both structures once for the entire list
   instead, and the build cost is proportional to the number of hits rather
   than hits × book structure. That makes a realistic search cheap enough to
   render in full.
   The ceiling stays only for the pathological case — searching a single very
   common letter can match tens of thousands of times, and no one scrolls
   30,000 rows. The count beside the search box always reports the true
   total. */
const RD_MAX_ROWS = 5000;

/* Which chapter a position falls in — the last heading at or before it.
   Real structure from the file's own headings, not a guess: this is what
   fills the الباب column the reference app shows. */
function chapterOfOffset(offset) {
  let found = "";
  for (const e of readerToc) {
    if (e.start > offset) break;
    found = e.title;
  }
  return found;
}

function renderRdResults() {
  const box = $("rdResults");
  const foot = $("rdFoot");
  const body = $("rdRows");
  const show = readerHits.length >= 2;
  box.classList.toggle("hidden", !show);
  foot.classList.toggle("hidden", !show);
  if (!show) { body.innerHTML = ""; return; }

  const bookName = escapeHtml($("rdTitle").textContent || "");
  /* One forward walk for the whole list, not a fresh scan per row. Hits are
     in ascending offset order, so neither cursor ever needs to go back —
     which is what makes rendering every hit affordable. Deliberately not
     chapterOfOffset/pageOfOffset here: those still exist for one-off lookups
     elsewhere, where a single scan is the cheaper thing. */
  let tocAt = 0;
  let pageAt = 0;
  let chapter = "";
  body.innerHTML = readerHits.slice(0, RD_MAX_ROWS).map((h, i) => {
    while (tocAt < readerToc.length && readerToc[tocAt].start <= h.start) chapter = readerToc[tocAt++].title;
    while (pageAt < readerPages.length - 1 && h.start >= readerPages[pageAt].end) pageAt++;
    const before = escapeHtml(readerText.slice(Math.max(0, h.start - RD_CONTEXT), h.start));
    const word = escapeHtml(readerText.slice(h.start, h.end));
    const after = escapeHtml(readerText.slice(h.end, h.end + RD_CONTEXT));
    return `<tr class="rd-result${i === readerAt ? " on" : ""}" data-i="${i}">
              <td class="rc-n">${ud(i + 1)}</td>
              <td class="rc-book">${bookName}</td>
              <td class="rc-text">…${before}<mark>${word}</mark>${after}…</td>
              <td class="rc-chap">${escapeHtml(chapter)}</td>
              <td class="rc-page">${ud(pageAt + 1)}</td>
            </tr>`;
  }).join("");

  foot.textContent = readerHits.length > RD_MAX_ROWS
    ? t("readerShowing").replace("{shown}", ud(RD_MAX_ROWS)).replace("{n}", ud(readerHits.length))
    : t("readerResultCount").replace("{n}", ud(readerHits.length));

  body.querySelectorAll(".rd-result").forEach((row) => {
    row.onclick = () => {
      readerAt = +row.dataset.i;
      $("rdCount").textContent = t("readerAt")
        .replace("{i}", ud(readerAt + 1)).replace("{n}", ud(readerHits.length));
      readerPage = pageOfOffset(readerHits[readerAt].start);
      paintReader();
      markRdResultCurrent();
    };
  });
}

function markRdResultCurrent() {
  const body = $("rdRows");
  body.querySelectorAll(".rd-result").forEach((row) =>
    row.classList.toggle("on", +row.dataset.i === readerAt));
  const cur = body.querySelector(".rd-result.on");
  if (cur) cur.scrollIntoView({ block: "nearest" });
}

let readerTimer = null;
$("rdQuery").addEventListener("input", () => {
  clearTimeout(readerTimer);
  readerTimer = setTimeout(runReaderSearch, 180);   // a book is long; do not search per keystroke
});
$("rdQuery").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); stepReader(e.shiftKey ? -1 : 1); }
});
$("rdNext").onclick = () => stepReader(1);
$("rdPrev").onclick = () => stepReader(-1);
$("rdClose").onclick = () => $("dlgReader").close();

/* Pinch-to-zoom in the reading pane, the more you zoom the bigger it gets.
   Set only on #rdText itself, not :root, so it can never bleed into the
   shared "card" font-size setting the book detail panel also reads from
   var(--card-size) — this is a per-session, reader-local override. Two
   input paths: a trackpad pinch, which Chromium reports as a wheel event
   with ctrlKey set; and a genuine two-finger touch pinch, for a touchscreen. */
const READER_ZOOM_MIN = 12, READER_ZOOM_MAX = 40;
let readerFontPx = 17;

function setReaderFontPx(px) {
  readerFontPx = Math.max(READER_ZOOM_MIN, Math.min(READER_ZOOM_MAX, px));
  $("rdText").style.setProperty("--card-size", readerFontPx + "px");
}

$("rdText").addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;             // a plain scroll must keep scrolling the page
  e.preventDefault();
  setReaderFontPx(readerFontPx - e.deltaY * 0.05);
}, { passive: false });

let pinchStartDist = null, pinchStartPx = 17;
const touchDist = (touches) => {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};
$("rdText").addEventListener("touchstart", (e) => {
  if (e.touches.length !== 2) return;
  pinchStartDist = touchDist(e.touches);
  pinchStartPx = readerFontPx;
}, { passive: true });
$("rdText").addEventListener("touchmove", (e) => {
  if (e.touches.length !== 2 || pinchStartDist === null) return;
  e.preventDefault();
  setReaderFontPx(pinchStartPx * (touchDist(e.touches) / pinchStartDist));
}, { passive: false });
$("rdText").addEventListener("touchend", (e) => {
  if (e.touches.length < 2) pinchStartDist = null;
});

/* Page controls, the way the reference app drives a book: arrows to the ends,
   a slider to sweep through it, and a box to go straight to a page. */
$("rdFirst").onclick = () => goToPage(0);
$("rdPrevPage").onclick = () => goToPage(readerPage - 1);
$("rdNextPage").onclick = () => goToPage(readerPage + 1);
$("rdLast").onclick = () => goToPage(readerPages.length - 1);
$("rdSlider").addEventListener("input", () => goToPage(+$("rdSlider").value));
$("rdPageBox").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  // accepts Urdu/Arabic digits too, since that is what the box itself shows
  const n = parseInt(String($("rdPageBox").value).replace(/[۰-۹٠-٩]/g,
    (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0
      ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d) : "٠١٢٣٤٥٦٧٨٩".indexOf(d))), 10);
  if (!isNaN(n)) goToPage(n - 1);
});
/* Arrow keys page the book, but only when the reader is the front dialog and
   the caret is not in one of its input boxes. */
document.addEventListener("keydown", (e) => {
  if (!$("dlgReader").open) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); goToPage(readerPage + 1); }
  if (e.key === "ArrowRight") { e.preventDefault(); goToPage(readerPage - 1); }
});

/* ── Full-text search across the library (Shamela: البحث) ─────────────────
   Searches the attached Unicode texts, not the catalogue fields — the
   catalogue box above the list already does names. Only books marked
   format="unicode" with an attachment have text to search at all, so the
   scan is over those and says plainly when there are none. */
/* path -> { text, idx }, for this session only. The prepared search index
   lives beside the text it was built from, so clearing or dropping a path
   discards both together and a stale index can never outlive its book.

   Bounded, because it used to keep every book it had ever searched for the
   life of the window: the Qur'an alone is 754,000 characters, and a library
   of a thousand Unicode books would have put gigabytes in one renderer and
   killed it. A Map iterates in insertion order, so the oldest entry is simply
   the first key — re-inserting on use is all least-recently-used needs. */
const FTS_CACHE_MAX_CHARS = 40 * 1000 * 1000;
const ftsCache = new Map();
let ftsCacheChars = 0;
let ftsBusy = false;

function ftsCacheSet(path, entry) {
  ftsCache.set(path, entry);
  ftsCacheChars += entry.text.length;
  while (ftsCacheChars > FTS_CACHE_MAX_CHARS && ftsCache.size > 1) {
    const [oldest, dropped] = ftsCache.entries().next().value;
    if (oldest === path) break;               // never evict what was just asked for
    ftsCache.delete(oldest);
    ftsCacheChars -= dropped.text.length;
  }
}

function ftsCacheClear() {
  ftsCache.clear();
  ftsCacheChars = 0;
}

function ftsCacheDrop(path) {
  const entry = ftsCache.get(path);
  if (!entry) return;
  ftsCache.delete(path);
  ftsCacheChars -= entry.text.length;
}

const ftsTerms = () =>
  ["fts1", "fts2", "fts3", "fts4"].map((id) => $(id).value.trim()).filter(Boolean);

async function ftsEntryOf(path) {
  const hit = ftsCache.get(path);
  if (hit) {
    ftsCache.delete(path);                    // re-insert, so it counts as recently used
    ftsCache.set(path, hit);
    return hit;
  }
  let text = "";
  try {
    const res = await window.maktaba.readText(path);
    if (res && res.ok) text = res.text || "";
  } catch { /* an unreadable attachment must not abort the whole search */ }
  const entry = { text, idx: new Map() };
  ftsCacheSet(path, entry);
  return entry;
}

/* Normalizing the Qur'an-sized file costs ~330 ms. Without this, running a
   second search over the same books paid that again for every book, so
   changing one word in the query felt like starting from nothing. Keyed by
   the two options that change what the index contains. */
function ftsIndexOf(entry, opts) {
  const key = (opts.diacritics ? "1" : "0") + (opts.hamza ? "1" : "0");
  let idx = entry.idx.get(key);
  if (!idx) { idx = prepareIndex(entry.text, opts); entry.idx.set(key, idx); }
  return idx;
}

async function runFullTextSearch() {
  if (ftsBusy) return;
  const terms = ftsTerms();
  if (!terms.length) { $("fts1").focus(); return; }

  const opts = { diacritics: $("ftsHarakat").checked, hamza: $("ftsHamza").checked };
  const anyOf = $("ftsAny").checked;
  const exclude = $("ftsNot").value.trim();

  /* Headings-only is a real narrowing filter (see headingLineSpans); body
     alone stays the original unrestricted search, since a heading line's
     own text is still real body content in a plain file — there is no
     reliable way to say a line is "only" a heading and nothing else. */
  const headingsOnly = $("ftsInHeadings").checked && !$("ftsInBody").checked;
  if (!$("ftsInBody").checked && !$("ftsInHeadings").checked) {
    $("ftsStatus").textContent = t("ftsNeedScope");
    return;
  }

  /* Checked books (see [data-check] in renderBooks) narrow the scan to just
     those; an empty set means every Unicode book, the original behaviour. */
  const scoped = ftsScopedIds.size
    ? DATA.books.filter((b) => ftsScopedIds.has(b.id))
    : DATA.books;
  const targets = scoped.filter((b) => b.format === "unicode" && (b.files || []).length);
  $("ftsResults").innerHTML = "";
  if (!targets.length) {
    $("ftsStatus").textContent = ftsScopedIds.size ? t("ftsNoTextsScoped") : t("ftsNoTexts");
    return;
  }

  ftsBusy = true;
  $("ftsRun").disabled = true;
  const found = [];
  let done = 0;
  for (const b of targets) {
    $("ftsStatus").textContent = t("ftsScanning")
      .replace("{i}", ud(++done)).replace("{n}", ud(targets.length));
    /* Hand the window back before the heavy work, or the counter above never
       repaints: once a book's text is cached, nothing in this loop actually
       waits on anything, and the whole scan runs in one frozen frame. */
    await new Promise((r) => setTimeout(r, 0));
    for (const path of b.files) {
      const entry = await ftsEntryOf(path);
      const text = entry.text;
      if (!text) continue;
      /* Normalize the book ONCE and reuse it for every term: on the 754k-character
         Qur'an that is ~330 ms instead of ~330 ms per term. */
      const idx = ftsIndexOf(entry, opts);
      // ليس — a book containing the excluded word drops out whatever else matched
      if (exclude && findInTextOpts(text, exclude, opts, idx).length) continue;
      const spans = headingsOnly ? headingLineSpans(text) : null;
      let perTerm = terms.map((q) => findInTextOpts(text, q, opts, idx));
      if (spans) perTerm = perTerm.map((hits) => hits.filter((h) => offsetInSpans(h.start, spans)));
      const ok = anyOf ? perTerm.some((h) => h.length) : perTerm.every((h) => h.length);
      if (!ok) continue;
      const hitIndex = perTerm.findIndex((h) => h.length);
      found.push({
        book: b,
        path,
        total: perTerm.reduce((n, h) => n + h.length, 0),
        term: terms[hitIndex] || terms[0]
      });
    }
  }
  ftsBusy = false;
  $("ftsRun").disabled = false;
  renderFtsResults(found, opts, headingsOnly);
}

function renderFtsResults(found, opts, headingsOnly) {
  const box = $("ftsResults");
  box.innerHTML = "";
  $("ftsStatus").textContent = found.length
    ? t("ftsFound").replace("{n}", ud(found.length))
    : t("ftsNoHits");

  for (const r of found) {
    const row = document.createElement("div");
    row.className = "fts-hit";
    row.innerHTML = `<span class="fh-title">${esc(r.book.title)}</span>
                     <span class="fh-count">${ud(r.total)}</span>`;
    row.title = baseName(r.path);
    // Opening straight at the word is the point — a result you still have to
    // go hunting for inside a long book is not a search result. The same
    // options that produced this count travel with it, so the reader shows
    // the same hits the panel just promised, not a bigger unscoped count
    // for the whole book (diacritics/hamza reset, headings-only dropped).
    row.onclick = () => openReader(r.book, r.path, r.term, opts, headingsOnly);
    box.appendChild(row);
  }
}

$("railFts").onclick = () => {
  // Opening it from any other tab must actually show it, not silently do
  // nothing because the panel only ever appears on "books".
  if (!ftsOpen && mode !== "books") { setMode("books"); }
  setFtsOpen(!ftsOpen);
};
$("ftsRun").onclick = runFullTextSearch;
$("ftsClear").onclick = () => {
  for (const id of ["fts1", "fts2", "fts3", "fts4", "ftsNot"]) $(id).value = "";
  $("ftsResults").innerHTML = "";
  $("ftsStatus").textContent = "";
  $("fts1").focus();
};

/* The checked-books chip above the search fields, shown only once at least
   one book is checked in the list — count only, not a list of titles, so it
   stays one line regardless of how many are checked. */
function updateFtsScope() {
  const n = ftsScopedIds.size;
  $("ftsScope").classList.toggle("hidden", n === 0);
  if (!n) { $("ftsScopeList").innerHTML = ""; return; }
  $("ftsScopeTitle").textContent = t("ftsScopeCount").replace("{n}", ud(n));

  /* One line per checked book, full title with its author — the same
     "Title (Author)" pattern the hover card and reader use elsewhere —
     not just a bare count, so it is obvious at a glance which books are
     actually in scope, matching the reference app's own checked-books
     list. Each carries its own remove control, so a book can be dropped
     from here without hunting for its row back in the list. */
  const list = $("ftsScopeList");
  list.innerHTML = [...ftsScopedIds].map((id) => {
    const b = DATA.books.find((x) => x.id === id);
    if (!b) return "";
    return `<div class="fts-scope-item${ftsScopePicked.has(id) ? " picked" : ""}" data-pick="${id}">
        <svg><use href="#i-book"/></svg>
        <span>${esc(b.title)}${b.author ? ` <span class="fso-author">(${esc(b.author)})</span>` : ""}</span>
        <button type="button" data-unscope="${id}"><svg><use href="#i-x"/></svg></button>
      </div>`;
  }).join("");
  list.querySelectorAll("[data-unscope]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = +btn.dataset.unscope;
      ftsScopedIds.delete(id);
      ftsScopePicked.delete(id);
      const rowCheck = document.querySelector(`.bookrow [data-check="${id}"]`);
      if (rowCheck) rowCheck.classList.remove("on");
      updateFtsScope();
    };
  });
  /* Clicking a line highlights it (click again to un-highlight); the red
     cross below removes every highlighted line at once. */
  list.querySelectorAll("[data-pick]").forEach((row) => {
    row.onclick = () => {
      const id = +row.dataset.pick;
      if (ftsScopePicked.has(id)) ftsScopePicked.delete(id); else ftsScopePicked.add(id);
      row.classList.toggle("picked", ftsScopePicked.has(id));
      $("ftsScopeRemove").disabled = ftsScopePicked.size === 0;
    };
  });
  $("ftsScopeRemove").disabled = ftsScopePicked.size === 0;
}


$("ftsScopeRemove").onclick = () => {
  for (const id of ftsScopePicked) {
    ftsScopedIds.delete(id);
    const rowCheck = document.querySelector(`.bookrow [data-check="${id}"]`);
    if (rowCheck) rowCheck.classList.remove("on");
  }
  ftsScopePicked.clear();
  updateFtsScope();
};

/* The broom: empties the whole selection in the search panel and the ticks in
   the main table together, so one press returns to searching every book. */
$("ftsScopeClear").onclick = () => {
  ftsScopedIds.clear();
  ftsScopePicked.clear();
  renderBooks();     // drops every row's checked state
  updateFtsScope();
};
for (const id of ["fts1", "fts2", "fts3", "fts4", "ftsNot"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); runFullTextSearch(); }
  });
}

/* ── Duplicates (Shamela: مقارنۃ الکتب لفرز المکررات) ────────────────── */

function showDuplicates() {
  const groups = duplicateGroups(DATA.books);
  const body = $("dupeBody");
  body.innerHTML = groups.length
    ? groups.map((g) => `
        <div class="dupe-group">
          <div class="dupe-title">${esc(g[0].title)} — ${esc(g[0].author) || t("noAuthor")}</div>
          ${g.map((b) => `<div class="dupe-row">${t("fAccession")} <b>${ud(b.accession || "—")}</b> · ${t("st_" + b.status)}${b.maktaba ? " · " + esc(b.maktaba) : ""}</div>`).join("")}
        </div>`).join("")
    : `<div class="hint">${t("noDuplicates")}</div>`;
  $("dlgDupes").showModal();
}

/* ── What's New ──────────────────────────────────────────────────────── */

async function showWhatsNew() {
  const res = await window.maktaba.whatsNew();
  const body = $("whatsNewBody");
  const lang = ["ur", "ar", "en"].includes(LANG) ? LANG : "en";   // notes are authored in all three
  const rel = res.data && res.data.releases;
  body.innerHTML = rel && rel.length
    ? rel.map((r) => `
        <div class="wn-rel">
          <div class="wn-ver">v${esc(r.version)}<span class="wn-date">${esc(r.date)}</span></div>
          <ul class="wn-list">${(r[lang] || r.en || r.ar || []).map((li) => `<li>${esc(li)}</li>`).join("")}</ul>
        </div>`).join("")
    : `<div class="hint">${t("noWhatsNew")}</div>`;
  $("dlgWhatsNew").showModal();
}

/* ── Language switch ─────────────────────────────────────────────────── */

const LANG_CYCLE = ["ur", "ar", "en"];
$("btnLang").onclick = () => {
  const next = LANG_CYCLE[(LANG_CYCLE.indexOf(LANG) + 1) % LANG_CYCLE.length];
  // Stays on this machine — setLang persists it locally. See applySyncedLang's
  // removal above for why it no longer travels with the catalogue.
  setLang(next);
};

/* One delegated listener covers every .pwd-toggle button, including
   sSbKey/sToken in settings that only exist once that dialog's markup is
   in the DOM at load — no per-field wiring needed. */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".pwd-toggle");
  if (!btn) return;
  const input = $(btn.dataset.for);
  if (!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
});

$("catAdd").onclick = addCategory;
$("catNew").addEventListener("keydown", (e) => { if (e.key === "Enter") addCategory(); });
$("aboutWhatsNew").onclick = () => { $("dlgAbout").close(); showWhatsNew(); };

boot();
