let DATA = { library: "", updated: "", books: [] };
let nextId = 1;
let mode = "books";        // rail: books | category | author | status | shelf | favorites | recent
let group = null;          // selected group value, null = all
let filter = "all";        // tab: all | available | issued | missing | overdue
let sortMode = "accession"; // accession | title | author | added
let selectedId = null;

const $ = (id) => document.getElementById(id);

/* Physical layout: مکتبہ (building/branch) → شعبہ (department, only نعمانیہ جدید
   subdivides) → الماری نمبر (a free-text cabinet number, typed per book). */
const MAKTABA_OPTIONS = ["قباء مسجد", "نعمانیہ قدیم", "نعمانیہ جدید"];
const DEPARTMENTS_BY_MAKTABA = {
  "نعمانیہ جدید": ["دار الافتاء", "دار التصنیف", "لائبریری", "غرفة عامة للشيخ", "غرفة خاصة للشيخ"]
};
function departmentsFor(maktaba) { return DEPARTMENTS_BY_MAKTABA[maktaba] || []; }
function updateDeptList(maktaba) {
  const dl = $("deptList");
  if (!dl) return;
  dl.innerHTML = departmentsFor(maktaba).map((d) => `<option value="${d}"></option>`).join("");
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
  "عقیدہ وعلم الکلام", "علوم القرآن/اصول التفسیر", "شروحِ حدیث", "علوم حدیث",
  "اصول فقہ", "قواعد الفقہ", "فقہ حنفی", "فقہ شافعی", "فقہ مالکی", "فقہ عام",
  "تاریخ", "تراجم", "نحو و صرف", "تراجم وطبقات", "الادب العربی", "درس نظامی",
  "اصلاحی کتب(خطبات، ملفوظات اور مکتوبات)", "سیاسی کتب", "آداب واذکار", "سوانح"
];

