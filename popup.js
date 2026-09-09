import { parseMatchPattern, matchesUrl, toDnrCondition, RESOURCE_TYPES } from "./match-pattern.js";
import { parseCurl, defaultPatternFor } from "./curl-import.js";
import { buildPrompt, parseModelOutput } from "./smart-import.js";
import { parseImportedRules } from "./json-import.js";
import { loadRules, saveRules } from "./rules-store.js";

const $ = (sel) => document.querySelector(sel);

const listEl = $("#rule-list");
const emptyEl = $("#empty");
const formEl = $("#rule-form");
const formErrorEl = $("#form-error");
const lastErrorEl = $("#last-error");
const visibilityBtn = $("#visibility-btn");
const killSwitchBtn = $("#kill-switch-btn");
const bundleFormEl = $("#bundle-form");
const bundleFormErrorEl = $("#bundle-form-error");
const importMenuEl = $("#import-menu");
const importPasteEl = $("#import-paste");
const importPreviewEl = $("#import-preview");
const importJsonEl = $("#import-json");
let importItems = [];

const TYPES = new Set(["header", "cookie"]);
const HINTS = {
  header: "scheme://host/path, * permitted. Adds the header on each match.",
  cookie: "scheme://host/path, * permitted. Sets the cookie for the whole host."
};
// RFC 7230 token. Valid for header names and cookie names.
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const MODES = {
  header: [["set", "Set", "Set / replace"], ["append", "Append", "Append"]],
  cookie: [["set", "Set", "Set / replace"], ["absent", "Absent", "Only if absent"]]
};

// A row of buttons, one selected at a time via aria-pressed, in place of a
// native <select> whose open popup list cannot be restyled to match the app.
function segValue(container) {
  return container.querySelector('button[aria-pressed="true"]')?.dataset.value ?? "";
}

function setSegValue(container, value) {
  for (const b of container.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }
}

function initSeg(container) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    setSegValue(container, btn.dataset.value);
  });
}

initSeg($("#f-mode"));
initSeg($("#f-side"));
initSeg($("#f-samesite"));

for (const t of RESOURCE_TYPES) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = t;
  label.append(checkbox, document.createTextNode(t));
  $("#f-resource-types").append(label);
}

// Clicking a checked chip a second time unchecks it, going back to
// "match every resource type", instead of a native multi-select's
// click-always-selects-only-this-one behavior.
$("#f-resource-types").addEventListener("change", (e) => {
  e.target.closest("label").classList.toggle("checked", e.target.checked);
  // Otherwise the checkbox keeps focus after a click, and the focus outline
  // sticks around instead of only showing while actually hovering.
  e.target.blur();
});

async function getRules() {
  return loadRules();
}

