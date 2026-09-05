const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const REPO = require("./shared/repo");
const https = require("https");
const crypto = require("crypto");

const dataFile = () => path.join(app.getPath("userData"), "books.json");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const deviceFile = () => path.join(app.getPath("userData"), "device.json");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/* Atomic write. Writing straight onto the real file truncates it first, so a
   crash or power cut in that window leaves the catalogue half-written — and
   because every edit autosaves, that window was being entered on every click.
   Writing to a temporary file, forcing it to disk, then renaming over the
   original means the file on disk is always either the complete old version
   or the complete new one, never a broken half. */
function writeJson(file, data) {
  const tmp = file + ".tmp";
  const text = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, text, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);   // atomic within the same volume
}

/* Rolling local snapshots of the catalogue. These protect against the kind of
   loss a backup actually prevents: a bad pull, a mass delete, an edit nobody
   meant to make. They do NOT protect against the machine dying — that is what
   publishing to GitHub is for. Both matter, for different reasons. */
const backupsDir = () => {
  const dir = path.join(app.getPath("userData"), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const KEEP_BACKUPS = 15;

function snapshotCatalogue(tag) {
  try {
    if (!fs.existsSync(dataFile())) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    fs.copyFileSync(dataFile(), path.join(backupsDir(), `books-${stamp}-${tag}.json`));
    const old = fs.readdirSync(backupsDir())
      .filter((f) => f.startsWith("books-") && f.endsWith(".json"))
      .sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
      try { fs.unlinkSync(path.join(backupsDir(), f)); } catch { /* already gone */ }
    }
  } catch { /* a snapshot failing must never stop the app working */ }
}

/* What "unpublished" means: the fingerprint of the catalogue as it was when
   it last reached GitHub. Anything different is work only this machine has. */
const publishStateFile = () => path.join(app.getPath("userData"), "publish-state.json");

/* A borrower's name and phone number are personal data about a real person,
   not library metadata — the repository they would travel to is public, so
   this is the difference between "readable by the madrassa" and "readable by
   anyone on the internet". They stay on the machine that recorded them.
   Where the book physically is stays visible everywhere: status, due date,
   and — because nobody's privacy is at stake — which department holds it. */
function redactForPublish(d) {
  if (REPO.publishBorrowerDetails) return d;   // nothing stripped; see shared/repo.js

  const clone = JSON.parse(JSON.stringify(d));
  for (const b of clone.books || []) {
    if (b.issueType === "person" && b.status === "issued") {
      b.borrower = "";
      b.borrowerContact = "";
      b.borrowerAddress = "";
      b.borrowerPhone = "";
    }
    /* The loan history records WHO a book went to, so stripping the live
       borrower field alone left every past borrower's name published in the
       history — up to forty per book. Personal entries keep the event and the
       date and lose the name; department transfers keep theirs, since a
       department is not a person. */
    if (Array.isArray(b.history)) {
      for (const h of b.history) {
        if (h.action === "issued" || h.action === "returned") h.detail = "";
      }
    }
  }
  return clone;
}

/* Fields normalizeBook() in the renderer restores to an UNCONDITIONAL constant
   on every load, so storing them is pure waste — the value is rebuilt anyway.
   Deliberately excluded, each for a specific reason:
     hasPrint, almari, borrowerAddress, files, status, present
       — their default is conditional (derived from another field), so a
         stripped value would come back different from what was saved.
     issueType, hasPrint, borrowerAddress, borrowerPhone
       — normalizeBook sets didMigrate when these are absent, which forces a
         full save. Stripping them would trigger a whole-catalogue write on
         every single launch: the exact opposite of the point of this.
     notes, volumes
       — normalizeBook never restores them at all.
   Anything not on this list is left exactly as it is. */
const LEAN_DEFAULTS = {
  maktaba: "", department: "", publisher: "", image: "", format: "physical",
  borrower: "", issueDate: "", dueDate: "", favorite: false, viewedAt: "",
  material: "book", borrowerContact: "", borrowDays: null,
  toDepartment: "", toAlmari: ""
};

function leanBook(b) {
  const out = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "history" && Array.isArray(v) && v.length === 0) continue;
    if (k in LEAN_DEFAULTS && v === LEAN_DEFAULTS[k]) continue;
    out[k] = v;
  }
  return out;
}

function leanCatalogue(d) {
  return { ...d, books: (d.books || []).map(leanBook) };
}

/* "Last opened" is a note about THIS computer, not about the library — it
   drives the picker's recently-opened tab and nothing else. Keeping it out of
   the fingerprint and out of what gets published fixes two real problems:
   simply opening a book to read it used to mark the whole catalogue as having
   unpublished changes (yellow dot, and a "publish before closing?" prompt on
   the way out, for work nobody did), and publishing it meant every machine
   overwrote everyone else's recently-opened list on the next sync.
   It is still stored locally, so the tab keeps working per machine. */
function withoutLocalOnly(d) {
  return {
    ...d,
    books: (d.books || []).map((b) => {
      const { viewedAt, ...rest } = b;
      return rest;
    })
  };
}

/* The catalogue is the one file written on every edit and shipped on every
   sync, so it is stored lean and unindented. normalizeBook() in the renderer
   rebuilds every stripped field on load, so nothing is lost and older files
   still open unchanged.
   Only this file. Settings, device id and publish-state stay pretty-printed —
   they are tiny, and being readable matters more than being small when
   something needs diagnosing by hand. Backups and exports likewise stay in
   full form, since their whole purpose is being readable later. */