function categories() {
  if (!Array.isArray(DATA.categories) || !DATA.categories.length) {
    DATA.categories = [...DEFAULT_CATEGORIES];
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
  if (dl) dl.innerHTML = categoryChoices().map((c) => `<option value="${c}"></option>`).join("");
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

const todayISO = () => new Date().toISOString().slice(0, 10);

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

function imageSrc(image) {
  if (!image) return "";
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

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
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
    pullLatest: async () => ({ ok: false, error: "preview" }),
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
    openFile: async () => {},
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
  if (assignAccessions() || didMigrate) persist();
  nextId = 1 + DATA.books.reduce((m, b) => Math.max(m, b.id || 0), 0);
  categories();
  refreshCategoryList();
  applyTheme();
  applySyncedLang();
  COVERS_DIR = await window.maktaba.coversDir();
  $("sbPath").textContent = await window.maktaba.dataPath();
  const v = await window.maktaba.version();
  const el = $("aboutVer");
  if (el) el.textContent = "Maktaba Naumania — v" + v;
  renderAll();
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
  autoSyncTimer = setInterval(() => doPull(true), AUTO_SYNC_MS);
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
  applyReadOnly();

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
  if (!state.unpublished) {
    // Nothing local to lose — adopt the server copy without interrupting.
    await adoptData(peek.data);
    toast(t("syncedFromServer"));
    return;
  }

  $("confirmTitle").textContent = t("syncConflictTitle");
  $("confirmLead").textContent = t("syncConflictLead");
  $("confirmBody").innerHTML = renderDiff(d);
  $("confirmGo").textContent = t("pullGo");
  $("dlgConfirm").showModal();
  $("confirmGo").onclick = async () => {
    $("dlgConfirm").close();
    await adoptData(peek.data);
    toast(t("pulled"));
  };
}

/* Replaces the whole in-memory catalogue with one from the server and rebuilds
   everything that reads from it. Used by both the pull button and login sync. */
async function adoptData(next) {
  await flushSave();          // don't let a queued write land after the swap
  await window.maktaba.applyData(next);
  /* Attachments may have been replaced by whatever we just pulled, and the
     search cache is keyed by path — same path, new contents would otherwise
     keep answering from the old text for the rest of the session. */
  ftsCache.clear();
  DATA = next;
  DATA.books.forEach(normalizeBook);
  nextId = 1 + DATA.books.reduce((m, b) => Math.max(m, b.id || 0), 0);
  categories();
  refreshCategoryList();
  applyTheme();
  renderAll();
  refreshPublishBadge();
}

/* Shows the librarian, without being asked, that this machine is holding work
   the rest of the madrassa cannot see yet. */
async function refreshPublishBadge() {
  const btn = $("tbPublish");
  if (!btn) return;
  if (!IS_MASTER) { btn.classList.remove("pending"); return; }
  const state = await window.maktaba.publishState();
  btn.classList.toggle("pending", Boolean(state.unpublished));
  btn.title = state.unpublished ? t("unpublishedTip") : t("publishBtn");
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
  DATA.updated = await window.maktaba.save(DATA);
  renderStatus();
  refreshPublishBadge();
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
  $("ftsPane").classList.toggle("hidden", !ftsOpen);
  $("railFts").classList.toggle("active", ftsOpen);
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

function groups() {
  const map = new Map();
  for (const b of DATA.books) {
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
    if (!isFlat() && group !== null && groupKey(b) !== group) return false;
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
  if (mode === "recent") return out.sort((a, b) => String(b.viewedAt).localeCompare(String(a.viewedAt)));
  return sortBooks(out);
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
  list.innerHTML = "";

  const all = document.createElement("div");
  all.className = "grouprow" + (group === null ? " sel" : "");
  all.innerHTML = `<div class="c-name"><svg><use href="#i-grid"/></svg><span>${t("tabAll")}</span></div>
                   <div class="c-count">${ud(DATA.books.length)}</div>`;
  all.onclick = () => { group = null; selectedId = null; renderAll(); };
  list.appendChild(all);

  const icon = { category: "i-tag", author: "i-pen", status: "i-check", shelf: "i-shelf" }[mode];
  for (const [name, count] of groups()) {
    const row = document.createElement("div");
    row.className = "grouprow" + (group === name ? " sel" : "");
    row.innerHTML = `<div class="c-name"><svg><use href="#${icon}"/></svg><span>${name}</span></div>
                     <div class="c-count">${ud(count)}</div>`;
    row.onclick = () => { group = name; selectedId = null; renderAll(); };
    list.appendChild(row);
  }
}

function renderBooks() {
  const list = $("bookList");
  list.innerHTML = "";
  const books = visibleBooks();

  for (const b of books) {
    const row = document.createElement("div");
    row.className = "bookrow st-" + b.status + (b.id === selectedId ? " sel" : "") + (isOverdue(b) ? " overdue" : "");
    const badges = [
      b.format === "pdf" ? `<span class="fmt-badge">PDF</span>` : "",
      b.format === "unicode" ? `<span class="fmt-badge">TXT</span>` : "",
      (b.files || []).length > 1 ? `<span class="fmt-badge">×${ud(b.files.length)}</span>` : "",
      isOverdue(b) ? `<span class="fmt-badge od">${t("overdue")}</span>` : ""
    ].join("");
    row.innerHTML = `<span class="br-star${b.favorite ? " on" : ""}" data-star="${b.id}" title="${t("favorite")}">${b.favorite ? "★" : "☆"}</span>
                     <span class="br-acc">${ud(b.accession || "—")}</span>
                     <span class="br-author">${b.author || t("noAuthor")}</span>
                     <span class="br-title"><span class="dot" title="${t("st_" + b.status)}"></span>${b.title}${badges}</span>
                     <span class="br-publisher">${b.publisher || ""}</span>`;
    row.onclick = () => {
      selectedId = b.id;
      b.viewedAt = new Date().toISOString();
      persistSoon();
      /* Moving the highlight used to rebuild every row in the list — at a few
         thousand books that is the whole list thrown away and recreated just
         to shift one class. Move the class instead. */
      const prev = list.querySelector(".bookrow.sel");
      if (prev) prev.classList.remove("sel");
      row.classList.add("sel");
      renderDetail();
      openBook();          // picker closes, the book takes the window
    };
    if (theme().hoverCard) {
      row.onmouseenter = () => showCard(b, row);
      row.onmouseleave = scheduleHideCard;
    }
    list.appendChild(row);
  }

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
  }

  $("listCount").textContent = `${ud(books.length)} / ${ud(DATA.books.length)} ${t("tabAll")}`;
  const none = selectedId === null;
  $("tbDelete").disabled = none;
  $("footDel").disabled = none;

  /* The header never scrolls but the list does, so it carries a scrollbar the
     header lacks — reserve that exact width on the header or every column
     drifts out of line with its heading the moment the list needs to scroll. */
  document.documentElement.style.setProperty("--scrollbar-w", (list.offsetWidth - list.clientWidth) + "px");
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
    return;
  }

  body.innerHTML = `
    <div class="coverbox" id="coverBox"></div>
    <label class="lead">${t("fTitle").replace(" *", "")}</label><input id="dTitle" />
    <label class="lead">${t("fAuthor")}</label><input id="dAuthor" />
    <label class="lead">${t("fPublisher")}</label><input id="dPublisher" />
    <label>${t("fCategory")}</label><input id="dCategory" list="catList" />
    <label>${t("fVolumes")}</label><input id="dVolumes" type="number" min="0" />
    <label class="lead">${t("fMaktaba")}</label>
    <select id="dMaktaba"></select>
    <label class="lead">${t("fDepartment")}</label><input id="dDepartment" list="deptList" />
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
  bind("dTitle", "title");
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
        `<div class="hist-row"><span class="hist-date">${h.date}</span><span>${t("ev_" + h.action) || h.action}${h.detail ? " — " + h.detail : ""}</span></div>`
      ).join("")}</div>`
    : "";

  /* The panel leads with where the copy is right now, in plain words, then
     offers only the moves that make sense from that state. Showing "issue"
     next to a book that is already out is how registers drift out of step. */
  const isDept = b.issueType === "department";
  const whereClass = b.status === "available" ? "ok" : b.status === "missing" ? "bad" : "out";
  const whereText = b.status === "available"
    ? `${t("whereShelf")}${b.almari ? ` · ${t("fShelf")} ${b.almari}` : ""}`
    : b.status === "missing"
      ? t("whereMissing")
      : `${isDept ? t("whereDept") : t("wherePerson")} · ${heldByLine(b)}`;

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
        body: `<p class="ask-book">${b.title}</p>
               <p>${isDept ? t("confirmBackBody") : t("confirmReturnBody")}</p>
               <p class="ask-who">${heldByLine(b)}</p>
               ${b.almari ? `<p class="hint">${t("backToAlmari")} ${b.almari}</p>` : ""}`,
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
      body: `<p class="ask-book">${b.title}</p><p>${t("confirmMissingBody")}</p>`,
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
  el.textContent = `${t("durationDays").replace("{n}", ud(total))} — ${leftText}`;
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
    $("iDue").value = due.toISOString().slice(0, 10);
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
      body: `<p class="ask-book">${b.title}</p>
             <p>${mode === "department" ? t("confirmTransferBody") : t("confirmIssueBody")}</p>
             <p class="ask-who">${who}${mode === "department" && almari ? ` · ${t("fShelf")} ${almari}` : ""}</p>
             <p class="hint">${t("fDueDate")}: ${$("iDue").value}</p>`,
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
      <span class="cat-name">${c}</span>
      <span class="cat-count">${ud(counts.get(c) || 0)}</span>
      <button class="tbtn danger" data-delcat="${i}" title="${t("mDelete")}"><svg><use href="#i-x"/></svg></button>
    </div>`).join("") || `<div class="hint">${t("noCategories")}</div>`;

  box.querySelectorAll("[data-delcat]").forEach((btn) => {
    btn.onclick = () => {
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
            <span>${b.title}</span>
            <span>${heldByLine(b) || "—"}<span class="who-kind">${b.issueType === "department" ? t("whereDept") : t("wherePerson")}</span></span>
            <span>${b.issueType === "person" ? (b.borrowerAddress || b.borrowerContact || "—") : "—"}</span>
            <span dir="ltr" class="iss-phone">${b.issueType === "person" ? (b.borrowerPhone || "—") : "—"}</span>
            <span>${b.dueDate || "—"}${isOverdue(b) ? ` · ${t("overdue")}` : ""}</span>
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
    b.dueDate = due.toISOString().slice(0, 10);
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

function showCard(b, row) {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    const card = $("bookCard");
    const src = imageSrc(b.image);
    /* Shamela writes each fact as one running line, "label: value", not as
       two aligned columns — that is what makes its card read like a title
       page rather than a form. */
    const line = (label, value) => value
      ? `<div class="bc-line"><span class="bc-k">${label}:</span> <span class="bc-v">${value}</span></div>`
      : "";

    /* Laid out like Shamela's own book card: the title carrying its author in
       brackets, the section beneath it, a full-width rule, then the record as
       running "label: value" lines. The cover is the one addition, floated to
       the inline-end so it never breaks that column of text, and drawn only
       when the book actually has one. */
    card.innerHTML = `
      ${src ? `<img class="bc-img" src="${src}" alt="" />` : ""}
      <div class="bc-head">${b.title}${b.author ? `  <span class="bc-paren">(${b.author})</span>` : ""}</div>
      ${b.category ? `<div class="bc-cat">${t("fCategory")}: ${b.category}</div>` : ""}
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

    /* Sits beside the row it describes, on the side the script reads from:
       right for Urdu and Arabic, left for English. Clamped on both axes so
       it stays fully on screen and never covers the row's own text. */
    const r = row.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const GAP = 10;
    const rtl = document.documentElement.dir !== "ltr";

    let left = rtl ? r.right - w : r.left;
    // if that side has no room, fall back to the opposite edge of the row
    if (rtl && left < GAP) left = Math.min(r.left, window.innerWidth - w - GAP);
    if (!rtl && left + w > window.innerWidth - GAP) left = Math.max(GAP, r.right - w);
    left = Math.max(GAP, Math.min(left, window.innerWidth - w - GAP));

    // hang just under the row so the hovered line stays readable
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - GAP) top = Math.max(GAP, r.top - h - 6);
    top = Math.max(GAP, Math.min(top, window.innerHeight - h - GAP));

    card.style.left = left + "px";
    card.style.top = top + "px";
    card.style.right = "auto";
  }, 320);
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
{
  const card = $("bookCard");
  card.addEventListener("mouseenter", () => clearTimeout(cardTimer));
  card.addEventListener("mouseleave", scheduleHideCard);
}