async function setRules(rules) {
  await saveRules(rules);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A rule with no bundle text stands alone. Older rules used "name" for
// this text; a rule keeps grouping by that text until it is saved again.
function bundleOf(r) {
  return (r.bundle ?? r.name ?? "").trim();
}

// Groups rules that share a bundle text, in the order each bundle first
// appears. A rule with no bundle text is always its own group of one.
function groupRules(rules) {
  const order = [];
  const groups = new Map();
  for (const r of rules) {
    const name = bundleOf(r);
    const key = name ? `b:${name}` : `r:${r.id}`;
    if (!groups.has(key)) {
      groups.set(key, { name: name || null, rules: [] });
      order.push(key);
    }
    groups.get(key).rules.push(r);
  }
  return order.map((key) => groups.get(key));
}

const CODES = { header: "HDR", cookie: "CKI", invalid: "INV" };
const MASK = "••••••••";
let hideValues = true;
let matchCounts = {};
let killSwitchOn = false;

// A rule looks disabled while the kill switch pauses everything, even if its
// own switch is on, but the switch itself keeps showing and controlling the
// rule's real enabled state, since that is what takes effect on resume.
function looksDisabled(r) {
  return !r.enabled || killSwitchOn;
}

function ruleRow(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const row = el("div", `rule-row ${type}` + (looksDisabled(r) ? " disabled" : ""));

  const toggle = el("label", "rule-toggle");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(r.enabled);
  checkbox.dataset.toggle = r.id;
  checkbox.setAttribute("aria-label", `${r.enabled ? "Disable" : "Enable"} ${r.key}`);
  toggle.append(checkbox);

  const body = el("div", "rule-body");
  const top = el("div", "rule-top");
  top.append(el("span", "rule-code", CODES[type]));
  const url = el("div", "rule-url" + (r.bundleUrl ? " overridden" : ""), r.url);
  url.title = r.bundleUrl ? "Not used. The bundle sets its own match pattern." : r.url;
  const kv = el("div", "rule-kv");
  const valueEl = el("span", "v", hideValues ? MASK : (r.value ?? ""));
  if (hideValues) valueEl.title = "Value hidden";
  kv.append(el("span", "k", r.key), valueEl);
  const count = matchCounts[r.id]?.count;
  if (count) {
    const countEl = el("span", "rule-count", `×${count}`);
    countEl.title = "Times this rule has matched a request.";
    kv.append(countEl);
  }
  body.append(top, url, kv);

  const actions = el("div", "rule-actions");
  const edit = el("button", "text", "edit");
  edit.type = "button";
  edit.dataset.edit = r.id;
  const copy = el("button", "text", "copy");
  copy.type = "button";
  copy.dataset.copy = r.id;
  const del = el("button", "text danger", "del");
  del.type = "button";
  del.dataset.del = r.id;
  actions.append(edit, copy, del);

  row.append(toggle, body, actions);
  return row;
}

function renderStandaloneRule(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const li = el("li", `rule type-${type}` + (looksDisabled(r) ? " disabled" : ""));
  li.append(...ruleRow(r).children);
  return li;
}

function renderBundleMember(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const li = el("li", `bundle-member type-${type}` + (looksDisabled(r) ? " disabled" : ""));
  li.append(...ruleRow(r).children);
  return li;
}

// A control inside <summary> must cancel the disclosure's own click
// behavior, or clicking it would also toggle the bundle open or shut.
// The checkbox needs its click to keep bubbling, since its own logic
// listens for "change", a separate event, so it only stops propagation.
// A button's own logic listens for "click" itself through the same
// delegated listener the disclosure would otherwise consume, so it
// cancels just the browser's default toggle action instead.
function stopSummaryToggleForCheckbox(el) {
  el.addEventListener("click", (e) => e.stopPropagation());
  return el;
}

function stopSummaryToggleForButton(el) {
  el.addEventListener("click", (e) => e.preventDefault());
  return el;
}

function renderBundle(name, rules) {
  const on = rules.filter((r) => r.enabled).length;
  const bundleUrl = rules.find((r) => r.bundleUrl)?.bundleUrl ?? "";
  const bundleVar = rules.find((r) => r.bundleVar)?.bundleVar ?? null;
  const li = el("li", "bundle");
  const details = document.createElement("details");
  details.dataset.bundle = name;
  const summary = document.createElement("summary");
  summary.className = "bundle-head";

  const chevron = el("span", "bundle-chevron", "\u25b8");

  const toggle = el("label", "rule-toggle bundle-toggle");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  if (on === rules.length) {
    checkbox.checked = true;
  } else if (on === 0) {
    checkbox.checked = false;
  } else {
    checkbox.checked = false;
    checkbox.indeterminate = true;
  }
  checkbox.dataset.bundleToggle = name;
  checkbox.setAttribute("aria-label", `${checkbox.checked ? "Disable" : "Enable"} bundle ${name}`);
  toggle.append(stopSummaryToggleForCheckbox(checkbox));

  const actions = el("div", "bundle-actions");
  const edit = el("button", "text", "edit");
  edit.type = "button";
  edit.dataset.bundleEdit = name;
  const copy = el("button", "text", "copy");
  copy.type = "button";
  copy.dataset.bundleCopy = name;
  const del = el("button", "text danger", "del");
  del.type = "button";
  del.dataset.bundleDel = name;
  actions.append(stopSummaryToggleForButton(edit), stopSummaryToggleForButton(copy), stopSummaryToggleForButton(del));

  summary.append(chevron, toggle, el("span", "bundle-name", name));
  if (bundleVar) {
    const choice = bundleVar.choices?.[bundleVar.selected];
    const pill = el("button", "bundle-var", choice?.label ?? bundleVar.name);
    pill.type = "button";
    pill.title = `Variable ${bundleVar.name}. Click to switch choices.`;
    pill.dataset.bundleVarCycle = name;
    summary.append(stopSummaryToggleForButton(pill));
  }
  summary.append(actions);

  const rest = [];
  if (bundleUrl) {
    const urlLine = el("div", "bundle-url", bundleUrl);
    urlLine.title = "Applies to every rule in this bundle.";
    rest.push(urlLine);
  }

  const members = el("ul", "bundle-members");
  members.append(...rules.map(renderBundleMember));
  rest.push(members);

  details.append(summary, ...rest);
  li.append(details);
  return li;
}

function renderGroup(g) {
  return g.name ? renderBundle(g.name, g.rules) : renderStandaloneRule(g.rules[0]);
}

async function render() {
  const rules = await getRules();
  const { lastError = null, matchCounts: counts = {} } = await chrome.storage.local.get(["lastError", "matchCounts"]);
  matchCounts = counts;
  // Every render rebuilds the list from scratch, so a bundle's <details>
  // element is a brand new node each time and defaults to closed -- carry
  // over which bundles were open before this render, by name.
  const openBundles = new Set([...listEl.querySelectorAll("details[open]")].map((d) => d.dataset.bundle));
  listEl.replaceChildren(...groupRules(rules).map(renderGroup));
  for (const details of listEl.querySelectorAll("details")) {
    if (openBundles.has(details.dataset.bundle)) details.open = true;
  }
  emptyEl.hidden = rules.length > 0;
  lastErrorEl.hidden = !lastError;
  lastErrorEl.textContent = lastError || "";
}

function applyVisibility() {
  visibilityBtn.setAttribute("aria-pressed", String(hideValues));
  visibilityBtn.title = hideValues ? "Show values" : "Hide values";
  $("#f-value").type = hideValues ? "password" : "text";
}

async function loadVisibility() {
  const { hideValues: v = true } = await chrome.storage.local.get("hideValues");
  hideValues = v;
  applyVisibility();
}

function applyKillSwitch(on) {
  killSwitchOn = on;
  killSwitchBtn.setAttribute("aria-pressed", String(on));
  killSwitchBtn.title = on ? "Resume all rules" : "Pause all rules";
}

async function loadKillSwitch() {
  const { killSwitch = false } = await chrome.storage.local.get("killSwitch");
  applyKillSwitch(killSwitch);
}

function showFormError(message) {
  formErrorEl.textContent = message || "";
  formErrorEl.hidden = !message;
}

function showBundleFormError(message) {
  bundleFormErrorEl.textContent = message || "";
  bundleFormErrorEl.hidden = !message;
}

function setType(type) {
  const modeContainer = $("#f-mode");
  const prevMode = segValue(modeContainer);
  $("#f-type").value = type;
  for (const b of document.querySelectorAll("#f-type-seg button")) {
    b.setAttribute("aria-pressed", String(b.dataset.type === type));
  }
  $("#save-btn").classList.toggle("type-header", type === "header");
  $("#save-btn").classList.toggle("type-cookie", type === "cookie");
  formEl.classList.toggle("type-header", type === "header");
  formEl.classList.toggle("type-cookie", type === "cookie");
  modeContainer.replaceChildren(...MODES[type].map(([value, label, title]) => {
    const b = el("button", null, label);
    b.type = "button";
    b.dataset.value = value;
    b.title = title;
    b.setAttribute("aria-pressed", "false");
    return b;
  }));
  setSegValue(modeContainer, MODES[type].some(([value]) => value === prevMode) ? prevMode : "set");
  showHint();
}

function showHint() {
  $("#f-url-hint").textContent = HINTS[$("#f-type").value] ?? HINTS.header;
}

function showForm(rule) {
  hideBundleForm();
  hideImportPaste();
  hideImportPreview();
  hideImportJson();
  $("#rule-id").value = rule?.id ?? "";
  $("#f-bundle").value = bundleOf(rule ?? {});
  setType(rule?.type ?? "header");
  applyVisibility();
  $("#f-url").value = rule?.url ?? "";
  $("#f-key").value = rule?.key ?? "";
  $("#f-value").value = rule?.value ?? "";
  setSegValue($("#f-mode"), rule?.mode ?? "set");
  setSegValue($("#f-side"), rule?.side === "response" ? "response" : "request");
  for (const checkbox of $("#f-resource-types").querySelectorAll("input")) {
    checkbox.checked = Boolean(rule?.resourceTypes?.includes(checkbox.value));
    checkbox.closest("label").classList.toggle("checked", checkbox.checked);
  }
  const attrs = rule?.cookieAttrs ?? {};
  setSegValue($("#f-samesite"), attrs.sameSite ?? "");
  $("#f-secure").checked = Boolean(attrs.secure);
  $("#f-expires").value = attrs.expiresInSeconds ?? "";
  const overrideEl = $("#f-url-override");
  overrideEl.hidden = !rule?.bundleUrl;
  overrideEl.textContent = rule?.bundleUrl
    ? "This rule's own pattern is not used. The bundle sets one pattern for all its rules."
    : "";
  showFormError(null);
  formEl.hidden = false;
  $("#f-bundle").focus();
}

function hideForm() {
  formEl.reset();
  $("#rule-id").value = "";
  showFormError(null);
  formEl.hidden = true;
}

function showBundleForm(name, rules) {
  hideForm();
  hideImportPaste();
  hideImportPreview();
  hideImportJson();
  $("#b-old-name").value = name;
  $("#b-name").value = name;
  $("#b-url").value = rules.find((r) => r.bundleUrl)?.bundleUrl ?? "";
  const bundleVar = rules.find((r) => r.bundleVar)?.bundleVar ?? null;
  $("#b-var-name").value = bundleVar?.name ?? "";
  $("#b-var-choices").value = bundleVar?.choices?.map((c) => `${c.label}=${c.value}`).join("\n") ?? "";
  showBundleFormError(null);
  bundleFormEl.hidden = false;
  $("#b-name").focus();
}

function hideBundleForm() {
  bundleFormEl.reset();
  showBundleFormError(null);
  bundleFormEl.hidden = true;
}

function showImportPasteError(message) {
  const el = $("#import-paste-error");
  el.textContent = message || "";
  el.hidden = !message;
}

function showImportUrlError(message) {
  const el = $("#import-url-error");
  el.textContent = message || "";
  el.hidden = !message;
}

function showImportPreviewError(message) {
  const el = $("#import-preview-error");
  el.textContent = message || "";
  el.hidden = !message;
}

function showImportPaste(mode = "curl") {
  hideForm();
  hideBundleForm();
  hideImportPreview();
  hideImportJson();
  $("#import-text").value = "";
  showImportPasteError(null);
  $("#import-paste-curl-hint").hidden = mode !== "curl";
  $("#import-paste-smart-hint").hidden = mode !== "smart";
  $("#import-parse-btn").hidden = mode !== "curl";
  smartImportBtn.hidden = mode !== "smart";
  importPasteEl.hidden = false;
  $("#import-text").focus();
}

function hideImportPaste() {
  importPasteEl.hidden = true;
  $("#import-text").value = "";
  showImportPasteError(null);
}

function importField(className, value, idx, field, type) {
  const input = document.createElement("input");
  input.className = className;
  input.value = value;
  if (type) input.type = type;
  input.dataset.importIndex = String(idx);
  input.dataset.importField = field;
  return input;
}

function renderImportItem(item, idx) {
  const li = el("li", `import-item type-${item.type}` + (item.checked ? "" : " unselected"));

  const toggle = el("label", "rule-toggle bundle-toggle");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.checked;
  checkbox.disabled = !item.validKey;
  checkbox.dataset.importIndex = String(idx);
  checkbox.setAttribute("aria-label", `${item.checked ? "Exclude" : "Include"} ${item.name}`);
  if (!item.validKey) checkbox.title = "Not imported. This name has characters that are not permitted.";
  toggle.append(checkbox);

  const kv = el("div", "rule-kv import-kv");
  kv.append(
    importField("mono import-name", item.name, idx, "name"),
    importField("mono import-value", item.value, idx, "value", hideValues ? "password" : "text")
  );

  li.append(toggle, el("span", "rule-code", CODES[item.type]), kv);
  return li;
}

function updateImportConfirmState() {
  $("#import-confirm-btn").disabled = !importItems.some((item) => item.checked);
}

// Selected items sort to the top, so what will be imported is easy to see
// at a glance. The filter narrows which items show, without discarding any.
function renderImportItems() {
  const filter = $("#import-filter").value.trim().toLowerCase();
  const rows = importItems
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !filter || item.name.toLowerCase().includes(filter))
    .sort((a, b) => Number(b.item.checked) - Number(a.item.checked));
  $("#import-items").replaceChildren(...rows.map(({ item, idx }) => renderImportItem(item, idx)));
  updateImportConfirmState();
}