function writeCatalogue(file, data) {
  const tmp = file + ".tmp";
  const text = JSON.stringify(leanCatalogue(data));
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, text, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/* Hashes the CANONICAL (lean) form, so the same catalogue fingerprints
   identically whether it arrived full or already stripped. Four callers
   compare across three different shapes — the remote copy, the file on disk,
   and the in-memory publish payload — and without this canonicalisation a
   lean file would never match a full one: readers would rewrite their disk on
   every launch and the master would show a permanent false "unpublished". */
function catalogueHash(d) {
  const lean = leanCatalogue(withoutLocalOnly(d));
  return crypto.createHash("sha1").update(JSON.stringify({
    books: lean.books,
    categories: d.categories || [],
    theme: d.theme || {},
    appSettings: d.appSettings || {}
  })).digest("hex");
}

/* The fingerprint algorithm changed when hashing moved to the canonical lean
   form. A machine that published under the old one has a stored hash that can
   never match the new one, so without this it would show "unpublished
   changes" forever — and the close guard would ask to publish on every exit,
   for work that was already published. Recognise a stored OLD-format hash of
   unchanged data and quietly upgrade it in place. One-time, per machine. */
function legacyCatalogueHash(d) {
  return crypto.createHash("sha1").update(JSON.stringify({
    books: d.books || [],
    categories: d.categories || [],
    theme: d.theme || {},
    appSettings: d.appSettings || {}
  })).digest("hex");
}

function hasUnpublished() {
  try {
    const local = readJson(dataFile(), null);
    if (!local) return false;
    const st = readJson(publishStateFile(), null);
    if (!st || !st.hash) return true;          // never published from here
    // Compare like with like: the server never held borrower details, so the
    // local fingerprint has to be taken after the same redaction or every
    // machine with an active loan would show a permanent false "unpublished".
    const redacted = redactForPublish(local);
    const current = catalogueHash(redacted);
    if (current === st.hash) return false;

    if (legacyCatalogueHash(redacted) === st.hash) {
      writeJson(publishStateFile(), { ...st, hash: current });
      return false;                            // same data, older fingerprint
    }
    return true;
  } catch {
    return false;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* A stable random id for this install, generated once and kept forever —
   this is what the master lock compares against, not a hostname or IP
   (both change or repeat across machines). */
function deviceId() {
  const existing = readJson(deviceFile(), null);
  if (existing && existing.id) return existing.id;
  const id = crypto.randomUUID();
  writeJson(deviceFile(), { id });
  return id;
}

/* Minimal REST client for Supabase — plain https, matching how GitHub is
   already called elsewhere in this file, so no new npm dependency is
   needed just to talk to two endpoints (Auth token, and a few RPC calls). */
function supabaseRequest(cfg, methodPath, method, body, extraHeaders) {
  return new Promise((resolve) => {
    if (!cfg.url || !cfg.anonKey) return resolve({ ok: false, error: "Supabase not configured" });
    let target;
    try { target = new URL(cfg.url.replace(/\/$/, "") + methodPath); }
    catch { return resolve({ ok: false, error: "Invalid Supabase URL" }); }

    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(target, {
      method,
      timeout: 10000,
      headers: {
        apikey: cfg.anonKey,
        Authorization: "Bearer " + (extraHeaders && extraHeaders.accessToken || cfg.anonKey),
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-JSON error body */ }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data: parsed });
        } else {
          resolve({ ok: false, error: (parsed && (parsed.error_description || parsed.message || parsed.error)) || `HTTP ${res.statusCode}` });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "Timed out" }); });
    req.on("error", (err) => resolve({ ok: false, error: String(err.message || err) }));
    if (payload) req.write(payload);
    req.end();
  });
}

/* Fetch books.json straight from GitHub's raw content host. No auth needed —
   this is what makes every fresh install able to pull the real catalog
   without anyone creating an account or a token. 6s timeout so a slow or
   absent connection never blocks the app opening. */
function getJson(url, headers) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 6000, headers }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/* raw.githubusercontent.com caches by PATH ONLY — a unique query string does
   NOT bust it (confirmed live: X-Cache: HIT even with a fresh random query on
   every request). Without authentication there is no way to force it fresh,
   so a reader pressing "get updates" within 5 minutes of a publish could be
   told they are already up to date while looking at the old file.
   api.github.com's unauthenticated contents endpoint caches only 60 seconds
   and needs no token, so it is tried first; the raw host is the fallback if
   that is unavailable (network blocks the API, or the public rate limit —
   60 requests/hour per IP, shared by every reader behind the same router —
   is exhausted), which only brings back the pre-existing 5-minute staleness,
   never a hard failure. */
/* The unauthenticated api.github.com read is cacheable for 60s by a SHARED
   cache (Cache-Control: public) — proven live, not assumed: warmed that cache
   with a read, published a real edit, and the very next unauthenticated read
   still served the pre-edit content while an authenticated read of the exact
   same URL at the exact same moment was already correct. That 60s window is
   exactly what a librarian hits publishing then immediately pressing "get
   updates" to double-check their own edit — it looks like their change is
   about to be rolled back, when the write already succeeded.
   An authenticated read of the SAME endpoint comes back Cache-Control:
   private — not shared-cacheable — so it is never behind this window. The
   master machine always has its own token; use it whenever one is available
   so its OWN publishes are always immediately visible to its OWN reads.
   Readers with no token still fall back to the 60s-cached path, which is a
   real but much smaller version of the original 5-minute raw-host problem,
   and only affects someone else's edit reaching them, never their own. */