function renderCover(b) {
  const box = $("coverBox");
  if (!box) return;
  const src = imageSrc(b.image);
  box.innerHTML = src
    ? `<img class="cover-img" src="${src}" alt="" />
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
  if (drop) drop.onclick = () => { b.image = ""; persist(); renderCover(b); renderBooks(); };
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
    btn.onclick = () => window.maktaba.openFile(b.files[+btn.dataset.open]);
  });
  row.querySelectorAll("[data-read]").forEach((btn) => {
    btn.onclick = () => openReader(b, b.files[+btn.dataset.read]);
  });
  row.querySelectorAll("[data-drop]").forEach((btn) => {
    btn.onclick = () => {
      if (!requireMaster()) return;
      ftsCache.delete(b.files[+btn.dataset.drop]);   // dropped text must leave the search cache too
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
  if (dlg.classList.contains("max")) {
    const bar = document.querySelector(".toolbar");
    const status = document.querySelector(".statusbar");
    const top = bar ? bar.getBoundingClientRect().bottom + 10 : 120;
    const bottom = status ? status.getBoundingClientRect().height + 10 : 34;
    dlg.style.top = top + "px";
    dlg.style.height = Math.max(320, window.innerHeight - top - bottom) + "px";
    dlg.style.width = "calc(100vw - 20px)";
    dlg.style.left = "";                  // hand position back to the centring rule
    dlg.style.right = "";
    return;
  }
  // Not maximised: leave size/position exactly as opened or dragged, only
  // re-clamp so it can't end up off-screen after the window shrinks.
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

function togglePickerMax() {
  const dlg = $("dlgCatalog");
  const now = dlg.classList.toggle("max");
  if (!now && pickerLeftPx === null && pickerTopPx === null) {
    // Never dragged before maximising: hand every inset back to the CSS
    // centring rule so leftover inline right:auto/bottom:auto (set only on
    // drag) can't linger and block it.
    dlg.style.top = dlg.style.right = dlg.style.bottom = dlg.style.height = dlg.style.width = "";
  } else if (!now) {
    dlg.style.height = dlg.style.width = "";   // dragged position stays; only size hands back
  }
  fitPicker();
  $("pickerMax").querySelector("use").setAttribute("href", now ? "#i-restore" : "#i-max");
}
$("pickerMax").onclick = togglePickerMax;

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
    if (dlg.classList.contains("max")) return;            // nothing to drag when maximised
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
function showHome() {
  const dlg = $("dlgCatalog");
  if (dlg.open) dlg.close();
}

/* Shamela closes the picker the moment a book is chosen and shows that book
   in the window behind it. Nothing here reads book text — we show the
   catalogue record instead — but the flow is the same. */
function openBook() {
  hideCard();                                  // the hover card from the row just clicked must not linger
  showHome();                                  // close the picker
  $("bookView").classList.remove("hidden");
  const b = DATA.books.find((x) => x.id === selectedId);
  $("bvTitle").textContent = b ? b.title : "";
}

function closeBook() {
  $("bookView").classList.add("hidden");
  selectedId = null;
  renderBooks();
  renderDetail();
}

function setMode(next) {
  $("rail").querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
  mode = next;
  group = null;
  selectedId = null;
  showCatalog();
  renderAll();
}

$("rail").querySelectorAll("[data-mode]").forEach((btn) => {
  btn.onclick = () => setMode(btn.dataset.mode);
});
document.querySelectorAll('[data-mode="category"]').forEach((btn) => {
  if (!btn.closest("#rail")) btn.onclick = () => setMode("category");
});
$("railHome").onclick = showHome;
$("pickerClose").onclick = showHome;
$("bvClose").onclick = closeBook;

/* A non-modal dialog gets no Escape handling from the browser, so wire it. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.querySelector("dialog[open]:modal")) return;   // let real modals handle their own Esc
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
$("bvPick").onclick = showCatalog;
$("tbPicker").onclick = showCatalog;
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
}

document.querySelectorAll("[data-mat]").forEach((btn) => {
  btn.onclick = () => {
    const m = btn.dataset.mat;
    if (materialFilter.has(m)) materialFilter.delete(m); else materialFilter.add(m);
    syncMaterialUI();
    renderBooks();
  };
});

const setGroupMaterials = (list, on) => {
  list.forEach((m) => (on ? materialFilter.add(m) : materialFilter.delete(m)));
  syncMaterialUI();
  renderBooks();
};
$("matPrinted").onchange = () => setGroupMaterials(PRINTED, $("matPrinted").checked);
$("matUnprinted").onchange = () =>
  setGroupMaterials(MATERIALS.filter((m) => !PRINTED.includes(m)), $("matUnprinted").checked);

$("search").addEventListener("input", renderBooks);
$("btnClearSearch").onclick = () => { $("search").value = ""; renderBooks(); };

/* ── Add / delete ─────────────────────────────────────────────────────── */

function syncAddOneHasPrint() {
  $("oShelfFields").classList.toggle("hidden", !$("oHasPrint").checked);
}

function openAddOne() {
  if (!requireMaster()) return;
  for (const id of ["oTitle", "oAuthor", "oPublisher", "oCategory", "oDepartment", "oShelf", "oNotes"]) $(id).value = "";
  $("oVolumes").value = 1;
  $("oHasPrint").checked = true;      // most books added are physical; unchecking is the exception
  syncAddOneHasPrint();
  fillMaktabaSelect($("oMaktaba"), mode === "shelf" && group ? group : "");
  updateDeptList($("oMaktaba").value);
  if (mode === "category" && group) $("oCategory").value = group;
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

$("oSave").onclick = () => {
  const hasPrint = $("oHasPrint").checked;
  /* A book with no physical copy has nowhere to sit — a branch, department or
     almari would be a fiction. Only real fields for the shelf it's on are
     required, and only when there is a shelf. */
  const required = ["oTitle", "oAuthor", "oPublisher", "oCategory", "oVolumes", "oNotes"]
    .concat(hasPrint ? ["oMaktaba", "oDepartment", "oShelf"] : []);
  for (const id of required) {
    const el = $(id);
    if (!el.value || !String(el.value).trim()) { el.focus(); toast(t("fieldRequired")); return; }
  }
  const title = $("oTitle").value.trim();
  const b = {
    id: nextId++,
    title,
    author: $("oAuthor").value.trim(),
    publisher: $("oPublisher").value.trim(),
    category: $("oCategory").value.trim(),
    volumes: parseInt($("oVolumes").value, 10) || 0,
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

function openAddMany() {
  if (!requireMaster()) return;
  $("mText").value = "";
  $("mCount").textContent = `${ud(0)} ${t("tabAll")}`;
  $("dlgMany").showModal();
}

$("mText").addEventListener("input", () => {
  const n = $("mText").value.split("\n").filter((l) => l.trim()).length;
  $("mCount").textContent = `${ud(n)} ${t("tabAll")}`;
});

$("mSave").onclick = () => {
  const lines = $("mText").value.split("\n").map((l) => l.trim()).filter(Boolean);
  let added = 0;
  for (const line of lines) {
    const [title, author = "", category = "", volumes = ""] = line.split("|").map((s) => s.trim());
    if (!title) continue;
    DATA.books.push({
      id: nextId++,
      title,
      author,
      publisher: "",
      category: category || (mode === "category" && group ? group : ""),
      volumes: parseInt(volumes, 10) || 0,
      maktaba: mode === "shelf" && group ? group : "",
      department: "",
      status: "available",
      notes: ""
    });
    normalizeBook(DATA.books[DATA.books.length - 1]);
    added++;
  }
  $("dlgMany").close();
  persist();
  renderAll();
  toast(`${ud(added)}${t("added")}`);
};

function deleteSelected() {
  if (!requireMaster()) return;
  const b = DATA.books.find((x) => x.id === selectedId);
  if (!b) return;
  if (!confirm(`"${b.title}" — ${t("confirmDelete")}`)) return;
  DATA.books = DATA.books.filter((x) => x.id !== selectedId);
  selectedId = null;
  $("bookView").classList.add("hidden");
  persist();
  renderAll();
}

$("tbAddOne").onclick = openAddOne;
$("footAdd").onclick = openAddOne;
$("tbAddMany").onclick = openAddMany;
$("footAddMany").onclick = openAddMany;
$("tbDelete").onclick = deleteSelected;
$("footDel").onclick = deleteSelected;

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

  $("confirmTitle").textContent = t("pullConfirmTitle");
  $("confirmLead").textContent = t("pullConfirmLead");

  let html = "";
  // The librarian's own note about this release, when there is one.
  const wn = await window.maktaba.whatsNew().catch(() => null);
  const latest = wn && wn.data && Array.isArray(wn.data.releases) && wn.data.releases[0];
  if (latest) {
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
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
  $("confirmGo").textContent = t("pullGo");
  $("dlgConfirm").showModal();

  $("confirmGo").onclick = async () => {
    $("dlgConfirm").close();
    await adoptData(incoming);
    toast(t("pulled"));
  };
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
    if (!res.ok) {
      // Lost the lock (went stale, or another device forced a claim) —
      // drop back to reader mode rather than pretend we still hold it.
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
    window.maktaba.authLogout();
    refreshMasterUI();
    return;
  }

  box.checked = false; // stays off until the gate actually passes
  const configured = await window.maktaba.authConfigured();

  if (configured) {
    $("loginEmail").value = "";
    $("loginPassword").value = "";
    $("loginHint").textContent = "";
    $("dlgLogin").showModal();
    setTimeout(() => $("loginEmail").focus(), 50);

    $("loginSave").onclick = async () => {
      const email = $("loginEmail").value.trim();
      const pw = $("loginPassword").value;
      if (!email || !pw) return;
      $("loginSave").disabled = true;
      const res = await window.maktaba.authLogin(email, pw, navigator.userAgent.slice(0, 40));
      $("loginSave").disabled = false;
      if (res.ok) {
        $("dlgLogin").close();
        box.checked = true;
        startHeartbeat();
        toast(t("masterLoggedIn"));
        await refreshMasterUI();
        await syncOnBecomingMaster();
      } else if (res.error === "held") {
        $("loginHint").textContent = t("masterHeldBy").replace("{who}", res.heldBy || "?");
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
  const fromBooks = (from && from.books) || [];
  const toBooks = (to && to.books) || [];
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
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  const btn = $("tbPublish");
  btn.disabled = true;
  btn.innerHTML = `<svg><use href="#i-upload"/></svg><span>${t("checking")}</span>`;

  await flushSave();          // never publish a stale copy
  const peek = await window.maktaba.peekRemote();
  btn.disabled = false;
  btn.innerHTML = `<svg><use href="#i-upload"/></svg><span>${t("publishBtn")}</span>`;

  // No remote yet (first ever publish) diffs against an empty catalogue.
  const remote = peek.ok ? peek.data : { books: [], categories: [] };
  const d = diffCatalogues(remote, DATA);

  $("confirmTitle").textContent = t("publishConfirmTitle");
  $("confirmLead").textContent = peek.ok ? t("publishConfirmLead") : t("publishFirstLead");
  $("confirmBody").innerHTML = renderDiff(d);
  $("confirmGo").textContent = t("publishGo");
  $("dlgConfirm").showModal();

  $("confirmGo").onclick = async () => {
    $("dlgConfirm").close();
    btn.disabled = true;
    btn.innerHTML = `<svg><use href="#i-upload"/></svg><span>${t("publishing")}</span>`;
    const res = await window.maktaba.publish(DATA);
    btn.disabled = false;
    btn.innerHTML = `<svg><use href="#i-upload"/></svg><span>${t("publishBtn")}</span>`;
    if (res.ok) {
      /* Adopt the rewritten records (covers and files are hosted URLs now),
         or the next autosave would put the local paths back on disk. */
      if (res.data) {
        DATA = res.data;
        DATA.books.forEach(normalizeBook);
        renderAll();
      }
      toast(t("published"));
      refreshPublishBadge();
    } else alert(t("publishFail") + res.error);
  };
}

$("tbExport").onclick = doExport;
/* Not `= doPull` — that would pass the click event through as `auto`, and a
   MouseEvent is truthy, silently turning every manual click into a background
   check no dialog is allowed to appear from. */
$("tbPull").onclick = () => doPull(false);
$("tbSettings").onclick = openSettings;
$("tbPublish").onclick = doPublish;

$("sSave").onclick = async () => {
  await window.maktaba.setSettings({
    owner: $("sOwner").value.trim(),
    repo: $("sRepo").value.trim(),
    branch: $("sBranch").value.trim(),
    token: $("sToken").value.trim(),
    isLibrarian: $("sLibrarian").checked,
    supabaseUrl: $("sSbUrl").value.trim(),
    supabaseAnonKey: $("sSbKey").value.trim()
  });
  $("dlgSettings").close();
  toast(t("settingsSaved"));
};

document.querySelectorAll("dialog [data-close]").forEach((b) => {
  b.onclick = () => b.closest("dialog").close();
});

/* ── Menu bar ─────────────────────────────────────────────────────────── */

document.querySelectorAll(".menu > span").forEach((label) => {
  label.onclick = (e) => {
    e.stopPropagation();
    const menu = label.parentElement;
    const wasOpen = menu.classList.contains("open");
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
    if (!wasOpen) menu.classList.add("open");
  };
});
document.addEventListener("click", () => {
  document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
});

const MENU_ACTIONS = {
  addOne: openAddOne,
  addMany: openAddMany,
  export: doExport,
  publish: doPublish,
  quit: () => window.close(),
  focusSearch: () => $("search").focus(),
  clearSearch: () => { $("search").value = ""; renderBooks(); },
  settings: openSettings,
  appearance: openAppearance,
  pull: doPull,
  duplicates: showDuplicates,
  issued: showIssued,
  categoriesMan: showCategoryManager,
  whatsNew: showWhatsNew,
  about: () => $("dlgAbout").showModal()
};

document.querySelectorAll(".dropdown [data-act]").forEach((btn) => {
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

/* The catalogue carries the library's chosen UI language, so a new install
   opens in the language the librarian set rather than defaulting to Urdu. */
function applySyncedLang() {
  const want = DATA.appSettings && DATA.appSettings.lang;
  if (want && want !== LANG) setLang(want);
}

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

async function openReader(book, filePath, preset) {
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
  readerHits = [];
  readerAt = 0;
  readerPage = 0;
  readerIndex = null;
  readerPages = paginate(readerText);
  readerToc = buildToc(readerText, readerPages);
  renderRdToc();
  if (preset) runReaderSearch(); else { paintReader(); renderRdResults(); }
  setTimeout(() => $("rdQuery").focus(), 60);
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

  box.innerHTML = `<div class="rd-para">${html}</div>`;
  $("rdPageNo").textContent = ud(readerPage + 1);
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

function runReaderSearch() {
  const q = $("rdQuery").value;
  if (q.trim()) {
    // one index per open book, reused by every search in it
    if (!readerIndex) readerIndex = prepareIndex(readerText, null);
    readerHits = findInTextOpts(readerText, q, null, readerIndex);
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
   the uploaded Qur'an. Building a row for every one costs both the build and
   every later scroll, so the list shows the first slice and says so; the
   count beside the search box still reports the true total. */
const RD_MAX_ROWS = 300;

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
  body.innerHTML = readerHits.slice(0, RD_MAX_ROWS).map((h, i) => {
    const before = escapeHtml(readerText.slice(Math.max(0, h.start - RD_CONTEXT), h.start));
    const word = escapeHtml(readerText.slice(h.start, h.end));
    const after = escapeHtml(readerText.slice(h.end, h.end + RD_CONTEXT));
    return `<tr class="rd-result${i === readerAt ? " on" : ""}" data-i="${i}">
              <td class="rc-n">${ud(i + 1)}</td>
              <td class="rc-book">${bookName}</td>
              <td class="rc-text">…${before}<mark>${word}</mark>${after}…</td>
              <td class="rc-chap">${escapeHtml(chapterOfOffset(h.start))}</td>
              <td class="rc-page">${ud(pageOfOffset(h.start) + 1)}</td>
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
const ftsCache = new Map();     // path -> text, for this session only
let ftsBusy = false;

const ftsTerms = () =>
  ["fts1", "fts2", "fts3", "fts4"].map((id) => $(id).value.trim()).filter(Boolean);

async function ftsTextOf(path) {
  if (ftsCache.has(path)) return ftsCache.get(path);
  let text = "";
  try {
    const res = await window.maktaba.readText(path);
    if (res && res.ok) text = res.text || "";
  } catch { /* an unreadable attachment must not abort the whole search */ }
  ftsCache.set(path, text);
  return text;
}

async function runFullTextSearch() {
  if (ftsBusy) return;
  const terms = ftsTerms();
  if (!terms.length) { $("fts1").focus(); return; }

  const opts = { diacritics: $("ftsHarakat").checked, hamza: $("ftsHamza").checked };
  const anyOf = $("ftsAny").checked;
  const exclude = $("ftsNot").value.trim();

  const targets = DATA.books.filter((b) => b.format === "unicode" && (b.files || []).length);
  $("ftsResults").innerHTML = "";
  if (!targets.length) { $("ftsStatus").textContent = t("ftsNoTexts"); return; }

  ftsBusy = true;
  $("ftsRun").disabled = true;
  const found = [];
  let done = 0;
  for (const b of targets) {
    $("ftsStatus").textContent = t("ftsScanning")
      .replace("{i}", ud(++done)).replace("{n}", ud(targets.length));
    for (const path of b.files) {
      const text = await ftsTextOf(path);
      if (!text) continue;
      /* Normalize the book ONCE and reuse it for every term: on the 754k-character
         Qur'an that is ~330 ms instead of ~330 ms per term. */
      const idx = prepareIndex(text, opts);
      // ليس — a book containing the excluded word drops out whatever else matched
      if (exclude && findInTextOpts(text, exclude, opts, idx).length) continue;
      const perTerm = terms.map((q) => findInTextOpts(text, q, opts, idx));
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
  renderFtsResults(found);
}

function renderFtsResults(found) {
  const box = $("ftsResults");
  box.innerHTML = "";
  $("ftsStatus").textContent = found.length
    ? t("ftsFound").replace("{n}", ud(found.length))
    : t("ftsNoHits");

  for (const r of found) {
    const row = document.createElement("div");
    row.className = "fts-hit";
    row.innerHTML = `<span class="fh-title">${r.book.title || ""}</span>
                     <span class="fh-count">${ud(r.total)}</span>`;
    row.title = baseName(r.path);
    // Opening straight at the word is the point — a result you still have to
    // go hunting for inside a long book is not a search result.
    row.onclick = () => openReader(r.book, r.path, r.term);
    box.appendChild(row);
  }
}

$("railFts").onclick = () => setFtsOpen(!ftsOpen);
$("ftsHide").onclick = () => setFtsOpen(false);
$("ftsRun").onclick = runFullTextSearch;
$("ftsClear").onclick = () => {
  for (const id of ["fts1", "fts2", "fts3", "fts4", "ftsNot"]) $(id).value = "";
  $("ftsResults").innerHTML = "";
  $("ftsStatus").textContent = "";
  $("fts1").focus();
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
          <div class="dupe-title">${g[0].title} — ${g[0].author || t("noAuthor")}</div>
          ${g.map((b) => `<div class="dupe-row">${t("fAccession")} <b>${ud(b.accession || "—")}</b> · ${t("st_" + b.status)}${b.maktaba ? " · " + b.maktaba : ""}</div>`).join("")}
        </div>`).join("")
    : `<div class="hint">${t("noDuplicates")}</div>`;
  $("dlgDupes").showModal();
}

/* ── What's New ──────────────────────────────────────────────────────── */

async function showWhatsNew() {
  const res = await window.maktaba.whatsNew();
  const body = $("whatsNewBody");
  const lang = LANG === "ar" ? "ar" : "en";   // release notes are authored in English and Arabic
  const rel = res.data && res.data.releases;
  body.innerHTML = rel && rel.length
    ? rel.map((r) => `
        <div class="wn-rel">
          <div class="wn-ver">v${r.version}<span class="wn-date">${r.date || ""}</span></div>
          <ul class="wn-list">${(r[lang] || r.en || []).map((li) => `<li>${li}</li>`).join("")}</ul>
        </div>`).join("")
    : `<div class="hint">${t("noWhatsNew")}</div>`;
  $("dlgWhatsNew").showModal();
}

/* ── Language switch ─────────────────────────────────────────────────── */

const LANG_CYCLE = ["ur", "ar", "en"];
$("btnLang").onclick = () => {
  const next = LANG_CYCLE[(LANG_CYCLE.indexOf(LANG) + 1) % LANG_CYCLE.length];
  setLang(next);
  // The librarian's choice becomes the library default and travels with the sync.
  if (!DATA.appSettings) DATA.appSettings = {};
  DATA.appSettings.lang = next;
  persist();
};

$("catAdd").onclick = addCategory;
$("catNew").addEventListener("keydown", (e) => { if (e.key === "Enter") addCategory(); });
$("aboutWhatsNew").onclick = () => { $("dlgAbout").close(); showWhatsNew(); };

boot();