// The first existing bundle whose own match pattern, or one of its
// members' patterns, already covers this url -- a plain pattern match
// against what is already on the rule list, not a guess.
function suggestBundle(rules, bundles, url) {
  if (!url) return null;
  for (const name of bundles) {
    const members = rules.filter((r) => bundleOf(r) === name);
    const bundleUrl = members.find((r) => r.bundleUrl)?.bundleUrl;
    const patterns = bundleUrl ? [bundleUrl] : members.map((r) => r.url).filter(Boolean);
    for (const p of patterns) {
      try {
        if (matchesUrl(parseMatchPattern(p), url)) return name;
      } catch {
        // A pattern that no longer parses is not a match.
      }
    }
  }
  return null;
}

async function showImportPreview(parsed, defaultUrl) {
  importItems = [
    ...parsed.headers.map((h) => ({ type: "header", name: h.name, value: h.value, checked: false, validKey: TOKEN.test(h.name) })),
    ...parsed.cookies.map((c) => ({ type: "cookie", name: c.name, value: c.value, checked: false, validKey: TOKEN.test(c.name) }))
  ];
  $("#import-filter").value = "";
  renderImportItems();

  $("#import-url").value = defaultUrl;
  showImportUrlError(null);

  const rules = await getRules();
  const bundles = [...new Set(rules.map(bundleOf).filter(Boolean))];
  const destSel = $("#import-dest");
  destSel.replaceChildren();
  const newOpt = el("option", null, "New bundle");
  newOpt.value = "";
  destSel.append(newOpt);
  for (const b of bundles) {
    const o = el("option", null, b);
    o.value = b;
    destSel.append(o);
  }
  destSel.value = suggestBundle(rules, bundles, parsed.url) ?? "";

  let host = "";
  try {
    host = new URL(parsed.url).hostname;
  } catch {
    // The paste screen already required a valid url before reaching here.
  }
  $("#import-new-name").value = host;
  updateImportDestRow();

  showImportPreviewError(null);
  importPasteEl.hidden = true;
  importPreviewEl.hidden = false;
}