async function fetchRemoteJson(owner, repo, branch, file, token) {
  const headers = { "Accept": "application/vnd.github.raw", "User-Agent": "maktaba-desktop" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const viaApi = await getJson(`https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${branch}`, headers);
  if (viaApi) return viaApi;
  return await getJson(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`, {});
}

Menu.setApplicationMenu(null); // native chrome menu off — the app draws its own

let splash;

function createSplash() {
  splash = new BrowserWindow({
    width: 480,
    height: 340,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#0e2a1c",
    icon: path.join(__dirname, "build", "icon.png"),
    show: false,
    webPreferences: { contextIsolation: true }
  });
  splash.loadFile(path.join(__dirname, "renderer", "splash.html"));
  splash.once("ready-to-show", () => splash.show());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "مکتبہ نعمانیہ — Maktaba Naumania",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#eaeef3",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  /* Last line of defence against the "forgot to publish" case. The main
     process can answer this on its own by comparing the catalogue on disk
     with the fingerprint of what last reached GitHub, so it works even if the
     window is unresponsive. Closing is never silently destructive. */
  let closing = false;
  win.on("close", (e) => {
    if (closing) return;
    const s = readJson(settingsFile(), {});
    if (!s.isLibrarian || !s.token || !hasUnpublished()) return;

    e.preventDefault();
    dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["اب شائع کریں", "بغیر شائع کیے بند کریں", "منسوخ"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "غیر شائع شدہ تبدیلیاں",
      message: "کچھ تبدیلیاں ابھی GitHub پر شائع نہیں ہوئیں۔",
      detail: "اگر بغیر شائع کیے بند کیا تو یہ تبدیلیاں صرف اسی کمپیوٹر پر رہیں گی اور کسی دوسرے کمپیوٹر تک نہیں پہنچیں گی۔"
    }).then(async ({ response }) => {
      if (response === 2) return;                 // cancel — stay open
      if (response === 1) { closing = true; win.close(); return; }
      const data = readJson(dataFile(), null);
      if (data) {
        const res = await doPublish(data);
        if (!res.ok) {
          await dialog.showMessageBox(win, {
            type: "error", buttons: ["ٹھیک ہے"], noLink: true,
            title: "شائع نہیں ہو سکا",
            message: "شائع کرنے میں مسئلہ ہوا۔",
            detail: String(res.error || "") + "\n\nتبدیلیاں اسی کمپیوٹر پر محفوظ ہیں۔"
          });
        }
      }
      closing = true;
      win.close();
    });
  });

  win.once("ready-to-show", () => {
    win.show();
    if (splash && !splash.isDestroyed()) splash.destroy();
  });
}

app.whenReady().then(() => {
  snapshotCatalogue("launch");
  createSplash();
  // small floor so the mark is actually seen, not just flashed
  setTimeout(createWindow, 1700);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ── Local data ───────────────────────────────────────────────────────────
   Reader installs (default): every launch tries to pull the latest catalog
   from GitHub and adopts it silently. That is what makes "install it on a
   new PC and it already has the real book list" true.
   Librarian install: local edits are the master copy and are never
   overwritten by a background pull — only an explicit "Pull latest" does that,
   and only if there is nothing unpublished.
   Either way, if there is no connection the app opens on the last data it
   already has on disk. That is what makes it work fully offline. */

async function loadWithSync() {
  const settings = readJson(settingsFile(), {});
  const owner = settings.owner || REPO.owner;
  const repo = settings.repo || REPO.repo;
  const branch = settings.branch || REPO.branch;
  const isLibrarian = Boolean(settings.isLibrarian);

  const local = fs.existsSync(dataFile())
    ? readJson(dataFile(), null)
    : null;

  if (isLibrarian && local) return local;

  const remote = await fetchRemoteJson(owner, repo, branch, "books.json", settings.token);

  if (remote && (!local || !isLibrarian)) {
    /* Compare CONTENT, not the `updated` stamp. That stamp is a date with
       day granularity, so two publishes on the same day looked identical:
       the newer catalogue was returned to the window but never written to
       disk, and the machine silently reverted to the morning's copy the next
       time it opened offline. */
    if (!local || catalogueHash(remote) !== catalogueHash(local)) {
      writeCatalogue(dataFile(), remote);
    }
    return remote;
  }

  if (local) return local;

  const seed = readJson(path.join(__dirname, "seed", "books.json"), {
    library: "دار الافتاء مکتبہ — مدرسہ نعمانیہ",
    updated: today(),
    books: []
  });
  writeCatalogue(dataFile(), seed);
  return seed;
}

ipcMain.handle("books:load", () => loadWithSync());

ipcMain.handle("books:publishState", () => ({
  unpublished: hasUnpublished(),
  at: (readJson(publishStateFile(), {}) || {}).at || ""
}));

ipcMain.handle("books:pullLatest", async () => {
  const settings = readJson(settingsFile(), {});
  const owner = settings.owner || REPO.owner;
  const repo = settings.repo || REPO.repo;
  const branch = settings.branch || REPO.branch;
  const remote = await fetchRemoteJson(owner, repo, branch, "books.json", settings.token);
  if (!remote) return { ok: false, error: "انٹرنیٹ سے رابطہ نہیں ہو سکا" };
  writeCatalogue(dataFile(), remote);
  return { ok: true, data: remote };
});

/* Fetches what is currently on GitHub WITHOUT writing it to disk, so the
   window can show "here is exactly what will change" and let the user decide.
   Nothing about the local catalogue moves until they say yes. */
ipcMain.handle("books:peekRemote", async () => {
  const settings = readJson(settingsFile(), {});
  const remote = await fetchRemoteJson(
    settings.owner || REPO.owner,
    settings.repo || REPO.repo,
    settings.branch || REPO.branch,
    "books.json",
    settings.token
  );
  if (!remote) return { ok: false, error: "انٹرنیٹ سے رابطہ نہیں ہو سکا" };
  return { ok: true, data: remote };
});

/* Applies data the window already holds (the same object it just showed in
   the confirmation dialog) — avoids re-fetching and guarantees the user gets
   exactly what they approved. */
ipcMain.handle("books:applyData", (_e, data) => {
  snapshotCatalogue("before-pull");
  writeCatalogue(dataFile(), data);
  // Data pulled from GitHub is by definition identical to what is published.
  writeJson(publishStateFile(), { hash: catalogueHash(data), at: new Date().toISOString() });
  return { ok: true };
});

/* Autosave. Real edits land immediately; incidental state (last-viewed, the
   favourite star) is coalesced in the renderer and flushed through here. */
ipcMain.handle("books:save", (_e, data) => {
  data.updated = today();
  writeCatalogue(dataFile(), data);
  return data.updated;
});

/* Synchronous flush, used only on window close. The renderer may be holding a
   coalesced write when the window goes away, and an async round trip is not
   guaranteed to finish during teardown — a sync one is, and it cannot leave
   the close path waiting on a reply that never comes. */
ipcMain.on("books:saveSync", (e, data) => {
  try {
    data.updated = today();
    writeCatalogue(dataFile(), data);
    e.returnValue = data.updated;
  } catch {
    e.returnValue = null;
  }
});

ipcMain.handle("books:export", async (_e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "بیک اپ محفوظ کریں",
    defaultPath: `books-${today()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (canceled || !filePath) return null;
  writeJson(filePath, data);
  return filePath;
});

ipcMain.handle("books:dataPath", () => dataFile());

/* ── File attachments ────────────────────────────────────────────────────
   A book record can point at a PDF scan or a Unicode text file already on
   this machine. The path travels with the record; the file itself does not
   — it stays wherever the librarian put it (local folder or a mapped Drive
   path), same reasoning as keeping large binaries out of git entirely. */

/* A file picked straight off this PC's disk used to be stored as its raw
   Windows path (e.g. "C:\Books\book.txt"). That path means nothing on any
   other machine, and publish's own "does this need Releases?" check only
   ever recognised "userdata:files/…" — so a locally-picked attachment could
   never sync to another machine, full stop, no error, just silently local
   forever. A file attached FROM A URL already worked, because that path
   downloads into filesDir() and gets that exact prefix. This copies a
   locally-picked file into the same folder with the same prefix, so both
   ways of attaching a file end up equally publishable — one code path
   instead of two behaving differently. */
/* Cheap same-file check for the rename-on-collision logic above: same size
   is enough here, since a false "identical" only means "picking the exact
   file already attached does nothing" — the safe direction to be wrong in. */
function filesAreIdentical(a, b) {
  try { return fs.statSync(a).size === fs.statSync(b).size; } catch { return false; }
}

ipcMain.handle("file:pick", async (_e, format) => {
  const filters = format === "pdf"
    ? [{ name: "PDF", extensions: ["pdf"] }]
    : [{ name: "Text", extensions: ["txt", "md"] }];
  // multiSelections: one book can hold many scans (volume 1, volume 2, …)
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters,
    properties: ["openFile", "multiSelections"]
  });
  if (canceled || !filePaths.length) return [];

  return filePaths.map((src) => {
    // Keep the librarian's own filename \u2014 it is what they recognise the scan
    // by \u2014 and only disambiguate if two different files happen to share one.
    let name = path.basename(src);
    let dest = path.join(filesDir(), name);
    let n = 1;
    while (fs.existsSync(dest) && !filesAreIdentical(dest, src)) {
      const ext = path.extname(src);
      name = `${path.basename(src, ext)} (${++n})${ext}`;
      dest = path.join(filesDir(), name);
    }
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    return "userdata:files/" + name;
  });
});

