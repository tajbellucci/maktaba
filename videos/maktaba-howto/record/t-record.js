// Walks the app like a staff member and records one screenshot per step plus the
// position (CSS px at 1600x900) of every element the video highlights.
const fs = require("fs"), path = require("path");
module.exports = async ({ send, evalJs, wait, shot }) => {
  const E = (js) => evalJs(js);
  for (let i = 0; i < 80; i++) { if (await evalJs("typeof DATA!=='undefined'&&DATA&&DATA.books.length>0&&IS_MASTER").catch(() => false)) break; await wait(500); } await wait(2500);
  let RECTS = {};
  try { RECTS = JSON.parse(fs.readFileSync(process.env.RECTS_OUT, 'utf8')); } catch (e) { RECTS = {}; }
  const rect = (sel, i = 0) => E(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${i}];if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]})()`);
  const clean = () => E("(()=>{try{hideCard()}catch(e){};const st=document.getElementById('__shotcss')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'__shotcss'}));st.textContent='#toast,.toast{display:none!important}';if($('sbPath'))$('sbPath').textContent='';})();0");
  const cap = async (name, map = {}, opts = {}) => {
    await E("window.scrollTo(0,0);0"); await wait(opts.settle || 500);
    if (!opts.keepCard) await clean();
    await shot(name);
    const o = {};
    for (const [k, v] of Object.entries(map)) { const [sel, i] = Array.isArray(v) ? v : [v, 0]; o[k] = await rect(sel, i); }
    RECTS[name] = o;
    fs.writeFileSync(process.env.RECTS_OUT, JSON.stringify(RECTS, null, 1));
  };
  const WANT = (process.env.GROUPS || "").split(",").filter(Boolean);
  const ALWAYS = ["home", "list"];
  const step = async (label, fn) => {
    if (WANT.length && !WANT.includes(label) && !ALWAYS.includes(label)) return;
    let timer;
    const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("TIMEOUT 80s")), 80000); });
    try { await Promise.race([fn(), limit]); }
    catch (e) {
      console.log("STEP FAILED:", label, "-", String(e.message).replace(/\n/g, " ").slice(0, 400));
      if (/TIMEOUT/.test(e.message)) { console.log("page is stuck, stopping this run"); process.exit(2); }
    } finally { clearTimeout(timer); }
  };
  const click = (sel, i = 0) => E(`document.querySelectorAll(${JSON.stringify(sel)})[${i}].click();0`);
  const setVal = (id, v) => E(`(()=>{const e=$(${JSON.stringify(id)});e.focus();e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})();0`);
  const rowOf = (text) => E(`(()=>{const rows=[...document.querySelectorAll('#bookList .bookrow')];const i=rows.findIndex(r=>r.querySelector('.br-title').textContent.includes(${JSON.stringify(text)}));return i})()`);
  const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  const TB = (act) => `#iconbar [data-act=${act}]`;
  await E("window.confirm=()=>true;window.__errs=[];window.addEventListener('error',e=>__errs.push(String(e.message)));setLang('ar');0"); await wait(600);

  // ---- 1 home ---------------------------------------------------------------
  await step("home", async () => {
    await cap("01-home", { enter: "#homeView .home-enter button", addOne: TB("addOne"), addMany: TB("addMany"), del: TB("delete"), undo: TB("undo"), redo: TB("redo"), backup: TB("export"), pull: TB("pull"), publish: TB("publish"), settings: TB("settings"), appearance: TB("appearance"), more: "#menuMore", ibBooks: "#ibBooks", ibSearch: "#ibSearch" });
  });
  // ---- 2 list ---------------------------------------------------------------
  await step("list", async () => {
    await click("#homeView .home-enter button"); await wait(900);
    await cap("02-list", { tabs: "#tabs", tabAll: "[data-filter=all]", tabAvail: "[data-filter=available]", tabIssued: "[data-filter=issued]", tabMissing: "[data-filter=missing]", tabOverdue: "[data-filter=overdue]", rail: "#rail", railBooks: "#rail [data-mode=books]", railCategory: "#rail [data-mode=category]", railShelf: "#rail [data-mode=shelf]", railStatus: "#rail [data-mode=status]", head: ".bookhead", search: "#search", rows: "#bookList", row1: ["#bookList .bookrow", 0], row3: ["#bookList .bookrow", 2], dlg: "#dlgCatalog", sort: "#sortSel" });
  });
  // ---- 3 category / 4 shelf --------------------------------------------------
  await step("category", async () => {
    await click("#rail [data-mode=category]"); await wait(600);
    const idx = await E("[...document.querySelectorAll('#groupList .grouprow')].findIndex(r=>r.textContent.includes('الحديث'))");
    await click("#groupList .grouprow", idx); await wait(700);
    await cap("03-category", { railCategory: "#rail [data-mode=category]", groups: "#groupList", groupRow: ["#groupList .grouprow", idx], rows: "#bookList" });
    await click("#rail [data-mode=shelf]"); await wait(600);
    await click("#groupList .grouprow", 1); await wait(700);
    await cap("04-almari", { railShelf: "#rail [data-mode=shelf]", groups: "#groupList", groupRow: ["#groupList .grouprow", 1], rows: "#bookList" });
    await click("#rail [data-mode=books]"); await wait(500);
  });
  // ---- 5 search (title only) -------------------------------------------------
  await step("search", async () => {
    await setVal("search", "تفسير"); await wait(1100);
    await cap("05-search", { search: "#search", rows: "#bookList", row1: ["#bookList .bookrow", 0], count: "#sbShown" });
    await setVal("search", "");  await wait(700);
  });
  // ---- 6 hover card / 7 detail ----------------------------------------------
  await step("hover", async () => {
    const r = await rect("#bookList .bookrow", 2);
    await mouse(r[0] + 400, r[1] + 20); await mouse(r[0] + 420, r[1] + 22); await wait(900);
    await cap("06-hover", { row: ["#bookList .bookrow", 2], card: "#bookCard" }, { keepCard: true });
    await mouse(5, 5); await wait(300);
  });
  await step("detail", async () => {
    await E("(()=>{const r=document.querySelectorAll('#bookList .bookrow')[2];r.dispatchEvent(new MouseEvent('click',{bubbles:true}));r.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))})();0"); await wait(1100);
    await cap("07-detail", { win: "#bookView", save: "#bvSave", pick: "#bvPick", undo: TB("undo"), title: "#dTitle", category: "#dCategory", tracking: "#tracking" });
  });
  // ---- 8 sort + more menu ---------------------------------------------------
  await step("sort", async () => {
    await E("closeBook();0"); await wait(500);
    await click(".bh-title"); await wait(800);
    await cap("08-sort", { headTitle: ".bh-title", headAuthor: ".bh-author", headPublisher: ".bh-publisher", rows: "#bookList" });
    await click(".bh-title"); await wait(500);
    await E("$('sortSel').value='accession';$('sortSel').dispatchEvent(new Event('change'));0"); await wait(500);
    await click("#menuMore > span"); await wait(700);
    await cap("09-more", { more: "#menuMore", excel: "[data-act=exportExcel]", bin: "[data-act=recycleBin]", issued: "[data-act=issued]", cats: "[data-act=categoriesMan]", whatsNew: "[data-act=whatsNew]", menu: ".dropdown.show" });
    await click("#menuMore > span"); await wait(500);
    await E("document.querySelectorAll('.dropdown.show').forEach(d=>d.classList.remove('show'));0");
  });

  const bookId = (title) => E(`DATA.books.find(b=>b.title===${JSON.stringify(title)}).id`);
  const openDetail = async (id) => { await E(`closeBook&&closeBook();0`); await wait(300); await E(`selectedId=${id};renderDetail();openBook();0`); await wait(800); };
  const scrollTo = async (sel) => { await E(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'center'});0`); await wait(500); };
  const FIQH = "مثال كتاب فقه";

  // ---- 10 add a book --------------------------------------------------------
  await step("add", async () => {
    await click(TB("addOne")); await wait(900);
    await setVal("oTitle", FIQH); await setVal("oAuthor", "مؤلف نموذجي"); await setVal("oPublisher", "دار النموذج");
    await setVal("oCategory", "الفقه"); await setVal("oVolumes", "1");
    await E("(()=>{const m=$('oMaktaba');if(m&&m.options.length>1){m.selectedIndex=1;m.dispatchEvent(new Event('change',{bubbles:true}))}})();0"); await wait(300);
    await setVal("oDepartment", "المكتبة العامة"); await setVal("oShelf", "5-أ"); await wait(500);
    await cap("10-add", { dlg: "#dlgOne", title: "#oTitle", author: "#oAuthor", category: "#oCategory", volumes: "#oVolumes", format: "#oFormat", save: "#oSave", addOne: TB("addOne") });
    await click("#oSave"); await wait(1200);
    await E("(()=>{const d=$('dlgOne');if(d.open)d.close()})();0");
  });
  // ---- 11 edit + save button --------------------------------------------------
  await step("edit", async () => {
    const id = await bookId(FIQH);
    await E(`(()=>{const b=DATA.books.find(x=>x.id===${id});b.format='unicode';b.files=['userdata:files/sample-book.txt','userdata:files/sample-book.pdf'];b.hasPrint=false;renderAll()})();0`);
    await openDetail(id);
    await setVal("dCategory", "علوم الحديث"); await wait(600);
    await E("document.activeElement&&document.activeElement.blur();0"); await wait(400);
    await cap("11-edit", { win: "#bookView", category: "#dCategory", save: "#bvSave", undo: TB("undo"), redo: TB("redo") });
    await click("#bvSave"); await wait(900);
    await setVal("dCategory", "الفقه"); await click("#bvSave"); await wait(800);
  });
  // ---- 12 attach: text + PDF + page offset -------------------------------------
  await step("attach-pair", async () => {
    const id = await bookId(FIQH);
    await openDetail(id);
    await setVal("dPdfOffset", "2"); await click("#bvSave"); await wait(800);
    await scrollTo("#fileRow");
    await cap("12-attach-pair", { win: "#bookView", fileRow: "#fileRow", attach: "#btnAttach", attachUrl: "#btnAttachUrl", offset: "#dPdfOffset", format: "#dFormat", save: "#bvSave", read0: ["#fileRow [data-read]", 0], read1: ["#fileRow [data-read]", 1] });
  });
  // ---- 13 other documents -------------------------------------------------------
  await step("attach-docs", async () => {
    const id = await E(`DATA.books.find(b=>b.accession==='5').id`);
    await E(`(()=>{const b=DATA.books.find(x=>x.id===${id});b.format='document';b.files=['userdata:files/catalogue-list.docx','userdata:files/borrowing-register.xlsx'];renderAll()})();0`);
    await openDetail(id);
    await scrollTo("#fileRow");
    await cap("13-attach-docs", { win: "#bookView", fileRow: "#fileRow", format: "#dFormat", attach: "#btnAttach", read0: ["#fileRow [data-read]", 0], open0: ["#fileRow [data-open]", 0], open1: ["#fileRow [data-open]", 1] });
  });
  // ---- 14 Word file read in the app ---------------------------------------------
  await step("docx-reader", async () => {
    const id = await E(`DATA.books.find(b=>b.accession==='5').id`);
    await E(`(()=>{const b=DATA.books.find(x=>x.id===${id});openReader(b,b.files[0])})();0`); await wait(2200);
    await setVal("rdQuery", "تفسير"); await E("runReaderSearch();0"); await wait(900);
    await cap("14-docx-reader", { tabs: "#rdTabs", search: "#rdQuery", count: "#rdCount", text: "#rdText", results: "#rdResults" });
  });
  // ---- 15 text with page marks / 16 PDF at the page / 17 tabs ---------------------
  await step("pdf-map", async () => {
    await E("closeBook&&closeBook();0"); await wait(400);
    const id = await bookId(FIQH);
    await E(`(()=>{const b=DATA.books.find(x=>x.id===${id});openReader(b,b.files[0])})();0`); await wait(1800);
    await setVal("rdQuery", "الصلاة"); await E("runReaderSearch();0"); await wait(900);
    await E("document.querySelectorAll('#rdRows .rd-result')[3].click();0"); await wait(700);
    await cap("15-reader-marks", { tabs: "#rdTabs", search: "#rdQuery", pdfBtn: "#rdPdfBtn", pages: "#rdRows", pageCol: ["#rdRows .rc-page", 3], results: "#rdResults" });
    await click("#rdPdfBtn"); await wait(3800);
    await cap("16-pdf-page", { tabs: "#rdTabs", pdf: "#rdPdf iframe:not(.hidden)" });
    await E("rdSwitch(rdTabs[0].key);0"); await wait(1500);
    await cap("17-tabs", { tabs: "#rdTabs", tab0: ["#rdTabs .rd-tab", 0], tab1: ["#rdTabs .rd-tab", 1], tab2: ["#rdTabs .rd-tab", 2] });
    await E("while(rdTabs.length){rdCloseTab(rdTabs[0].key)};0"); await wait(600);
  });
  // ---- 18 search across ticked books ---------------------------------------------
  await step("fts", async () => {
    await E("closeBook&&closeBook();0"); await wait(400);
    await click("#ibSearch"); await wait(900);
    await setVal("search", FIQH); await wait(1000);
    await click("#bookList .br-check"); await wait(500);
    await setVal("fts1", "الصلاة"); await wait(300);
    await click("#ftsRun"); await wait(1800);
    await cap("18-fts", { pane: "#ftsPane", term: "#fts1", run: "#ftsRun", results: "#ftsResults", hit: ["#ftsResults .fts-hit", 0], tick: ["#bookList .br-check", 0], ibSearch: "#ibSearch" });
    await setVal("search", ""); await click("#ibBooks"); await wait(800);
  });
  // ---- 19-24 borrowing --------------------------------------------------------------
  await step("issue", async () => {
    const id = await E(`DATA.books.find(b=>b.accession==='1').id`);
    await openDetail(id); await scrollTo("#tracking");
    await cap("19-issue-btn", { win: "#bookView", tracking: "#tracking", issue: "#btnIssue", transfer: "#btnTransfer" });
    await click("#btnIssue"); await wait(900);
    await setVal("iBorrower", "محمد نمونہ"); await setVal("iAddress", "لیاری، کراچی"); await setVal("iPhone", "0300-0000000"); await setVal("iDays", "7"); await wait(500);
    await cap("20-issue-form", { dlg: "#dlgIssue", borrower: "#iBorrower", address: "#iAddress", phone: "#iPhone", days: "#iDays", due: "#iDue", save: "#iSave" });
    await click("#iSave"); await wait(900);
    await cap("21-issue-confirm", { dlg: "#dlgAsk", go: "#askGo" });
    await click("#askGo"); await wait(1200);
    await scrollTo("#tracking");
    await cap("22-issued", { win: "#bookView", tracking: "#tracking", ret: "#btnReturn" });
    await click("#btnReturn"); await wait(900);
    await cap("23-return-confirm", { dlg: "#dlgAsk", go: "#askGo" });
    await click("#askGo"); await wait(1200);
    await scrollTo("#tracking");
    await cap("24-returned", { win: "#bookView", tracking: "#tracking", issue: "#btnIssue" });
  });
  await step("loans-lists", async () => {
    await E(`closeBook&&closeBook();0`); await wait(400);
    const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    await E(`(()=>{const loan=(acc,due,name)=>{const b=DATA.books.find(x=>x.accession===acc);b.status='issued';b.issueType='person';b.borrower=name;b.borrowerAddress='کراچی';b.borrowerPhone='0300-0000000';b.issueDate='${iso(-10)}';b.dueDate=due;b.days=10;b.hist=b.hist||[]};loan('2','${iso(4)}','احمد نمونہ');loan('3','${iso(-3)}','بلال نمونہ');renderAll()})();0`); await wait(700);
    await click("[data-filter=issued]"); await wait(700);
    await cap("25-tab-issued", { tabs: "#tabs", tab: "[data-filter=issued]", rows: "#bookList" });
    await click("[data-filter=overdue]"); await wait(700);
    await cap("26-tab-overdue", { tabs: "#tabs", tab: "[data-filter=overdue]", rows: "#bookList" });
    await click("[data-filter=all]"); await wait(400);
    await E("document.querySelector('[data-act=issued]').click();0"); await wait(1100);
    await cap("27-issued-list", { dlg: "#dlgIssued", more: "#menuMore" });
    await E("(()=>{const d=$('dlgIssued');if(d.open)d.close()})();0"); await wait(400);
  });
  // ---- 28-29 delete + recycle bin ------------------------------------------------------
  await step("delete", async () => {
    await click("#ibSearch"); await wait(900);
    await click("#bookList .br-check", 4); await wait(500);
    await cap("28-delete-tick", { tick: ["#bookList .br-check", 4], del: TB("delete"), row: ["#bookList .bookrow", 4] });
    await click(TB("delete")); await wait(1200);
    await E("document.querySelector('[data-act=recycleBin]').click();0"); await wait(1000);
    await cap("29-bin", { dlg: "#dlgBin", restore: "[data-binrestore]", rows: "#binList" });
    await E("(()=>{const d=$('dlgBin');if(d.open)d.close()})();0"); await wait(400);
    await click("#ibBooks"); await wait(700);
  });
  // ---- 30 publish -------------------------------------------------------------------------
  await step("publish", async () => {
    await cap("30-publish", { publish: "#ibPublish", pull: TB("pull"), backup: TB("export") });
  });
  // ---- 31 appearance / 32 categories ----------------------------------------------------------
  await step("appearance", async () => {
    await click(TB("appearance")); await wait(1000);
    await cap("31-appearance", { dlg: "#dlgAppearance", appearance: TB("appearance") });
    await E("(()=>{const d=$('dlgAppearance');if(d.open)d.close()})();0"); await wait(400);
  });
  await step("cats", async () => {
    await E("document.querySelector('[data-act=categoriesMan]').click();0"); await wait(1000);
    await cap("32-cats", { dlg: "#dlgCats", more: "#menuMore" });
    await E("(()=>{const d=$('dlgCats');if(d.open)d.close()})();0"); await wait(400);
  });
  // ---- 33 cover --------------------------------------------------------------------------------
  await step("cover", async () => {
    const id = await E(`DATA.books.find(b=>b.accession==='7').id`);
    await openDetail(id);
    await cap("33-cover", { win: "#bookView", cover: "#coverBox" });
    await E("(()=>{const g=[...document.querySelectorAll('#coverBox button')].find(b=>b.querySelector('use')&&b.querySelector('use').getAttribute('href')==='#i-globe');if(g)g.click()})();0"); await wait(900);
    await setVal("imgUrlInput", "https://example.org/covers/book.jpg"); await wait(400);
    await cap("34-cover-url", { dlg: "#dlgImgUrl", input: "#imgUrlInput", save: "#imgUrlSave" });
    await E("(()=>{const d=$('dlgImgUrl');if(d.open)d.close()})();0");
    await E("closeBook&&closeBook();0");
  });
  console.log("recording done; errors:", JSON.stringify(await E("__errs")));
};