function hideImportPreview() {
  importPreviewEl.hidden = true;
  showImportPreviewError(null);
  importItems = [];
}

function showJsonImportError(message) {
  const el = $("#json-import-error");
  el.textContent = message || "";
  el.hidden = !message;
}

async function showImportJson() {
  hideForm();
  hideBundleForm();
  hideImportPaste();
  hideImportPreview();
  const rules = await getRules();
  $("#json-export-text").value = JSON.stringify(rules, null, 2);
  $("#json-import-text").value = "";
  $("#json-import-replace").checked = false;
  showJsonImportError(null);
  importJsonEl.hidden = false;
}

function hideImportJson() {
  importJsonEl.hidden = true;
  showJsonImportError(null);
}

function updateImportDestRow() {
  $("#import-new-name-row").hidden = $("#import-dest").value !== "";
}

// Returns an error message when the pattern cannot back a header rule, else null.
async function checkHeaderRegexSupport(pattern) {
  if (!chrome.declarativeNetRequest?.isRegexSupported) return null;
  const { regexFilter } = toDnrCondition(pattern);
  const res = await chrome.declarativeNetRequest.isRegexSupported({ regex: regexFilter, isCaseSensitive: true });
  return res.isSupported ? null : `This pattern cannot be used for a header rule (${res.reason}).`;
}

