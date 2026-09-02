import { parseMatchPattern, toDnrCondition } from "./match-pattern.js";

const $ = (sel) => document.querySelector(sel);

const listEl = $("#rule-list");
const emptyEl = $("#empty");
const formEl = $("#rule-form");
const formErrorEl = $("#form-error");
const lastErrorEl = $("#last-error");
const visibilityBtn = $("#visibility-btn");
const bundleFormEl = $("#bundle-form");
const bundleFormErrorEl = $("#bundle-form-error");

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

function renderBundle(name, rules) {
  const on = rules.filter((r) => r.enabled).length;
  const bundleUrl = rules.find((r) => r.bundleUrl)?.bundleUrl ?? "";
  const li = el("li", "bundle");

  const head = el("div", "bundle-head");
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
  toggle.append(checkbox);

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
  actions.append(edit, copy, del);

  head.append(toggle, el("span", "bundle-name", name), actions);

  const liBody = [head];
  if (bundleUrl) {
    const urlLine = el("div", "bundle-url", bundleUrl);
    urlLine.title = "Applies to every rule in this bundle.";
    liBody.push(urlLine);
  }

  const members = el("ul", "bundle-members");
  members.append(...rules.map(renderBundleMember));
  liBody.push(members);

  li.append(...liBody);
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
  showHint();
}

function showHint() {
  $("#f-url-hint").textContent = HINTS[$("#f-type").value] ?? HINTS.header;
}

function showForm(rule) {
  hideBundleForm();
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
