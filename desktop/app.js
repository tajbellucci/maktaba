let DATA = { library: "", updated: "", books: [] };
let nextId = 1;
let mode = "category";     // rail: category | author | status | shelf
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
  if (b.borrowDays === undefined) b.borrowDays = null;
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
    authLockStatus: async () => ({ held: false }),
    downloadFile: async () => ({ ok: false, error: "preview" }),
    filesDir: async () => "",
    searchCoverOnline: async () => ({ ok: true }),
    publish: async () => ({ ok: false, error: "preview" }),
    pickFile: async () => [],
    pickImage: async () => null,
    openFile: async () => {},
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
  if (assignAccessions()) persist();
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
  refreshMasterUI();
}

/* Publish only means anything if this machine can actually write — a reader
   install with no token/login just gets an error from clicking it. Hide it
   for anyone who isn't currently master, on whichever gate applies. */
async function refreshMasterUI() {
  const s = await window.maktaba.getSettings();
  const supabaseConfigured = Boolean(s.supabaseUrl && s.supabaseAnonKey);
  let isMaster;
  if (supabaseConfigured) {
    const auth = await window.maktaba.authStatus();
    isMaster = auth.loggedIn;
  } else {
    isMaster = Boolean(s.isLibrarian);
  }
  $("tbPublish").classList.toggle("hidden", !isMaster);
  const menuPublish = document.querySelector('[data-act="publish"]');
  if (menuPublish) menuPublish.classList.toggle("hidden", !isMaster);
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
  DATA.updated = await window.maktaba.save(DATA);
  renderStatus();
}

/* ── Grouping ─────────────────────────────────────────────────────────── */

const FLAT_MODES = ["books", "favorites", "recent"];
const isFlat = () => FLAT_MODES.includes(mode);

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
    if (filter === "overdue") { if (!isOverdue(b)) return false; }
    else if (filter !== "all" && b.status !== filter) return false;
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
      persist();
      renderBooks();
      renderDetail();
      openBook();          // picker closes, the book takes the window
    };
    row.onmouseenter = () => showCard(b, row);
    row.onmouseleave = scheduleHideCard;
    list.appendChild(row);
  }

  list.querySelectorAll("[data-star]").forEach((el) => {
    el.onclick = (ev) => {
      ev.stopPropagation();   // starring must not also select the row
      const bk = DATA.books.find((x) => x.id === +el.dataset.star);
      bk.favorite = !bk.favorite;
      persist();
      renderBooks();
    };
  });

  $("listCount").textContent = `${ud(books.length)} / ${ud(DATA.books.length)} ${t("tabAll")}`;
  const none = selectedId === null;
  $("tbDelete").disabled = none;
  $("footDel").disabled = none;
}

function renderDetail() {
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
  $("dFormat").onchange = () => {
    b.format = $("dFormat").value;
    if (b.format === "physical") b.files = [];
    persist();
    renderFileRow(b);
    renderBooks();
  };

  renderTracking(b);
}

/* The tracking panel is the heart of a physical catalogue: where is this
   copy right now, who has it, and when is it due back. */