// Returns { pattern } for a valid rule, or { error } with a message for the form.
async function validate(rule) {
  let pattern;
  try {
    pattern = parseMatchPattern(rule.url);
  } catch (e) {
    return { error: e.message };
  }
  const what = rule.type === "header" ? "Header name" : "Cookie name";
  if (!rule.key) return { error: `${what} is required.` };
  if (!TOKEN.test(rule.key)) {
    return { error: `${what} can only contain letters, digits, and !#$%&'*+-.^_\`|~` };
  }
  if (rule.type === "header") {
    const err = await checkHeaderRegexSupport(pattern);
    if (err) return { error: err };
  }
  if (rule.type === "cookie" && rule.cookieAttrs?.sameSite === "no_restriction" && !rule.cookieAttrs.secure) {
    return { error: "SameSite=None requires the Secure attribute." };
  }
  return { pattern };
}

$("#add-btn").addEventListener("click", () => {
  if (formEl.hidden) showForm(null);
  else hideForm();
});

visibilityBtn.addEventListener("click", async () => {
  hideValues = !hideValues;
  await chrome.storage.local.set({ hideValues });
  applyVisibility();
  render();
  if (!importPreviewEl.hidden) renderImportItems();
});

killSwitchBtn.addEventListener("click", async () => {
  const { killSwitch = false } = await chrome.storage.local.get("killSwitch");
  applyKillSwitch(!killSwitch);
  render();
  await chrome.storage.local.set({ killSwitch: !killSwitch });
  // This button is never rebuilt by render(), unlike almost every other
  // button in the popup, so it would otherwise keep Chrome's persistent
  // post-click focus ring showing after the click.
  killSwitchBtn.blur();
});

function hideImportMenu() {
  importMenuEl.hidden = true;
  $("#import-btn").setAttribute("aria-expanded", "false");
  $("#import-btn").blur();
}

$("#import-btn").addEventListener("click", () => {
  const open = importMenuEl.hidden;
  importMenuEl.hidden = !open;
  $("#import-btn").setAttribute("aria-expanded", String(open));
  $("#import-btn").blur();
});

document.addEventListener("click", (e) => {
  if (!importMenuEl.hidden && !e.target.closest(".split-btn")) hideImportMenu();
});

$("#import-curl-btn").addEventListener("click", () => {
  hideImportMenu();
  showImportPaste("curl");
});

