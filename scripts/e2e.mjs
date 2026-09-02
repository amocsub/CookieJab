// Browser test. Loads the extension in a headless Chrome, injects rules, and checks
// header and cookie behavior against a local echo server.
// Google Chrome branded builds ignore --load-extension since version 137.
// Use Chrome for Testing: npx @puppeteer/browsers install chrome@stable
// Run: CHROME="<path to Chrome for Testing binary>" node scripts/e2e.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME;
if (!CHROME) { console.error("Set CHROME to the path of a Chrome for Testing binary."); process.exit(2); }
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8123;
const DBG = 9333;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "cookiejab-profile-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ url: req.url, headers: req.headers }));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`, `--remote-debugging-port=${DBG}`, "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeErr = "";
chrome.stderr.on("data", (d) => { chromeErr += d; });

let id = 0;
class CDP {
  constructor(ws) {
    this.ws = ws; this.pending = new Map(); this.listeners = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
      else this.listeners = this.listeners.filter((l) => !(l.method === m.method && (l.resolve(m.params), true)));
    };
  }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return new CDP(ws); }
  send(method, params = {}) { const i = ++id; return new Promise((resolve, reject) => { this.pending.set(i, { resolve, reject }); this.ws.send(JSON.stringify({ id: i, method, params })); }); }
  once(method) { return new Promise((resolve) => this.listeners.push({ method, resolve })); }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async navigate(url) { const loaded = this.once("Page.loadEventFired"); await this.send("Page.navigate", { url }); await loaded; await sleep(150); }
}

const results = [];
function check(name, ok, detail = "") { results.push({ name, ok, detail }); }

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${DBG}/json/version`)).ok) break; } catch {} await sleep(200); }
  await sleep(1500);

  const targets = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json();
  const extId = [...crypto.createHash("sha256").update(EXT).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  const loaded = targets.some((t) => t.url.startsWith(`chrome-extension://${extId}/`));
  check("extension service worker target is present", loaded, targets.map((t) => `${t.type}:${t.url}`).join(", "));
  console.log("extension id:", extId, "| targets:", targets.map((t) => `${t.type}:${t.url}`).join(", "));

  const popupInfo = await (await fetch(`http://127.0.0.1:${DBG}/json/new?chrome-extension://${extId}/popup.html`, { method: "PUT" })).json();
  const popup = await CDP.connect(popupInfo.webSocketDebuggerUrl);
  await sleep(500);
  check("popup page loads", await popup.eval("document.title") === "CookieJab");

  const rules = [
    { id: "a", enabled: true, type: "header", name: "A", url: "*://localhost/*", key: "X-CookieJab", value: "1" },
    { id: "b", enabled: true, type: "header", name: "B", url: "*://*.example.com/*", key: "X-Secret", value: "leak" },
    { id: "c", enabled: true, type: "cookie", name: "C", url: "*://localhost/*", key: "cj", value: "1" },
    { id: "d", enabled: true, type: "cookie", name: "D", url: "*://*.example.com/*", key: "secret", value: "leak" }
  ];
  await popup.eval(`chrome.storage.local.set({ rules: ${JSON.stringify(rules)} })`);
  await sleep(1000);
  const dnr = await popup.eval("chrome.declarativeNetRequest.getDynamicRules()");
  check("two dynamic rules registered", dnr.length === 2, JSON.stringify(dnr.map((r) => r.condition.regexFilter)));
  const le = await popup.eval("chrome.storage.local.get('lastError')");
  check("no lastError after sync", le.lastError === undefined, JSON.stringify(le));

  const pageInfo = await (await fetch(`http://127.0.0.1:${DBG}/json/new?about:blank`, { method: "PUT" })).json();
  const page = await CDP.connect(pageInfo.webSocketDebuggerUrl);
  await page.send("Page.enable");

  await page.navigate(`http://localhost:${PORT}/headers?u=://x.example.com/`);
  let echo = JSON.parse(await page.eval("document.body.innerText"));
  check("header rule for localhost injects X-CookieJab", echo.headers["x-cookiejab"] === "1", JSON.stringify(echo.headers["x-cookiejab"]));
  check("header rule for *.example.com does not fire on localhost with pattern in query", echo.headers["x-secret"] === undefined, JSON.stringify(echo.headers["x-secret"]));

  await page.navigate(`http://localhost:${PORT}/cookies?u=://x.example.com/`);
  await sleep(300);
  await page.navigate(`http://localhost:${PORT}/cookies?u=://x.example.com/`);
  echo = JSON.parse(await page.eval("document.body.innerText"));
  const cookieHeader = echo.headers.cookie || "";
  check("cookie rule for localhost sends cj=1 on second load", /(^|; )cj=1(;|$)/.test(cookieHeader), JSON.stringify(cookieHeader));
  check("cookie rule for *.example.com does not set secret on localhost", !/secret=/.test(cookieHeader), JSON.stringify(cookieHeader));

  const cookies = await popup.eval("chrome.cookies.getAll({})");
  const cj = cookies.find((c) => c.name === "cj");
  check("cj cookie is host-only on localhost with path /", cj && cj.domain === "localhost" && cj.path === "/" && !cj.hostOnly === false, JSON.stringify(cj));
  check("no cookie named secret exists anywhere", !cookies.some((c) => c.name === "secret"), JSON.stringify(cookies.map((c) => c.name)));

  const trySave = async (url, key, type = "header") => popup.eval(`(async () => {
    const f = document.querySelector('#rule-form'); if (f.hidden) document.querySelector('#add-btn').click();
    document.querySelector('#f-type').value = ${JSON.stringify(type)};
    document.querySelector('#f-url').value = ${JSON.stringify(url)};
    document.querySelector('#f-key').value = ${JSON.stringify(key)};
    document.querySelector('#f-value').value = 'v';
    f.requestSubmit();
    await new Promise(r => setTimeout(r, 400));
    const err = document.querySelector('#form-error');
    const { rules } = await chrome.storage.local.get('rules');
    return { error: err.hidden ? null : err.textContent, count: rules.length, last: rules[rules.length - 1].url };
  })()`);

  let r = await trySave("ftp://example.com/*", "X-Test");
  check("save rejects ftp scheme", r.error && r.count === 4, JSON.stringify(r));
  r = await trySave("*://foo.*.bar/*", "X-Test");
  check("save rejects wildcard inside host", r.error && r.count === 4, JSON.stringify(r));
  r = await trySave("*://example.com/*", "Bad Header");
  check("save rejects header name with a space", r.error && r.count === 4, JSON.stringify(r));
  r = await trySave("Example.com/api", "X-Test");
  check("save stores the canonical pattern", r.error === null && r.count === 5 && r.last === "*://example.com/api", JSON.stringify(r));
  await sleep(800);
  const dnr2 = await popup.eval("chrome.declarativeNetRequest.getDynamicRules()");
  check("three dynamic rules after saving a header rule", dnr2.length === 3, String(dnr2.length));

  popup.ws.close(); page.ws.close();
} catch (e) {
  check("script completed", false, String(e.stack || e));
} finally {
  chrome.kill("SIGKILL");
  server.close();
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.detail}`);
const failed = results.filter((r) => !r.ok).length;
if (failed && chromeErr) console.log("chrome stderr:\n" + chromeErr.slice(-2000));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
