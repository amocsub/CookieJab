// Builds the Chrome Web Store screenshots from the real popup, not a mockup.
// For each scenario: seed chrome.storage.local, reopen the popup fresh, run
// any interaction needed, and screenshot it. Then composite that image onto
// a captioned 1280x800 canvas and screenshot that too, into store/assets/.
// Needs Chrome for Testing, since Google Chrome ignores --load-extension
// since version 137: npx @puppeteer/browsers install chrome@stable
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const CHROME = process.env.CHROME;
if (!CHROME) {
  console.error("Set CHROME to the path of a Chrome for Testing binary.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "store", "assets");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withPopup(seedScript, postScript, width, height) {
  const dbgPort = 9600 + Math.floor(Math.random() * 300);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cookiejab-shot-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    `--user-data-dir=${profile}`, `--load-extension=${root}`,
    `--remote-debugging-port=${dbgPort}`, "about:blank"
  ], { stdio: "ignore" });

  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://127.0.0.1:${dbgPort}/json/version`)).ok) break; } catch {}
      await sleep(200);
    }
    await sleep(1000);
    const extId = [...crypto.createHash("sha256").update(root).digest("hex").slice(0, 32)]
      .map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");

    const open = async () => {
      const tab = await (await fetch(`http://127.0.0.1:${dbgPort}/json/new?chrome-extension://${extId}/popup.html`, { method: "PUT" })).json();
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((res) => (ws.onopen = res));
      let n = 0;
      const send = (method, params = {}) => new Promise((res) => {
        const id = ++n;
        const handler = (e) => {
          const m = JSON.parse(e.data);
          if (m.id === id) { ws.removeEventListener("message", handler); res(m); }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
      await sleep(400);
      return { ws, send };
    };

    let { ws, send } = await open();
    await send("Runtime.evaluate", { expression: seedScript, awaitPromise: true });
    await sleep(300);
    ws.close();

    ({ ws, send } = await open());
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    if (postScript) {
      await send("Runtime.evaluate", { expression: postScript, awaitPromise: true });
      await sleep(250);
    }
    await sleep(150);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    ws.close();
    return Buffer.from(shot.result.data, "base64");
  } finally {
    chrome.kill("SIGKILL");
    await sleep(200);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

async function renderComposite(html, width, height, outPath) {
  const tmp = path.join(os.tmpdir(), `cookiejab-composite-${crypto.randomUUID()}.html`);
  fs.writeFileSync(tmp, html);
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(CHROME, [
        "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
        "--allow-file-access-from-files", "--default-background-color=ffffffff",
        `--window-size=${width},${height}`, `--screenshot=${outPath}`, `file://${tmp}`
      ]);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`chrome exited ${code}`))));
    });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const compositeTemplate = ({ height, title, subtitle, b64 }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
  body {
    width: 1280px; padding: 0; box-sizing: border-box;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px;
    background: radial-gradient(circle at 30% 20%, #23251a 0%, #0f100b 60%);
    font-family: system-ui, -apple-system, sans-serif;
  }
  .caption { text-align: center; max-width: 900px; }
  .caption h2 { margin: 0 0 10px; font: 600 34px/1.25 ui-monospace, "SF Mono", Consolas, monospace; color: #e9e7dc; letter-spacing: -0.5px; }
  .caption p { margin: 0; color: #8b8d7c; font-size: 18px; line-height: 1.4; }
  .popup {
    width: 420px; height: ${height}px; overflow: hidden; box-sizing: border-box;
    background: #15160f; border: 1px solid #34362a; border-radius: 4px;
    transform: scale(1.35); transform-origin: top center;
  }
  .popup img { display: block; width: 420px; }
</style>
</head>
<body>
  <div class="caption"><h2>${title}</h2><p>${subtitle}</p></div>
  <div class="popup"><img src="data:image/png;base64,${b64}" /></div>
</body>
</html>`;

const scenarios = [
  {
    name: "1-bundles",
    width: 420, height: 320,
    title: "Group headers and cookies into bundles",
    subtitle: "Enable or disable a whole group at once, or override one match pattern for all of them.",
    seed: `chrome.storage.local.set({
      hideValues: false,
      rules: [
        { id: "a", enabled: true, type: "header", bundle: "Staging API", url: "https://*.staging.example.com/*", key: "Authorization", value: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhcGkifQ.sig" },
        { id: "b", enabled: true, type: "cookie", bundle: "Staging API", url: "*://staging.example.com/*", key: "session_id", value: "8f3c1a7e4b2d" },
        { id: "c", enabled: true, type: "cookie", url: "*://qa.example.com/*", key: "feature_flag", value: "checkout-v2" }
      ]
    })`,
    post: `document.querySelector('.bundle-name').click()`
  },
  {
    name: "2-add-rule",
    width: 420, height: 420,
    title: "Add a rule in seconds",
    subtitle: "Pick header or cookie, set a match pattern, and CookieJab injects it on every match.",
    seed: `chrome.storage.local.set({ hideValues: false, rules: [] })`,
    post: `document.querySelector('#add-btn').click();
      document.querySelector('#f-bundle').value = 'Staging API';
      document.querySelector('#f-url').value = '*://*.staging.example.com/*';
      document.querySelector('#f-key').value = 'Authorization';
      document.querySelector('#f-value').value = 'Bearer eyJhbGciOiJSUzI1NiJ9.sig';`
  },
  {
    name: "3-curl-import",
    width: 420, height: 560,
    title: "Import straight from a curl command",
    subtitle: "Paste a curl command, review every header and cookie it found, and pick what to keep.",
    seed: `chrome.storage.local.set({ hideValues: false, rules: [] })`,
    post: `(async () => {
      document.querySelector('#import-btn').click();
      document.querySelector('#import-text').value = "curl 'https://api.example.com/v1/orders' -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.sig' -H 'Accept: application/json' -H 'Cookie: session_id=8f3c1a7e4b2d; theme=dark'";
      document.querySelector('#import-parse-btn').click();
      await new Promise(r => setTimeout(r, 100));
      for (const name of ['Authorization', 'session_id']) {
        const row = [...document.querySelectorAll('.import-item')].find(r => r.querySelector('.import-name').value === name);
        row.querySelector('input[type=checkbox]').click();
      }
    })()`
  },
  {
    name: "4-bundle-override",
    width: 420, height: 340,
    title: "One pattern for a whole bundle",
    subtitle: "A bundle's own match pattern applies to every rule inside it, whatever pattern each rule was saved with.",
    seed: `chrome.storage.local.set({
      hideValues: false,
      rules: [
        { id: "a", enabled: true, type: "header", bundle: "Staging API", bundleUrl: "*://*.staging.example.com/*", url: "https://old-host.example.com/*", key: "Authorization", value: "Bearer eyJhbGciOiJSUzI1NiJ9.sig" },
        { id: "b", enabled: true, type: "cookie", bundle: "Staging API", bundleUrl: "*://*.staging.example.com/*", url: "*://staging.example.com/*", key: "session_id", value: "8f3c1a7e4b2d" }
      ]
    })`,
    post: `document.querySelector('.bundle-name').click()`
  }
];

fs.mkdirSync(outDir, { recursive: true });
for (const s of scenarios) {
  const png = await withPopup(s.seed, s.post, s.width, s.height);
  const html = compositeTemplate({ height: s.height, title: s.title, subtitle: s.subtitle, b64: png.toString("base64") });
  const out = path.join(outDir, `${s.name}-1280x800.png`);
  await renderComposite(html, 1280, 800, out);
  console.log("rendered", out);
}