const smartImportMenuBtn = $("#import-smart-menu-btn");
if (typeof LanguageModel !== "undefined") smartImportMenuBtn.hidden = false;

smartImportMenuBtn.addEventListener("click", () => {
  hideImportMenu();
  showImportPaste("smart");
});

$("#import-json-btn").addEventListener("click", async () => {
  hideImportMenu();
  await showImportJson();
});

$("#import-paste-btn").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) $("#import-text").value = text;
  } catch {
    // Clipboard access was not available. The user can paste with the keyboard instead.
  }
});

$("#import-paste-cancel-btn").addEventListener("click", hideImportPaste);

// Shared by the deterministic curl parser and smart import: both produce
// the same { url, headers, cookies } shape for the same review screen.
function finishParse(parsed) {
  if (!parsed.headers.length && !parsed.cookies.length) {
    showImportPasteError("No headers or cookies were found in that text.");
    return false;
  }
  // A missing match pattern is only a problem at Import time, not here --
  // the preview screen's own field lets the user type or fix one by hand.
  showImportPreview(parsed, defaultPatternFor(parsed.url ?? ""));
  return true;
}

$("#import-parse-btn").addEventListener("click", () => {
  finishParse(parseCurl($("#import-text").value));
});

const smartImportBtn = $("#import-smart-btn");
const SMART_IMPORT_LABEL = "Smart import";

function setSmartImportBusy(busy) {
  smartImportBtn.disabled = busy;
  if (busy) smartImportBtn.replaceChildren(el("span", "spinner"), document.createTextNode("Analyzing…"));
  else smartImportBtn.textContent = SMART_IMPORT_LABEL;
}

smartImportBtn.addEventListener("click", async () => {
  const text = $("#import-text").value;
  if (!text.trim()) {
    showImportPasteError("Paste something to analyze first.");
    return;
  }
  showImportPasteError(null);
  // Whether the model still needs a one-time install is Chrome's business,
  // not the user's -- show the same busy state either way, never mention a
  // download or a percentage.
  setSmartImportBusy(true);
  try {
    // Both calls need the same language expectations: availability() checks
    // whether this device supports the model for that language, and
    // create() is refused (or warns, per the console error this fixed) when
    // called without it.
    const languageOptions = {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    };
    const availability = await LanguageModel.availability(languageOptions);
    if (availability === "unavailable") {
      showImportPasteError("On-device AI is not available on this device.");
      return;
    }
    const session = await LanguageModel.create(languageOptions);
    try {
      const raw = await session.prompt(buildPrompt(text));
      const { parsed, error } = parseModelOutput(raw);
      if (error || !parsed) {
        showImportPasteError(error || "The model did not return anything usable.");
        return;
      }
      finishParse(parsed);
    } finally {
      session.destroy?.();
    }
  } catch (e) {
    showImportPasteError(`Smart import failed: ${e.message || e}`);
  } finally {
    setSmartImportBusy(false);
    smartImportBtn.blur();
  }
});

$("#import-items").addEventListener("change", (e) => {
  const idx = e.target.dataset.importIndex;
  if (idx === undefined || e.target.type !== "checkbox") return;
  importItems[Number(idx)].checked = e.target.checked;
  renderImportItems();
});

// Edits patch the item state and the checkbox in place, so the field the
// user is typing in is never replaced and never loses focus mid-keystroke.
$("#import-items").addEventListener("input", (e) => {
  const idx = e.target.dataset.importIndex;
  const field = e.target.dataset.importField;
  if (idx === undefined || !field) return;
  const item = importItems[Number(idx)];
  item[field] = e.target.value;
  if (field === "name") {
    item.validKey = TOKEN.test(item.name);
    if (!item.validKey) item.checked = false;
    const row = e.target.closest(".import-item");
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.checked = item.checked;
    checkbox.disabled = !item.validKey;
    checkbox.title = item.validKey ? "" : "Not imported. This name has characters that are not permitted.";
    row.classList.toggle("unselected", !item.checked);
    updateImportConfirmState();
  }
});

$("#import-filter").addEventListener("input", renderImportItems);

$("#import-dest").addEventListener("change", updateImportDestRow);

$("#import-back-btn").addEventListener("click", () => {
  importPreviewEl.hidden = true;
  importPasteEl.hidden = false;
  $("#import-text").focus();
});

