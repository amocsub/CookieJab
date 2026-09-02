import { parseMatchPattern, toDnrCondition } from "./match-pattern.js";
import { parseCurl, defaultPatternFor } from "./curl-import.js";

const $ = (sel) => document.querySelector(sel);

const listEl = $("#rule-list");
const emptyEl = $("#empty");
const formEl = $("#rule-form");
const formErrorEl = $("#form-error");
const lastErrorEl = $("#last-error");
const visibilityBtn = $("#visibility-btn");
const bundleFormEl = $("#bundle-form");
const bundleFormErrorEl = $("#bundle-form-error");
const importPasteEl = $("#import-paste");
const importPreviewEl = $("#import-preview");
let importItems = [];

const TYPES = new Set(["header", "cookie"]);
const HINTS = {
  header: "scheme://host/path, * permitted. Adds the header on each match.",
  cookie: "scheme://host/path, * permitted. Sets the cookie for the whole host."
};
// RFC 7230 token. Valid for header names and cookie names.
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

async function getRules() {
  const { rules = [] } = await chrome.storage.local.get("rules");
  return rules;
}

async function setRules(rules) {
  await chrome.storage.local.set({ rules });
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

function ruleRow(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const row = el("div", `rule-row ${type}` + (r.enabled ? "" : " disabled"));

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
  const li = el("li", `rule type-${type}` + (r.enabled ? "" : " disabled"));
  li.append(...ruleRow(r).children);
  return li;
}

function renderBundleMember(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const li = el("li", `bundle-member type-${type}` + (r.enabled ? "" : " disabled"));
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
  const li = el("li", "bundle");
  const details = document.createElement("details");
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

  summary.append(chevron, toggle, el("span", "bundle-name", name), actions);

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
  const { rules = [], lastError = null } = await chrome.storage.local.get(["rules", "lastError"]);
  listEl.replaceChildren(...groupRules(rules).map(renderGroup));
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

function showFormError(message) {
  formErrorEl.textContent = message || "";
  formErrorEl.hidden = !message;
}

function showBundleFormError(message) {
  bundleFormErrorEl.textContent = message || "";
  bundleFormErrorEl.hidden = !message;
}

function setType(type) {
  $("#f-type").value = type;
  for (const b of document.querySelectorAll("#rule-form .seg button")) {
    b.setAttribute("aria-pressed", String(b.dataset.type === type));
  }
  $("#save-btn").classList.toggle("type-header", type === "header");
  $("#save-btn").classList.toggle("type-cookie", type === "cookie");
  formEl.classList.toggle("type-header", type === "header");
  formEl.classList.toggle("type-cookie", type === "cookie");
  showHint();
}

function showHint() {
  $("#f-url-hint").textContent = HINTS[$("#f-type").value] ?? HINTS.header;
}

function showForm(rule) {
  hideBundleForm();
  hideImportPaste();
  hideImportPreview();
  $("#rule-id").value = rule?.id ?? "";
  $("#f-bundle").value = bundleOf(rule ?? {});
  setType(rule?.type ?? "header");
  applyVisibility();
  $("#f-url").value = rule?.url ?? "";
  $("#f-key").value = rule?.key ?? "";
  $("#f-value").value = rule?.value ?? "";
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
  $("#b-old-name").value = name;
  $("#b-name").value = name;
  $("#b-url").value = rules.find((r) => r.bundleUrl)?.bundleUrl ?? "";
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

function showImportPaste() {
  hideForm();
  hideBundleForm();
  hideImportPreview();
  $("#import-text").value = "";
  showImportPasteError(null);
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
  destSel.value = "";

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

$("#import-btn").addEventListener("click", () => {
  if (!importPasteEl.hidden || !importPreviewEl.hidden) {
    hideImportPaste();
    hideImportPreview();
  } else {
    showImportPaste();
  }
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

$("#import-parse-btn").addEventListener("click", () => {
  const parsed = parseCurl($("#import-text").value);
  const pattern = defaultPatternFor(parsed.url ?? "");
  if (!pattern) {
    showImportPasteError("No web address was found in that text.");
    return;
  }
  if (!parsed.headers.length && !parsed.cookies.length) {
    showImportPasteError("No headers or cookies were found in that command.");
    return;
  }
  showImportPreview(parsed, pattern);
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

$("#cancel-btn").addEventListener("click", hideForm);
$("#bundle-cancel-btn").addEventListener("click", hideBundleForm);
$("#f-type").addEventListener("change", showHint);

for (const b of document.querySelectorAll("#rule-form .seg button")) {
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
  const rule = {
    id: id || crypto.randomUUID(),
    enabled: true,
    bundle,
    bundleUrl,
    type: TYPES.has($("#f-type").value) ? $("#f-type").value : "header",
    url: $("#f-url").value.trim(),
    key: $("#f-key").value.trim(),
    value: $("#f-value").value
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

  for (const r of members) {
    r.bundle = newName;
    r.bundleUrl = bundleUrl;
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

// The service worker writes lastError after each sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastError) render();
});

loadVisibility();
render();
