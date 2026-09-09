// Rules are read and written through rules-store.js as an array of:
//   { id, enabled, type: "header"|"cookie", bundle, bundleUrl, url, key, value,
//     mode, side, resourceTypes, cookieAttrs, bundleVar }
// bundleUrl, when set, is the match pattern that applies for every rule
// in the same bundle, in place of each rule's own url. bundleVar, when set,
// is mirrored the same way and supplies the value substituted for
// {{<bundleVar.name>}} in this rule's value.
// mode is "set" or "append" for a header rule, "set" or "absent" for a
// cookie rule. side is "request" or "response", header rules only.
//
// "appliedCookies" maps a rule id to the cookies that the rule set, as { url, name }.
// "matchCounts" maps a rule id to { count, last }, kept device-local since a
// synced value would blow through chrome.storage.sync's write-rate limit.
// "killSwitch" pauses every rule without touching the stored rules.
// The popup shows the value of "lastError" in chrome.storage.local.

import { parseMatchPattern, matchesUrl, toDnrCondition } from "./match-pattern.js";
import { renderTemplate } from "./templates.js";
import { loadRules, saveRules } from "./rules-store.js";

const REROLL_ALARM = "cookiejab-reroll";

// Header rules watched for a match, for the webRequest-based counter.
// Rebuilt on every rule sync, not read per request beyond this cache.
let headerMatchWatch = [];

async function setLastError(message) {
  const { lastError = null } = await chrome.storage.local.get("lastError");
  if (lastError === message) return;
  if (message) await chrome.storage.local.set({ lastError: message });
  else await chrome.storage.local.remove("lastError");
}

async function getKillSwitch() {
  const { killSwitch = false } = await chrome.storage.local.get("killSwitch");
  return killSwitch;
}

// A small red dot on the toolbar icon, so a paused state is visible even
// without opening the popup.
async function syncBadge() {
  const on = await getKillSwitch();
  await chrome.action.setBadgeBackgroundColor({ color: "#c06a52" });
  await chrome.action.setBadgeText({ text: on ? "•" : "" });
}

function label(rule) {
  return rule.name || rule.key || rule.id;
}

function effectiveUrl(rule) {
  return rule.bundleUrl || rule.url;
}

// The value for {{<bundleVar.name>}} in this rule's own value, if any.
function templateVars(rule) {
  const v = rule.bundleVar;
  if (!v?.name) return {};
  const choice = v.choices?.[v.selected];
  return choice ? { [v.name]: choice.value } : {};
}

async function bumpMatchCount(ruleId) {
  const { matchCounts = {} } = await chrome.storage.local.get("matchCounts");
  const entry = matchCounts[ruleId] ?? { count: 0, last: 0 };
  matchCounts[ruleId] = { count: entry.count + 1, last: Date.now() };
  await chrome.storage.local.set({ matchCounts });
}

async function pruneMatchCounts(newRules) {
  const ids = new Set(newRules.map((r) => r.id));
  const { matchCounts = {} } = await chrome.storage.local.get("matchCounts");
  let changed = false;
  for (const id of Object.keys(matchCounts)) {
    if (!ids.has(id)) {
      delete matchCounts[id];
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ matchCounts });
}

// Pattern errors are collected for all rules, not only for header rules.
function toDnrRules(rules) {
  const dnr = [];
  const errors = [];
  const matchWatch = [];
  let id = 1;
  let needsReroll = false;

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

    if ((r.value ?? "").includes("{{")) needsReroll = true;
    const value = renderTemplate(r.value ?? "", templateVars(r));
    const entry = { header: r.key, operation: r.mode === "append" ? "append" : "set", value };
    const action = { type: "modifyHeaders" };
    if (r.side === "response") action.responseHeaders = [entry];
    else action.requestHeaders = [entry];

    const condition = toDnrCondition(pattern);
    if (Array.isArray(r.resourceTypes) && r.resourceTypes.length) {
      condition.resourceTypes = r.resourceTypes;
    }

    dnr.push({ id: id++, priority: 1, action, condition });
    matchWatch.push({ ruleId: r.id, pattern, resourceTypes: condition.resourceTypes });
  }
  return { dnr, errors, matchWatch, needsReroll };
}

async function scheduleReroll(needed) {
  if (needed) {
    // Chrome enforces a one-minute floor on repeating alarms for a published
    // extension, so this is an approximation, not a per-request value.
    await chrome.alarms.create(REROLL_ALARM, { periodInMinutes: 1 });
  } else {
    await chrome.alarms.clear(REROLL_ALARM);
  }
}

async function doSyncDnr() {
  try {
    const paused = await getKillSwitch();
    const rules = paused ? [] : await loadRules();
    const { dnr, errors, matchWatch, needsReroll } = toDnrRules(rules);
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: dnr
    });
    headerMatchWatch = matchWatch;
    await setLastError(errors.length ? errors.join("\n") : null);
    await scheduleReroll(needsReroll);
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
  if (await getKillSwitch()) return;

  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return;

  const rules = await loadRules();
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
      if (r.mode === "absent") {
        const existing = await chrome.cookies.get({ url: u.origin + "/", name: r.key });
        if (existing) continue;
      }
      const value = renderTemplate(r.value ?? "", templateVars(r));
      const details = { url: u.origin + "/", name: r.key, value, path: "/" };
      const attrs = r.cookieAttrs;
      if (attrs?.sameSite) details.sameSite = attrs.sameSite;
      if (attrs?.secure) details.secure = true;
      if (attrs?.expiresInSeconds) details.expirationDate = Date.now() / 1000 + Number(attrs.expiresInSeconds);

      await chrome.cookies.set(details);
      await cookieQueue(() => recordCookie(r.id, u.origin + "/", r.key));
      await cookieQueue(() => bumpMatchCount(r.id));
    } catch (e) {
      console.warn("[CookieJab] cookie set failed", r, e);
      await setLastError(`${label(r)}: cookie was not set on ${u.host}: ${e.message || e}`);
    }
  }
}

function matchesResourceType(types, type) {
  return !types || types.includes(type);
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    for (const w of headerMatchWatch) {
      if (matchesUrl(w.pattern, details.url) && matchesResourceType(w.resourceTypes, details.type)) {
        cookieQueue(() => bumpMatchCount(w.ruleId));
      }
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REROLL_ALARM) syncDnr();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "update") {
    const { rules: localRules } = await chrome.storage.local.get("rules");
    if (Array.isArray(localRules) && localRules.length) {
      const synced = await chrome.storage.sync.get("rules");
      if (!Array.isArray(synced.rules)) await saveRules(localRules);
    }
  }
  syncDnr();
  syncBadge();
});
chrome.runtime.onStartup.addListener(() => {
  syncDnr();
  syncBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.killSwitch) {
    syncDnr();
    syncBadge();
    if (changes.killSwitch.newValue) {
      chrome.storage.local.get("appliedCookies").then(({ appliedCookies = {} }) => {
        cookieQueue(() => removeCookies(Object.keys(appliedCookies)));
      });
    }
  }

  if ((area === "sync" || area === "local") && changes.rules) {
    syncDnr();
    const oldRules = changes.rules.oldValue ?? [];
    const newRules = changes.rules.newValue ?? [];
    const ids = rulesLosingCookies(oldRules, newRules);
    cookieQueue(() => removeCookies(ids));
    cookieQueue(() => pruneMatchCounts(newRules));
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  applyCookies(details.url);
});