$("#import-confirm-btn").addEventListener("click", async () => {
  let pattern;
  try {
    pattern = parseMatchPattern($("#import-url").value.trim());
  } catch (e) {
    showImportUrlError(e.message);
    return;
  }
  showImportUrlError(null);

  const selected = importItems.filter((item) => item.checked && item.validKey);
  if (!selected.length) {
    showImportPreviewError("Select at least one item to import.");
    return;
  }

  if (selected.some((item) => item.type === "header")) {
    const err = await checkHeaderRegexSupport(pattern);
    if (err) {
      showImportPreviewError(err);
      return;
    }
  }

  const rules = await getRules();
  const destValue = $("#import-dest").value;
  let bundle;
  let bundleUrl = "";
  if (destValue) {
    bundle = destValue;
    bundleUrl = rules.find((r) => bundleOf(r) === bundle && r.bundleUrl)?.bundleUrl ?? "";
  } else {
    bundle = $("#import-new-name").value.trim();
    if (!bundle) {
      showImportPreviewError("Bundle name is required.");
      return;
    }
  }

  const created = selected.map((item) => ({
    id: crypto.randomUUID(),
    enabled: true,
    bundle,
    bundleUrl,
    type: item.type,
    url: pattern.canonical,
    key: item.name,
    value: item.value
  }));

  await setRules([...rules, ...created]);
  hideImportPaste();
  hideImportPreview();
  render();
});

$("#json-export-copy-btn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#json-export-text").value);
  } catch {
    // Clipboard access was not available. The text is still selectable by hand.
  }
});

$("#json-export-download-btn").addEventListener("click", () => {
  const blob = new Blob([$("#json-export-text").value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cookiejab-rules.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("#json-import-cancel-btn").addEventListener("click", hideImportJson);

$("#json-import-btn").addEventListener("click", async () => {
  const { rules: parsedRules, errors } = parseImportedRules($("#json-import-text").value);
  if (errors.length) {
    showJsonImportError(errors.join("\n"));
    return;
  }
  if (!parsedRules.length) {
    showJsonImportError("No rules were found in that text.");
    return;
  }

  for (const r of parsedRules) {
    const { pattern, error } = await validate(r);
    if (error) {
      showJsonImportError(`${r.key || r.url}: ${error}`);
      return;
    }
    r.url = pattern.canonical;
  }

  const existing = $("#json-import-replace").checked ? [] : await getRules();
  const imported = parsedRules.map((r) => ({ ...r, id: crypto.randomUUID() }));
  await setRules([...existing, ...imported]);
  hideImportJson();
  render();
});

$("#cancel-btn").addEventListener("click", hideForm);
$("#bundle-cancel-btn").addEventListener("click", hideBundleForm);
$("#f-type").addEventListener("change", showHint);

for (const b of document.querySelectorAll("#f-type-seg button")) {
  b.addEventListener("click", () => setType(b.dataset.type));
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#rule-id").value;
  const bundle = $("#f-bundle").value.trim();
  const rules = await getRules();
  const bundleUrl = bundle
    ? (rules.find((r) => r.id !== id && bundleOf(r) === bundle && r.bundleUrl)?.bundleUrl ?? "")
    : "";
  const bundleVar = bundle
    ? (rules.find((r) => r.id !== id && bundleOf(r) === bundle && r.bundleVar)?.bundleVar ?? null)
    : null;
  const type = TYPES.has($("#f-type").value) ? $("#f-type").value : "header";
  const resourceTypes = [...$("#f-resource-types").querySelectorAll("input:checked")].map((c) => c.value);
  const sameSite = segValue($("#f-samesite"));
  const secure = $("#f-secure").checked;
  const expiresInSeconds = $("#f-expires").value ? Number($("#f-expires").value) : null;
  const cookieAttrs = sameSite || secure || expiresInSeconds ? { sameSite: sameSite || null, secure, expiresInSeconds } : null;

  const rule = {
    id: id || crypto.randomUUID(),
    enabled: true,
    bundle,
    bundleUrl,
    bundleVar,
    type,
    url: $("#f-url").value.trim(),
    key: $("#f-key").value.trim(),
    value: $("#f-value").value,
    mode: segValue($("#f-mode")),
    side: type === "header" ? segValue($("#f-side")) : "request",
    resourceTypes: type === "header" && resourceTypes.length ? resourceTypes : null,
    cookieAttrs: type === "cookie" ? cookieAttrs : null
  };

  const { pattern, error } = await validate(rule);
  if (error) {
    showFormError(error);
    return;
  }
  rule.url = pattern.canonical;

  if (id) {
    const i = rules.findIndex((r) => r.id === id);
    if (i >= 0) {
      rule.enabled = rules[i].enabled;
      rules[i] = rule;
    } else {
      rules.push(rule);
    }
  } else {
    rules.push(rule);
  }
  await setRules(rules);
  hideForm();
  render();
});

bundleFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const oldName = $("#b-old-name").value;
  const newName = $("#b-name").value.trim();
  if (!newName) {
    showBundleFormError("Bundle name is required.");
    return;
  }

  const rules = await getRules();
  const members = rules.filter((r) => bundleOf(r) === oldName);

  let bundleUrl = "";
  const urlText = $("#b-url").value.trim();
  if (urlText) {
    let pattern;
    try {
      pattern = parseMatchPattern(urlText);
    } catch (e) {
      showBundleFormError(e.message);
      return;
    }
    if (members.some((r) => r.type === "header")) {
      const err = await checkHeaderRegexSupport(pattern);
      if (err) {
        showBundleFormError(err);
        return;
      }
    }
    bundleUrl = pattern.canonical;
  }

  const varName = $("#b-var-name").value.trim();
  let bundleVar = null;
  if (varName) {
    const choices = $("#b-var-choices").value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        return idx > 0 ? { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() } : null;
      })
      .filter(Boolean);
    if (!choices.length) {
      showBundleFormError("Add at least one choice, as label=value.");
      return;
    }
    const prevVar = members.find((r) => r.bundleVar)?.bundleVar;
    const selected = prevVar && prevVar.name === varName && prevVar.selected < choices.length ? prevVar.selected : 0;
    bundleVar = { name: varName, choices, selected };
  }

  for (const r of members) {
    r.bundle = newName;
    r.bundleUrl = bundleUrl;
    r.bundleVar = bundleVar;
  }
  await setRules(rules);
  hideBundleForm();
  render();
});

