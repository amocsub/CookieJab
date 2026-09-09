// Rules live in chrome.storage.sync when possible, so a rule set follows the
// user across devices signed into the same Chrome profile. chrome.storage.sync
// caps each stored value at 8 KB and the whole store at about 100 KB, so a
// write that does not fit, or a browser with sync unavailable, falls back to
// chrome.storage.local instead, and sets "rulesSyncFallback" so the popup can
// show a banner. The local copy is never deleted on a later successful sync
// write, only ignored, since removing it would fire a spurious storage change
// that looks like every cookie rule was deleted.
//
// Every other key CookieJab stores -- matchCounts, appliedCookies, lastError,
// killSwitch, hideValues -- stays local-only, since none of them need to
// follow the user and some of them write far too often for the write-rate
// limit chrome.storage.sync enforces.

export async function loadRules() {
  const synced = await chrome.storage.sync.get("rules");
  if (Array.isArray(synced.rules)) return synced.rules;
  const local = await chrome.storage.local.get("rules");
  return Array.isArray(local.rules) ? local.rules : [];
}

export async function saveRules(rules) {
  try {
    await chrome.storage.sync.set({ rules });
    await chrome.storage.local.set({ rulesSyncFallback: false });
  } catch (e) {
    console.warn("[CookieJab] rules did not fit in synced storage", e);
    await chrome.storage.local.set({ rules, rulesSyncFallback: true });
  }
}
