// Rules live in chrome.storage.local under "rules" as an array of:
//   { id, enabled, type: "header"|"cookie", bundle, bundleUrl, url, key, value }
// bundleUrl, when set, is the match pattern that applies for every rule
// in the same bundle, in place of each rule's own url.
// "appliedCookies" maps a rule id to the cookies that the rule set, as { url, name }.
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

function effectiveUrl(rule) {
  return rule.bundleUrl || rule.url;
}

// Pattern errors are collected for all rules, not only for header rules.
function toDnrRules(rules) {
  const dnr = [];
  const errors = [];
  let id = 1;
  for (const r of rules) {
    if (!effectiveUrl(r) || !r.key) continue;
    let pattern;
    try {
      pattern = parseMatchPattern(effectiveUrl(r));
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

// Calls through the same queue never overlap.
function queue() {
  let chain = Promise.resolve();
  return (fn) => (chain = chain.then(fn, fn));
}

const dnrQueue = queue();
const cookieQueue = queue();

function syncDnr() {
  return dnrQueue(doSyncDnr);
}

async function recordCookie(ruleId, url, name) {
  const { appliedCookies = {} } = await chrome.storage.local.get("appliedCookies");
  const list = appliedCookies[ruleId] ?? [];
  if (list.some((c) => c.url === url && c.name === name)) return;
  appliedCookies[ruleId] = [...list, { url, name }];
  await chrome.storage.local.set({ appliedCookies });
}

async function removeCookies(ruleIds) {
  if (!ruleIds.length) return;
  const { appliedCookies = {} } = await chrome.storage.local.get("appliedCookies");
  for (const id of ruleIds) {
    for (const c of appliedCookies[id] ?? []) {
      try {
        await chrome.cookies.remove(c);
      } catch (e) {
        console.warn("[CookieJab] cookie remove failed", c, e);
      }
    }
    delete appliedCookies[id];
  }
  await chrome.storage.local.set({ appliedCookies });
}

// A cookie rule loses its cookies when it is deleted, disabled, or its target changes.
function rulesLosingCookies(oldRules, newRules) {
  const byId = new Map(newRules.map((r) => [r.id, r]));
  return oldRules
    .filter((o) => {
      if (o.type !== "cookie") return false;
      const n = byId.get(o.id);
      return !n || (o.enabled && !n.enabled) || n.type !== o.type || n.key !== o.key || effectiveUrl(n) !== effectiveUrl(o);
    })
    .map((o) => o.id);
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
    if (!r.enabled || r.type !== "cookie" || !effectiveUrl(r) || !r.key) continue;
    let pattern;
    try {
      pattern = parseMatchPattern(effectiveUrl(r));
    } catch {
      continue;
    }
    if (!matchesUrl(pattern, url)) continue;
    try {
      await chrome.cookies.set({ url: u.origin + "/", name: r.key, value: r.value ?? "", path: "/" });
      await cookieQueue(() => recordCookie(r.id, u.origin + "/", r.key));
    } catch (e) {
      console.warn("[CookieJab] cookie set failed", r, e);
      await setLastError(`${label(r)}: cookie was not set on ${u.host}: ${e.message || e}`);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => syncDnr());
chrome.runtime.onStartup.addListener(() => syncDnr());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.rules) return;
  syncDnr();
  const ids = rulesLosingCookies(changes.rules.oldValue ?? [], changes.rules.newValue ?? []);
  cookieQueue(() => removeCookies(ids));
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  applyCookies(details.url);
});