listEl.addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const copyId = e.target.dataset.copy;
  const delId = e.target.dataset.del;
  const bundleEdit = e.target.dataset.bundleEdit;
  const bundleCopy = e.target.dataset.bundleCopy;
  const bundleDel = e.target.dataset.bundleDel;
  const bundleVarCycle = e.target.dataset.bundleVarCycle;

  if (editId) {
    const rules = await getRules();
    showForm(rules.find((r) => r.id === editId));
  } else if (copyId) {
    const rules = await getRules();
    const r = rules.find((x) => x.id === copyId);
    if (r) showForm({ ...r, id: "" });
  } else if (delId) {
    const rules = (await getRules()).filter((r) => r.id !== delId);
    await setRules(rules);
    render();
  } else if (bundleEdit) {
    const rules = await getRules();
    showBundleForm(bundleEdit, rules.filter((r) => bundleOf(r) === bundleEdit));
  } else if (bundleCopy) {
    const rules = await getRules();
    const members = rules.filter((r) => bundleOf(r) === bundleCopy);
    if (!members.length) return;
    const used = new Set(rules.map(bundleOf).filter(Boolean));
    let newName = `${bundleCopy} copy`;
    let n = 2;
    while (used.has(newName)) newName = `${bundleCopy} copy ${n++}`;
    const copies = members.map((r) => ({ ...r, id: crypto.randomUUID(), bundle: newName }));
    await setRules([...rules, ...copies]);
    render();
  } else if (bundleDel) {
    const rules = (await getRules()).filter((r) => bundleOf(r) !== bundleDel);
    await setRules(rules);
    render();
  } else if (bundleVarCycle) {
    const rules = await getRules();
    const members = rules.filter((r) => bundleOf(r) === bundleVarCycle && r.bundleVar);
    const bundleVar = members[0]?.bundleVar;
    if (bundleVar?.choices?.length) {
      const selected = (bundleVar.selected + 1) % bundleVar.choices.length;
      for (const r of members) r.bundleVar = { ...r.bundleVar, selected };
      await setRules(rules);
      render();
    }
  }
});

listEl.addEventListener("change", async (e) => {
  const toggleId = e.target.dataset.toggle;
  const bundleName = e.target.dataset.bundleToggle;
  if (toggleId) {
    const rules = await getRules();
    const r = rules.find((x) => x.id === toggleId);
    if (r) {
      r.enabled = e.target.checked;
      await setRules(rules);
      render();
    }
  } else if (bundleName) {
    const rules = await getRules();
    for (const r of rules) {
      if (bundleOf(r) === bundleName) r.enabled = e.target.checked;
    }
    await setRules(rules);
    render();
  }
});

// The service worker writes lastError, matchCounts, and rules (on sync from
// another device or a fallback save) outside of this popup's own writes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.lastError || changes.matchCounts)) render();
  if (area === "local" && changes.killSwitch) {
    applyKillSwitch(changes.killSwitch.newValue ?? false);
    render();
  }
  if ((area === "sync" || area === "local") && changes.rules) render();
});

loadVisibility();
loadKillSwitch().then(render);