function renderTracking(b) {
  const box = $("tracking");
  if (!box) return;

  const hist = b.history.length
    ? `<div class="hist">${b.history.slice(0, 6).map((h) =>
        `<div class="hist-row"><span class="hist-date">${h.date}</span><span>${t("ev_" + h.action) || h.action}${h.detail ? " — " + h.detail : ""}</span></div>`
      ).join("")}</div>`
    : "";

  box.innerHTML = `
    <div class="track-head">${t("trackingHead")}</div>
    <div class="statusrow">
      ${STATUSES.map((s) => `<button data-st="${s}" class="${b.status === s ? "on-" + s : ""}">${t("st_" + s)}</button>`).join("")}
    </div>
    ${b.status === "issued" ? `
      <label>${t("fBorrower")}</label><input id="dBorrower" />
      <label>${t("fBorrowerContact")}</label><input id="dBorrowerContact" data-t-ph="borrowerContactPh" />
      <label>${t("fIssueDate")}</label><input id="dIssueDate" type="date" />
      <label>${t("fDueDate")}</label><input id="dDueDate" type="date" />
      <div class="hint" id="durationLine"></div>
      <button class="wide-btn" id="btnReturn"><svg><use href="#i-check"/></svg><span>${t("markReturned")}</span></button>
    ` : `
      <button class="wide-btn" id="btnIssue" ${b.status === "missing" ? "disabled" : ""}>
        <svg><use href="#i-upload"/></svg><span>${t("issueBook")}</span>
      </button>`}
    ${hist}`;

  box.querySelectorAll("[data-st]").forEach((btn) => {
    btn.onclick = () => setStatus(b, btn.dataset.st);
  });

  if (b.status === "issued") {
    $("dBorrower").value = b.borrower || "";
    $("dBorrowerContact").value = b.borrowerContact || "";
    $("dIssueDate").value = b.issueDate || "";
    $("dDueDate").value = b.dueDate || "";
    renderDurationLine(b);
    const bindT = (id, field, onDateChange) => {
      $(id).onchange = () => {
        b[field] = $(id).value.trim();
        if (onDateChange) renderDurationLine(b);
        persist();
        renderBooks();
      };
    };
    bindT("dBorrower", "borrower");
    bindT("dBorrowerContact", "borrowerContact");
    bindT("dIssueDate", "issueDate", true);
    bindT("dDueDate", "dueDate", true);
    $("btnReturn").onclick = () => setStatus(b, "available");
  } else {
    const iss = $("btnIssue");
    if (iss) iss.onclick = () => openIssueDialog(b);
  }
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
function openIssueDialog(b) {
  $("iBook").textContent = `${b.title} — ${t("fAccession")} ${ud(b.accession || "")}`;
  $("iBorrower").value = "";
  $("iContact").value = "";
  $("iDays").value = 14;
  const recalc = () => {
    const days = parseInt($("iDays").value, 10) || 0;
    const due = new Date();
    due.setDate(due.getDate() + days);
    $("iDue").value = due.toISOString().slice(0, 10);
  };
  recalc();
  $("iDays").oninput = recalc;
  $("dlgIssue").returnValue = "";
  $("dlgIssue").showModal();
  setTimeout(() => $("iBorrower").focus(), 50);

  $("iSave").onclick = () => {
    const who = $("iBorrower").value.trim();
    if (!who) { $("iBorrower").focus(); return; }
    b.borrower = who;
    b.borrowerContact = $("iContact").value.trim();
    b.issueDate = todayISO();
    b.dueDate = $("iDue").value || b.dueDate;
    b.borrowDays = parseInt($("iDays").value, 10) || null;
    b.status = "issued";
    b.present = true;
    logHistory(b, "issued", who);
    persist();
    $("dlgIssue").close();
    renderGroups();
    renderBooks();
    renderTracking(b);
    toast(t("issuedTo") + " " + who);
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
    ? `<div class="iss-table">
        <div class="iss-head">
          <span>${t("fAccession")}</span><span>${t("colBook")}</span>
          <span>${t("fBorrower")}</span><span>${t("fDueDate")}</span>
        </div>
        ${issued.map((b) => `
          <div class="iss-row${isOverdue(b) ? " late" : ""}">
            <span>${ud(b.accession || "")}</span>
            <span>${b.title}</span>
            <span>${b.borrower || "—"}</span>
            <span>${b.dueDate || "—"}${isOverdue(b) ? ` · ${t("overdue")}` : ""}</span>
          </div>`).join("")}
      </div>`
    : `<div class="hint">${t("noneIssued")}</div>`;
  $("dlgIssued").showModal();
}

function setStatus(b, next) {
  if (b.status === next) return;
  if (next === "issued") {
    b.issueDate = todayISO();
    const due = new Date();
    due.setDate(due.getDate() + 14);          // 14-day loan, the usual madrassa period
    b.dueDate = due.toISOString().slice(0, 10);
    logHistory(b, "issued", b.borrower);
  } else if (b.status === "issued" && next === "available") {
    logHistory(b, "returned", b.borrower);
    b.borrower = "";
    b.issueDate = "";
    b.dueDate = "";
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
    const line = (label, value) => value
      ? `<div class="bc-line"><span class="bc-k">${label}</span><span class="bc-v">${value}</span></div>`
      : "";

    /* DOM order matches the reading direction: the first child sits at the
       inline-start edge, which is the RIGHT in RTL — so the text block goes
       first (right, as in Urdu/Arabic reading order) and the image last
       (left), reproducing the reference layout exactly. This also mirrors
       correctly in English without any extra rule. */
    card.innerHTML = `
      <div class="bc-right">
        <div class="bc-title">${b.title}</div>
        <div class="bc-status st-${b.status}">${t("st_" + b.status)}${isOverdue(b) ? " · " + t("overdue") : ""}</div>
        <div class="bc-body">
          ${line(t("fAccession"), ud(b.accession || ""))}
          ${line(t("fCategory"), b.category)}
          ${line(t("fAuthor"), b.author)}
          ${line(t("fPublisher"), b.publisher)}
          ${line(t("fVolumes"), b.volumes ? ud(b.volumes) : "")}
          ${line(t("fMaktaba"), b.maktaba)}
          ${line(t("fDepartment"), b.department)}
          ${line(t("fBorrower"), b.borrower)}
          ${line(t("fDueDate"), b.dueDate)}
          ${line(t("fFormat"), b.format === "physical" ? t("fmtPhysical") : b.format === "pdf" ? t("fmtPdf") : t("fmtUnicode"))}
          ${(b.files || []).length ? line(t("attachedFiles"), ud(b.files.length)) : ""}
          ${line(t("fNotes"), b.notes)}
        </div>
      </div>
      ${src ? `<img class="bc-img" src="${src}" alt="" />` : `<div class="bc-noimg"><svg><use href="#i-book"/></svg></div>`}`;

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
  row.querySelectorAll("[data-drop]").forEach((btn) => {
    btn.onclick = () => {
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

/* Keep the picker inside the window chrome: never over the toolbar, never
   over the status bar, whatever the chosen text size does to their height.
   When maximised it also spans the full width, same top/bottom limits. */
function fitPicker() {
  const dlg = $("dlgCatalog");
  if (!dlg.open) return;
  const bar = document.querySelector(".toolbar");
  const status = document.querySelector(".statusbar");
  const top = bar ? bar.getBoundingClientRect().bottom + 10 : 120;
  const bottom = status ? status.getBoundingClientRect().height + 10 : 34;
  dlg.style.top = top + "px";
  dlg.style.height = Math.max(320, window.innerHeight - top - bottom) + "px";
  if (dlg.classList.contains("max")) {
    dlg.style.width = "calc(100vw - 20px)";
  } else {
    dlg.style.width = "";
  }
}
window.addEventListener("resize", fitPicker);

function togglePickerMax() {
  const dlg = $("dlgCatalog");
  const now = dlg.classList.toggle("max");
  fitPicker();
  $("pickerMax").querySelector("use").setAttribute("href", now ? "#i-restore" : "#i-max");
}
$("pickerMax").onclick = togglePickerMax;
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

function openAddOne() {
  for (const id of ["oTitle", "oAuthor", "oPublisher", "oCategory", "oDepartment", "oShelf", "oNotes"]) $(id).value = "";
  $("oVolumes").value = 1;
  fillMaktabaSelect($("oMaktaba"), mode === "shelf" && group ? group : "");
  updateDeptList($("oMaktaba").value);
  if (mode === "category" && group) $("oCategory").value = group;
  const next = DATA.books.reduce((m, x) => Math.max(m, parseInt(x.accession, 10) || 0), 0) + 1;
  $("oAccHint").textContent = `${t("fAccession")}: ${ud(next)} — ${t("accessionAuto")}`;
  $("dlgOne").showModal();
}
$("oMaktaba").onchange = () => updateDeptList($("oMaktaba").value);

$("oSave").onclick = () => {
  const title = $("oTitle").value.trim();
  if (!title) { $("oTitle").focus(); return; }
  const b = {
    id: nextId++,
    title,
    author: $("oAuthor").value.trim(),
    publisher: $("oPublisher").value.trim(),
    category: $("oCategory").value.trim(),
    volumes: parseInt($("oVolumes").value, 10) || 0,
    maktaba: $("oMaktaba").value,
    department: $("oDepartment").value.trim(),
    almari: $("oShelf").value.trim(),
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

async function doPull() {
  const res = await window.maktaba.pullLatest();
  if (res.ok) {
    DATA = res.data;
    DATA.books.forEach(normalizeBook);
    nextId = 1 + DATA.books.reduce((m, b) => Math.max(m, b.id || 0), 0);
    renderAll();
    toast(t("pulled"));
  } else {
    toast(t("pullFail") + res.error);
  }
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
        refreshMasterUI();
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
    refreshMasterUI();
  };
});

async function doPublish() {
  const btn = $("tbPublish");
  btn.disabled = true;
  btn.innerHTML = `<svg><use href="#i-upload"/></svg><span>${t("publishing")}</span>`;
  const res = await window.maktaba.publish(DATA);
  btn.disabled = false;
  btn.innerHTML = `<svg><use href="#i-upload"/></svg><span>${t("publishBtn")}</span>`;
  if (res.ok) toast(t("published"));
  else alert(t("publishFail") + res.error);
}

$("tbExport").onclick = doExport;
$("tbPull").onclick = doPull;
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

function theme() {
  if (!DATA.theme) DATA.theme = {};
  const th = DATA.theme;
  if (!th.accent)  th.accent  = "blue";
  if (!th.mode)    th.mode    = "light";
  if (!th.size)    th.size    = "normal";   // small | normal | large
  if (!th.font)    th.font    = "nastaliq"; // nastaliq | naskh (book titles)
  if (!th.density) th.density = "comfortable";
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
  root.setAttribute("data-density", th.density);
}

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
      persist();
    };
  });
  const bindGroup = (attr, key) => {
    document.querySelectorAll("[" + attr + "]").forEach((btn) => {
      btn.classList.toggle("on", btn.getAttribute(attr) === th[key]);
      btn.onclick = () => {
        theme()[key] = btn.getAttribute(attr);
        applyTheme();
        renderThemeControls();
        persist();
      };
    });
  };
  bindGroup("data-mode-theme", "mode");
  bindGroup("data-size-theme", "size");
  bindGroup("data-font-theme", "font");
  bindGroup("data-density-theme", "density");
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