ipcMain.handle("file:pickImage", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    properties: ["openFile"]
  });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

/* Files this app downloaded itself are stored as a short "userdata:xxx/name"
   reference, not a real path — resolve that back to disk before touching
   the filesystem. A locally-picked file is already a real path either way. */
function resolveStoredPath(p) {
  if (typeof p !== "string") return p;
  if (p.startsWith("userdata:covers/")) return path.join(coversDir(), p.slice("userdata:covers/".length));
  if (p.startsWith("userdata:files/")) return path.join(filesDir(), p.slice("userdata:files/".length));
  return p;
}

/* Reads an attached Unicode text file so it can be opened INSIDE the app and
   searched, rather than handed to Notepad. Only text — a scanned PDF is
   images and needs OCR, which remains out of scope and is priced separately.
   The size cap keeps a mis-attached 500MB file from freezing the window; real
   book texts are a fraction of it. */
const MAX_TEXT_BYTES = 12 * 1024 * 1024;

ipcMain.handle("file:readText", async (_e, filePath) => {
  try {
    const real = resolveStoredPath(filePath);

    // Attachments published to Releases are URLs by the time a reader sees them.
    if (/^https?:\/\//i.test(real)) {
      const text = await new Promise((resolve) => {
        const get = (url, hops) => {
          if (hops <= 0) return resolve(null);
          https.get(url, { timeout: 15000, headers: { "User-Agent": "maktaba-desktop" } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              res.resume(); return get(res.headers.location, hops - 1);
            }
            if (res.statusCode !== 200) { res.resume(); return resolve(null); }
            let body = "", size = 0;
            res.setEncoding("utf8");
            res.on("data", (c) => {
              size += Buffer.byteLength(c);
              if (size > MAX_TEXT_BYTES) { res.destroy(); return resolve(null); }
              body += c;
            });
            res.on("end", () => resolve(body));
          }).on("error", () => resolve(null));
        };
        get(real, 5);
      });
      return text === null
        ? { ok: false, error: "فائل حاصل نہیں ہو سکی" }
        : { ok: true, text, name: real.split("/").pop() };
    }

    if (!real || !fs.existsSync(real)) return { ok: false, error: "فائل نہیں ملی" };
    if (fs.statSync(real).size > MAX_TEXT_BYTES) return { ok: false, error: "فائل بہت بڑی ہے" };
    return { ok: true, text: fs.readFileSync(real, "utf8"), name: path.basename(real) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle("file:open", (_e, filePath) => {
  const real = resolveStoredPath(filePath);
  if (!real) return;
  /* A PDF published to Releases is an https:// URL by the time a reader sees
     it — fs.existsSync() on a URL is always false, so this silently did
     nothing. Hand it to the OS instead, which downloads/opens/views it with
     whatever the reader's PC already has for PDFs; no code here needs to know
     what that is. */
  if (/^https?:\/\//i.test(real)) { shell.openExternal(real); return; }
  if (fs.existsSync(real)) shell.openPath(real);
});

ipcMain.handle("file:exists", (_e, filePath) => {
  const real = resolveStoredPath(filePath);
  return Boolean(real) && fs.existsSync(real);
});

/* Cover images fetched from the web.
   The file is downloaded once into the app's own covers folder and the record
   stores a short relative name, so the picture keeps working offline and the
   catalogue stays small enough to sync. */
const coversDir = () => {
  const dir = path.join(app.getPath("userData"), "covers");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DOC_BYTES = 120 * 1024 * 1024;   // a scanned multi-volume PDF is legitimately large

/* Shared by cover-image and attached-file downloads. Most real hosts (CDNs,
   Google-hosted thumbnails, imgur, GitHub Release assets) answer the first
   request with a redirect, not the file — the earlier cover-only version
   gave up the moment it saw one, which was the actual bug behind "download
   doesn't work." This follows up to 5 hops before failing for real. */
function fetchBinaryFollowingRedirects(urlStr, opts, hopsLeft, resolve) {
  let target;
  try {
    target = new URL(urlStr);
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return resolve({ ok: false, error: "URL must start with http or https" });
    }
  } catch {
    return resolve({ ok: false, error: "Invalid URL" });
  }

  const client = target.protocol === "https:" ? https : require("http");
  const req = client.get(target, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0 (Maktaba Naumania)" }
  }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (hopsLeft <= 0) return resolve({ ok: false, error: "Too many redirects" });
      const next = new URL(res.headers.location, target).toString();
      return fetchBinaryFollowingRedirects(next, opts, hopsLeft - 1, resolve);
    }
    const type = String(res.headers["content-type"] || "").split(";")[0].trim();
    const okType = opts.allowedTypes.find((t) => type === t || type.startsWith(t));
    if (res.statusCode !== 200 || !okType) {
      res.resume();
      return resolve({ ok: false, error: `${opts.typeLabel} (HTTP ${res.statusCode}, ${type || "unknown type"})` });
    }
    const ext = opts.extFor(type, target.pathname);
    const name = `${opts.prefix}-${Date.now().toString(36)}${ext}`;
    const dest = path.join(opts.dir(), name);
    const chunks = [];
    let size = 0;
    res.on("data", (c) => {
      size += c.length;
      if (size > opts.maxBytes) {
        req.destroy();
        return resolve({ ok: false, error: `File is larger than ${Math.round(opts.maxBytes / 1024 / 1024)} MB` });
      }
      chunks.push(c);
    });
    res.on("end", () => {
      try {
        fs.writeFileSync(dest, Buffer.concat(chunks));
        resolve({ ok: true, path: opts.pathPrefix + name });
      } catch (err) {
        resolve({ ok: false, error: String(err.message || err) });
      }
    });
  });
  req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "Timed out" }); });
  req.on("error", (err) => resolve({ ok: false, error: String(err.message || err) }));
}

