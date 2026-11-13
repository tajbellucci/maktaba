// Tiny CDP driver: node cdp.js <wsUrl> <script.js>  — script exports async (h) => {}
const fs = require("fs");
const path = require("path");
const [wsUrl, scriptPath] = process.argv.slice(2);
let id = 0; const pending = new Map(); let ws;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.SHOT_DIR;
const shot = async (name) => {
  await wait(250);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const f = path.join(OUT, name + ".png");
  fs.writeFileSync(f, Buffer.from(r.data, "base64"));
  console.log("shot", name);
};
(async () => {
  ws = new WebSocket(wsUrl);
  await new Promise((res) => ws.addEventListener("open", res));
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Page.javascriptDialogOpening") { send("Page.handleJavaScriptDialog", { accept: true }); return; }
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  console.log("connected");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
  const fn = require(path.resolve(scriptPath));
  await fn({ send, evalJs, wait, shot });
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
