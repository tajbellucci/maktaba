/* Data-safety integration test. Launches the REAL app against throwaway
   profiles and checks that the two ways a catalogue used to disappear are
   both closed. Slow (two Electron launches, ~45s), so it is `npm run
   test:data` rather than part of `npm test`.

   Both cases FAIL on the code as it stood before 2026-09-09 — that is the
   point of keeping them. */
const fs=require("fs"),path=require("path"),cp=require("child_process");
const ROOT=path.join(require("os").tmpdir(), "mkt-datasafety-" + Date.now());
const prof=(n)=>path.join(ROOT,n);
/* Any real catalogue shape will do; the seed one ships with the app, so this
   runs on a machine that has never opened it. */
const base=JSON.parse(fs.readFileSync(path.join(__dirname,"seed","books.json"),"utf8"));

function seed(name, mutate){
  const dir=prof(name);
  fs.rmSync(dir,{recursive:true,force:true});
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"settings.json"),JSON.stringify(
    {owner:"tajbellucci",repo:"maktaba",branch:"main",isLibrarian:false},null,2));
  mutate(dir);
  return dir;
}
function run(dir){
  cp.execSync(`npx electron . --user-data-dir="${dir}" --enable-logging`,
    {timeout:22000,stdio:"pipe"});
}
function books(dir){
  try{return JSON.parse(fs.readFileSync(path.join(dir,"books.json"),"utf8")).books.length;}
  catch(e){return "UNREADABLE";}
}

// 1. unpublished local work must survive a launch that would otherwise adopt the server copy
const extra=JSON.parse(JSON.stringify(base));
extra.books.push({id:999,title:"UNPUBLISHED TEST BOOK",accession:"999",status:"available"});
const d1=seed("unpublished",(dir)=>{
  fs.writeFileSync(path.join(dir,"books.json"),JSON.stringify(extra));
  // publish-state stamped at the 28-book version => hasUnpublished() is true
  fs.writeFileSync(path.join(dir,"publish-state.json"),
    JSON.stringify({hash:"stale-on-purpose",at:new Date().toISOString()},null,2));
});
try{run(d1);}catch(e){}
const n1=books(d1);
const kept=(()=>{try{return JSON.parse(fs.readFileSync(path.join(d1,"books.json"),"utf8"))
  .books.some(b=>b.title==="UNPUBLISHED TEST BOOK");}catch{return false;}})();
console.log(`1. unpublished work survives silent adopt : ${kept?"PASS":"FAIL"} (books=${n1}, expected ${extra.books.length})`);

// 2. a corrupt catalogue must be recovered from a backup, not replaced by the server
const d2=seed("corrupt",(dir)=>{
  fs.writeFileSync(path.join(dir,"books.json"),'{"library":"x","books":[{"id":1,');   // truncated
  const b=path.join(dir,"backups"); fs.mkdirSync(b,{recursive:true});
  fs.writeFileSync(path.join(b,"books-2026-09-08T14-26-28-launch.json"),JSON.stringify(extra));
});
try{run(d2);}catch(e){}
const n2=books(d2);
const rec=(()=>{try{return JSON.parse(fs.readFileSync(path.join(d2,"books.json"),"utf8"))
  .books.some(b=>b.title==="UNPUBLISHED TEST BOOK");}catch{return false;}})();
const badKept=fs.existsSync(path.join(d2,"backups")) &&
  fs.readdirSync(path.join(d2,"backups")).some(f=>f.endsWith(".bad"));
console.log(`2. corrupt catalogue recovered from backup: ${rec?"PASS":"FAIL"} (books=${n2}, expected ${extra.books.length})`);
console.log(`3. damaged file kept for inspection        : ${badKept?"PASS":"FAIL"}`);

if (!kept || !rec || !badKept) process.exit(1);