ipcMain.handle("file:downloadImage", (_e, url) => new Promise((resolve) => {
  fetchBinaryFollowingRedirects(url, {
    dir: coversDir,
    pathPrefix: "userdata:covers/",
    prefix: "cover",
    allowedTypes: ["image/"],
    typeLabel: "Not an image",
    maxBytes: MAX_IMAGE_BYTES,
    extFor: (type) => ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[type] || ".img")
  }, 5, resolve);
}));

ipcMain.handle("file:coversDir", () => coversDir());

/* Attached books files (PDF scans, plain-text transcriptions) fetched from a
   URL — same reasoning as covers: the file is downloaded once so it keeps
   working offline, and the record only carries a short local reference. */
const filesDir = () => {
  const dir = path.join(app.getPath("userData"), "files");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

ipcMain.handle("file:downloadFile", (_e, url, kind) => new Promise((resolve) => {
  const isPdf = kind === "pdf";
  fetchBinaryFollowingRedirects(url, {
    dir: filesDir,
    pathPrefix: "userdata:files/",
    prefix: isPdf ? "doc" : "text",
    allowedTypes: isPdf ? ["application/pdf"] : ["text/plain", "text/markdown", "application/octet-stream"],
    typeLabel: isPdf ? "Not a PDF" : "Not a text file",
    maxBytes: MAX_DOC_BYTES,
    extFor: (type, pathname) => {
      if (isPdf) return ".pdf";
      const fromPath = /\.(txt|md)$/i.exec(pathname);
      return fromPath ? fromPath[0] : ".txt";
    }
  }, 5, resolve);
}));

ipcMain.handle("file:filesDir", () => filesDir());

/* Opens a real Google Images search in the system browser rather than
   fetching and picking a result automatically. Cover art is the publisher's
   copyrighted design, not a fact like a title — auto-hotlinking whatever an
   image search returns risks putting unlicensed artwork into the client's
   catalogue with no one having looked at it. This keeps a human choosing. */
ipcMain.handle("file:searchCoverOnline", (_e, query) => {
  const url = "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(query);
  shell.openExternal(url);
  return { ok: true };
});

/* Update check: a tiny version.json in the repo is the whole mechanism.
   Nothing auto-installs — the app only tells the librarian a newer build
   exists, which is the honest behaviour for a hand-delivered installer. */
ipcMain.handle("app:checkUpdate", async () => {
  const s = readJson(settingsFile(), {});
  const remote = await fetchRemoteJson(s.owner || REPO.owner, s.repo || REPO.repo, s.branch || REPO.branch, "version.json");
  if (!remote || !remote.version) return { ok: false };
  const cmp = (a, b) => {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  };
  return {
    ok: true,
    current: app.getVersion(),
    latest: remote.version,
    newer: cmp(remote.version, app.getVersion()) > 0,
    url: remote.url || ""
  };
});

/* ── Version + What's New ────────────────────────────────────────────────
   whatsnew.json ships bundled so the About box always has something to show
   offline, and is re-fetched from the repo so a published release note
   reaches every install without shipping a new build. */

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("app:whatsNew", async () => {
  const local = readJson(path.join(__dirname, "seed", "whatsnew.json"), null);
  const s = readJson(settingsFile(), {});
  const owner = s.owner || REPO.owner;
  const repo = s.repo || REPO.repo;
  const branch = s.branch || REPO.branch;
  const remote = await fetchRemoteJson(owner, repo, branch, "whatsnew.json");
  const chosen = remote && Array.isArray(remote.releases) ? remote : local;
  return { data: chosen, current: app.getVersion(), fromRemote: Boolean(remote) };
});

/* ── Settings ─────────────────────────────────────────────────────────────
   The GitHub token is written here and never handed back to the renderer.
   The window only ever learns whether one exists. */

ipcMain.handle("settings:get", () => {
  const s = readJson(settingsFile(), {});
  return {
    owner: s.owner || REPO.owner,
    repo: s.repo || REPO.repo,
    branch: s.branch || REPO.branch,
    hasToken: Boolean(s.token),
    isLibrarian: Boolean(s.isLibrarian),
    hasLibrarianPin: Boolean(s.librarianPinHash),
    supabaseUrl: s.supabaseUrl || REPO.supabaseUrl,
    supabaseAnonKey: s.supabaseAnonKey || REPO.supabaseAnonKey
  };
});

ipcMain.handle("settings:set", (_e, next) => {
  const s = readJson(settingsFile(), {});
  s.owner = next.owner || s.owner;
  s.repo = next.repo || s.repo;
  s.branch = next.branch || s.branch;
  if (next.token) s.token = next.token;
  if (typeof next.isLibrarian === "boolean") s.isLibrarian = next.isLibrarian;
  if (typeof next.supabaseUrl === "string") s.supabaseUrl = next.supabaseUrl;
  if (typeof next.supabaseAnonKey === "string") s.supabaseAnonKey = next.supabaseAnonKey;
  writeJson(settingsFile(), s);
  return { ok: true };
});

/* Librarian/master mode is entered from a shared desk PC, so it is gated by
   a locally-set password — not real multi-user auth (there is no backend to
   authenticate against), just enough that a random person can't flip it on
   by clicking the checkbox. The password itself never leaves this file: a
   random salt plus a scrypt hash, never the plain text. */
const hashPin = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString("hex");

ipcMain.handle("settings:setLibrarianPin", (_e, pin) => {
  const s = readJson(settingsFile(), {});
  const salt = crypto.randomBytes(16).toString("hex");
  s.librarianPinSalt = salt;
  s.librarianPinHash = hashPin(pin, salt);
  writeJson(settingsFile(), s);
  return { ok: true };
});

ipcMain.handle("settings:checkLibrarianPin", (_e, pin) => {
  const s = readJson(settingsFile(), {});
  if (!s.librarianPinHash || !s.librarianPinSalt) return { ok: false, error: "no-pin-set" };
  const match = hashPin(pin, s.librarianPinSalt) === s.librarianPinHash;
  return { ok: match, error: match ? null : "wrong-pin" };
});

/* ── Master login (Supabase) ──────────────────────────────────────────────
   Stage 1: real login tied to a person, not a machine, plus a lock so only
   one device may hold master rights at a time. Stage 2 (moving the book
   catalogue itself onto this same backend, for live sync) is a separate,
   deliberately-later migration — this stage only decides WHO may write. */

let masterSession = null; // { accessToken } — the access token stays in memory

/* The refresh token IS written to disk, deliberately: without it the
   librarian re-types their password on every single launch, which in practice
   trains people to pick a weak password or leave the app open forever. It
   sits in the app's own userData folder beside the GitHub token, on the
   librarian's own machine, and logging out deletes it. */
const sessionFile = () => path.join(app.getPath("userData"), "session.json");

function supabaseCfg() {
  const s = readJson(settingsFile(), {});
  return { url: s.supabaseUrl || REPO.supabaseUrl, anonKey: s.supabaseAnonKey || REPO.supabaseAnonKey };
}

ipcMain.handle("auth:configured", () => {
  const cfg = supabaseCfg();
  return Boolean(cfg.url && cfg.anonKey);
});

ipcMain.handle("auth:deviceId", () => deviceId());

ipcMain.handle("auth:login", async (_e, email, password, label) => {
  const cfg = supabaseCfg();
  if (!cfg.url || !cfg.anonKey) return { ok: false, error: "Supabase is not set up yet — see Settings" };

  const authRes = await supabaseRequest(cfg, "/auth/v1/token?grant_type=password", "POST", { email, password });
  if (!authRes.ok) return { ok: false, error: authRes.error };
  const accessToken = authRes.data && authRes.data.access_token;
  if (!accessToken) return { ok: false, error: "No session returned" };

  const claim = await supabaseRequest(
    cfg, "/rest/v1/rpc/claim_master_lock", "POST",
    { p_device_id: deviceId(), p_label: label || require("os").hostname() },
    { accessToken }
  );
  if (!claim.ok) return { ok: false, error: claim.error };
  if (!claim.data || claim.data.ok !== true) {
    return { ok: false, error: "held", heldBy: claim.data && claim.data.label };
  }

  masterSession = { accessToken };
  const refreshToken = authRes.data && authRes.data.refresh_token;
  if (refreshToken) writeJson(sessionFile(), { refreshToken, email, label: label || "" });
  return { ok: true };
});

/* Called once at launch. Trades the saved refresh token for a fresh access
   token and re-claims the lock, so the usual case — same librarian, same
   machine, nobody else took over — needs no password at all. Any failure is
   silent and simply leaves the app in reader mode. */
ipcMain.handle("auth:restore", async () => {
  const saved = readJson(sessionFile(), null);
  if (!saved || !saved.refreshToken) return { ok: false };

  const cfg = supabaseCfg();
  if (!cfg.url || !cfg.anonKey) return { ok: false };

  const res = await supabaseRequest(
    cfg, "/auth/v1/token?grant_type=refresh_token", "POST",
    { refresh_token: saved.refreshToken }
  );
  if (!res.ok || !res.data || !res.data.access_token) {
    // Refresh token expired or was revoked — make them log in again.
    try { fs.unlinkSync(sessionFile()); } catch {}
    return { ok: false };
  }

  const accessToken = res.data.access_token;
  const claim = await supabaseRequest(
    cfg, "/rest/v1/rpc/claim_master_lock", "POST",
    { p_device_id: deviceId(), p_label: saved.label || require("os").hostname() },
    { accessToken }
  );
  if (!claim.ok || !claim.data || claim.data.ok !== true) {
    // Someone else legitimately holds master right now — stay a reader.
    return { ok: false, error: "held", heldBy: claim.data && claim.data.label };
  }

  masterSession = { accessToken };
  // Supabase rotates refresh tokens, so persist the new one or the next
  // launch would try to reuse a spent token and fail.
  if (res.data.refresh_token) {
    writeJson(sessionFile(), { ...saved, refreshToken: res.data.refresh_token });
  }
  return { ok: true };
});

ipcMain.handle("auth:heartbeat", async () => {
  if (!masterSession) return { ok: false };
  const cfg = supabaseCfg();
  const res = await supabaseRequest(
    cfg, "/rest/v1/rpc/heartbeat_master_lock", "POST",
    { p_device_id: deviceId() }, { accessToken: masterSession.accessToken }
  );
  return { ok: res.ok && res.data === true };
});

ipcMain.handle("auth:logout", async () => {
  // Logging out must also forget the saved session, or the next launch would
  // silently sign the same person back in.
  try { fs.unlinkSync(sessionFile()); } catch {}
  if (!masterSession) return { ok: true };
  const cfg = supabaseCfg();
  await supabaseRequest(
    cfg, "/rest/v1/rpc/release_master_lock", "POST",
    { p_device_id: deviceId() }, { accessToken: masterSession.accessToken }
  );
  masterSession = null;
  return { ok: true };
});

ipcMain.handle("auth:status", () => ({ loggedIn: Boolean(masterSession) }));

/* A machine that isn't master still wants to know who currently is, so the
   UI can say "Zainab's PC is currently master" instead of a bare rejection. */
ipcMain.handle("auth:lockStatus", async () => {
  const cfg = supabaseCfg();
  const res = await supabaseRequest(cfg, "/rest/v1/master_lock?select=holder_label,heartbeat_at&id=eq.1", "GET");
  if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return { held: false };
  const row = res.data[0];
  const staleAfterMs = 120000;
  const fresh = row.heartbeat_at && (Date.now() - new Date(row.heartbeat_at).getTime()) < staleAfterMs;
  return { held: Boolean(fresh && row.holder_label), label: row.holder_label };
});

/* ── Publish to GitHub ────────────────────────────────────────────────────
   Commits books.json to the repo. Every reader install picks it up on its
   next launch (or immediately, via Pull latest). */

/* Uploads one locally-downloaded cover to the repo (Contents API) and
   returns its permanent raw.githubusercontent.com URL. Skipped if the
   cover is already a remote URL (nothing to do) or already uploaded. */
/* Covers are shrunk on the way into the repository, never on the way out.
   Git keeps every version of every file for ever, so a 340 KB cover is 340 KB
   of permanent history even after it is replaced or deleted. At the size the
   app actually draws a cover, 600px wide is indistinguishable from the
   original and lands near 50 KB, which is the difference between a repo that
   stays healthy for a thousand books and one that does not.
   Uses Electron's own image decoder, so no new dependency. */
const COVER_MAX_WIDTH = 600;
const COVER_JPEG_QUALITY = 80;

function shrinkCover(buf) {
  try {
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { bytes: buf, jpeg: false };  // unreadable — ship the original
    const { width } = img.getSize();
    const scaled = width > COVER_MAX_WIDTH
      ? img.resize({ width: COVER_MAX_WIDTH, quality: "good" })
      : img;
    const out = scaled.toJPEG(COVER_JPEG_QUALITY);
    // Never let "optimising" make a file bigger than it started.
    return out && out.length && out.length < buf.length
      ? { bytes: out, jpeg: true }
      : { bytes: buf, jpeg: false };
  } catch {
    return { bytes: buf, jpeg: false };
  }
}

async function publishCover(owner, repo, branch, headers, localPath) {
  const original = fs.readFileSync(localPath);
  const { bytes, jpeg } = shrinkCover(original);

  // A PNG that came back as JPEG has to be named as one.
  let fileName = path.basename(localPath);
  if (jpeg) fileName = fileName.replace(/\.[^.]+$/, "") + ".jpg";

  const repoPath = `covers/${fileName}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;

  let sha;
  const head = await fetch(`${url}?ref=${branch}`, { headers });
  if (head.ok) sha = (await head.json()).sha;
  else if (head.status !== 404) throw new Error(`GitHub ${head.status}: ${await head.text()}`);

  const body = {
    message: `Add cover ${fileName}`,
    content: bytes.toString("base64"),
    branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${repoPath}`;
}

/* ── Attached files go to Releases, never into git ────────────────────────
   A scanned Urdu book is 20-100 MB. Committing those would put them in the
   repository's history permanently, where they cannot be reclaimed without
   rewriting the whole repo. Release assets sit beside the repo instead: 2 GB
   per file, replaceable, deletable, and served over plain https so the reader
   side needs no change — it already opens http(s) file URLs.
   Everything hangs off one release tag, created once on first use. */

const FILES_TAG = "library-files";

async function ensureRelease(owner, repo, headers) {
  const base = `https://api.github.com/repos/${owner}/${repo}/releases`;
  const found = await fetch(`${base}/tags/${FILES_TAG}`, { headers });
  if (found.ok) return await found.json();
  if (found.status !== 404) throw new Error(`GitHub ${found.status}: ${await found.text()}`);

  const made = await fetch(base, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: FILES_TAG,
      name: "Library files",
      body: "Scanned PDFs and text files attached to catalogue records. Managed by Maktaba Naumania.",
      draft: false,
      prerelease: false
    })
  });
  if (!made.ok) throw new Error(`GitHub ${made.status}: ${await made.text()}`);
  return await made.json();
}

