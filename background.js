// Rules live in chrome.storage.local under "rules" as an array of:
//   { id, enabled, type: "header"|"cookie", name, url, key, value }
// The popup shows the value of "lastError" in chrome.storage.local.

import { parseMatchPattern, matchesUrl, toDnrCondition } from "./match-pattern.js";

async function getRules() {
  const { rules = [] } = await chrome.storage.local.get("rules");
  return rules;
}

async function setLastError(message) {
  const { lastError = null } = await chrome.storage.local.get("lastError");
  if (lastError === message) return;
  if (message) await chrome.storage.local.set({ lastError: message });
  else await chrome.storage.local.remove("lastError");
}

function label(rule) {
  return rule.name || rule.key || rule.id;
}

// Pattern errors are collected for all rules, not only for header rules.
function toDnrRules(rules) {
  const dnr = [];
  const errors = [];
  let id = 1;
  for (const r of rules) {
    if (!r.url || !r.key) continue;
    let pattern;
    try {
      pattern = parseMatchPattern(r.url);
    } catch (e) {
      errors.push(`${label(r)}: ${e.message}`);
      continue;
    }
    if (!r.enabled || r.type !== "header") continue;
    dnr.push({
      id: id++,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: r.key, operation: "set", value: r.value ?? "" }]
      },
      condition: toDnrCondition(pattern)
    });
  }
  return { dnr, errors };
}

async function doSyncDnr() {
  try {
    const rules = await getRules();
    const { dnr, errors } = toDnrRules(rules);
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: dnr
    });
    await setLastError(errors.length ? errors.join("\n") : null);
  } catch (e) {
    console.error("[CookieJab] rule sync failed", e);
    await setLastError(`Header rules were not applied: ${e.message || e}`);
  }
}

// Two storage events must not overlap in updateDynamicRules.
let syncChain = Promise.resolve();
function syncDnr() {
  syncChain = syncChain.then(doSyncDnr, doSyncDnr);
  return syncChain;
}

async function applyCookies(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return;

  const rules = await getRules();
  for (const r of rules) {
    if (!r.enabled || r.type !== "cookie" || !r.url || !r.key) continue;
    let pattern;
    try {
      pattern = parseMatchPattern(r.url);
    } catch {
      continue;
    }
    if (!matchesUrl(pattern, url)) continue;
    try {
      await chrome.cookies.set({ url: u.origin + "/", name: r.key, value: r.value ?? "", path: "/" });
    } catch (e) {
      console.warn("[CookieJab] cookie set failed", r, e);
      await setLastError(`${label(r)}: cookie was not set on ${u.host}: ${e.message || e}`);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => syncDnr());
chrome.runtime.onStartup.addListener(() => syncDnr());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.rules) syncDnr();
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  applyCookies(details.url);
});