async function publishAttachment(owner, repo, headers, release, localPath) {
  const fileName = path.basename(localPath);
  const bytes = fs.readFileSync(localPath);

  // An asset of the same name already there is replaced, not duplicated.
  const existing = (release.assets || []).find((a) => a.name === fileName);
  if (existing) {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`,
      { method: "DELETE", headers });
  }

  const type = fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
  const up = await fetch(
    `${release.upload_url.split("{")[0]}?name=${encodeURIComponent(fileName)}`,
    { method: "POST", headers: { ...headers, "Content-Type": type, "Content-Length": bytes.length }, body: bytes }
  );
  if (!up.ok) throw new Error(`GitHub ${up.status}: ${await up.text()}`);
  const asset = await up.json();
  return asset.browser_download_url;
}

/* Extracted so the close guard can publish too, not only the button. */
async function doPublish(data) {
  const s = readJson(settingsFile(), {});
  if (!s.token) return { ok: false, error: "GitHub ٹوکن سیٹ نہیں ہے" };

  /* Publishing overwrites the copy every machine reads, so it must confirm
     this machine still holds the write lock — not merely that it held it at
     login. A laptop that slept through its heartbeat can wake believing it is
     still master while another desk has legitimately taken over; without this
     check it would silently overwrite that desk's work. */
  const cfg = supabaseCfg();
  if (cfg.url && cfg.anonKey && masterSession) {
    const beat = await supabaseRequest(
      cfg, "/rest/v1/rpc/heartbeat_master_lock", "POST",
      { p_device_id: deviceId() }, { accessToken: masterSession.accessToken }
    );
    if (!(beat.ok && beat.data === true)) {
      return { ok: false, error: "اس کمپیوٹر کے پاس اب ماسٹر رائٹس نہیں ہیں — دوبارہ لاگ اِن کریں" };
    }
  }

  const owner = s.owner || REPO.owner;
  const repo = s.repo || REPO.repo;
  const branch = s.branch || REPO.branch;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/books.json`;
  const headers = {
    Authorization: `Bearer ${s.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "maktaba-desktop"
  };

  try {
    /* Locally-downloaded covers only exist on this machine's disk. Push
       each one to the repo first, then rewrite the JSON to point at the
       hosted URL, so other machines can actually see it after they sync. */
    for (const book of data.books) {
      if (typeof book.image === "string" && book.image.startsWith("userdata:covers/")) {
        const localPath = resolveStoredPath(book.image);
        if (fs.existsSync(localPath)) {
          book.image = await publishCover(owner, repo, branch, headers, localPath);
        }
      }
    }

    /* Attached PDFs and text files go up as release assets, and only if some
       book actually has one — no point creating a release for a catalogue
       that has no files attached yet. */
    const needsRelease = data.books.some((b) =>
      (b.files || []).some((f) => typeof f === "string" && f.startsWith("userdata:files/")));

    if (needsRelease) {
      const release = await ensureRelease(owner, repo, headers);
      for (const book of data.books) {
        if (!Array.isArray(book.files) || !book.files.length) continue;
        book.files = await Promise.all(book.files.map(async (f) => {
          if (typeof f !== "string" || !f.startsWith("userdata:files/")) return f;
          const localPath = resolveStoredPath(f);
          if (!fs.existsSync(localPath)) return f;
          return await publishAttachment(owner, repo, headers, release, localPath);
        }));
      }
    }

    // What actually leaves this machine — borrower name/contact stripped from
    // any personal loan. The full record, borrower included, stays in the
    // local file written at the end of this function.
    const forRemote = redactForPublish(data);

    let sha;
    const head = await fetch(`${url}?ref=${branch}`, { headers });
    if (head.ok) sha = (await head.json()).sha;
    else if (head.status !== 404) {
      return { ok: false, error: `GitHub ${head.status}: ${await head.text()}` };
    }

    /* Lean (no default-valued fields) but still INDENTED, unlike the local
       copy. Indentation is what lets git diff this line-by-line: a one-word
       correction stays a one-line change, which is why the whole repository is
       still under a megabyte after thirty publishes, and why the commit
       history doubles as a readable audit trail and recovery point. Writing it
       as one long line would make every publish look like the entire file
       changed, defeating both. */
    const body = {
      message: `Update books.json (${data.books.length} کتابیں)`,
      content: Buffer.from(JSON.stringify(leanCatalogue(withoutLocalOnly(forRemote)), null, 2), "utf8").toString("base64"),
      branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return { ok: false, error: `GitHub ${res.status}: ${await res.text()}` };

    // Remember exactly what reached GitHub, so "unpublished" is a fact rather
    // than a guess. The rewritten cover/file URLs are part of what we publish,
    // so hash the object as it now stands.
    writeJson(publishStateFile(), { hash: catalogueHash(forRemote), at: new Date().toISOString() });
    writeCatalogue(dataFile(), data);
    /* Hand the rewritten records back. Publishing turns local cover and file
       paths into hosted URLs, and the window is holding its own copy of the
       catalogue — without this it keeps the old local paths, its next autosave
       writes them back over the rewritten file on disk, and every publish
       re-uploads the same covers for ever. */
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

ipcMain.handle("publish", (_e, data) => doPublish(data));
