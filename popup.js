import { parseMatchPattern, toDnrCondition } from "./match-pattern.js";

const $ = (sel) => document.querySelector(sel);

const listEl = $("#rule-list");
const emptyEl = $("#empty");
const formEl = $("#rule-form");
const formErrorEl = $("#form-error");
const lastErrorEl = $("#last-error");

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

const CODES = { header: "HDR", cookie: "CKI", invalid: "INV" };

function renderRule(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const li = el("li", `rule type-${type}` + (r.enabled ? "" : " disabled"));

  const toggle = el("label", "rule-toggle");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(r.enabled);
  checkbox.dataset.toggle = r.id;
  checkbox.setAttribute("aria-label", `${r.enabled ? "Disable" : "Enable"} ${r.name || r.key}`);
  toggle.append(checkbox);

  const body = el("div", "rule-body");
  const top = el("div", "rule-top");
  top.append(el("span", "rule-code", CODES[type]), el("span", "rule-name", r.name || "(unnamed)"));
  const url = el("div", "rule-url", r.url);
  url.title = r.url;
  const kv = el("div", "rule-kv");
  kv.append(el("span", "k", r.key), el("span", "v", r.value ?? ""));
  body.append(top, url, kv);

  const actions = el("div", "rule-actions");
  const edit = el("button", "text", "edit");
  edit.type = "button";
  edit.dataset.edit = r.id;
  const del = el("button", "text danger", "del");
  del.type = "button";
  del.dataset.del = r.id;
  actions.append(edit, del);

  li.append(toggle, body, actions);
  return li;
}

async function render() {
  const { rules = [], lastError = null } = await chrome.storage.local.get(["rules", "lastError"]);
  listEl.replaceChildren(...rules.map(renderRule));
  emptyEl.hidden = rules.length > 0;
  lastErrorEl.hidden = !lastError;
  lastErrorEl.textContent = lastError || "";
}

function showFormError(message) {
  formErrorEl.textContent = message || "";
  formErrorEl.hidden = !message;
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
  $("#rule-id").value = rule?.id ?? "";
  $("#f-name").value = rule?.name ?? "";
  setType(rule?.type ?? "header");
  $("#f-url").value = rule?.url ?? "";
  $("#f-key").value = rule?.key ?? "";
  $("#f-value").value = rule?.value ?? "";
  showFormError(null);
  formEl.hidden = false;
  $("#f-name").focus();
}

function hideForm() {
  formEl.reset();
  $("#rule-id").value = "";
  showFormError(null);
  formEl.hidden = true;
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
  if (rule.type === "header" && chrome.declarativeNetRequest?.isRegexSupported) {
    const { regexFilter } = toDnrCondition(pattern);
    const res = await chrome.declarativeNetRequest.isRegexSupported({ regex: regexFilter, isCaseSensitive: true });
    if (!res.isSupported) return { error: `This pattern cannot be used for a header rule (${res.reason}).` };
  }
  return { pattern };
}

$("#add-btn").addEventListener("click", () => {
  if (formEl.hidden) showForm(null);
  else hideForm();
});

$("#cancel-btn").addEventListener("click", hideForm);
$("#f-type").addEventListener("change", showHint);

for (const b of document.querySelectorAll("#rule-form .seg button")) {
  b.addEventListener("click", () => setType(b.dataset.type));
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#rule-id").value;
  const rule = {
    id: id || crypto.randomUUID(),
    enabled: true,
    name: $("#f-name").value.trim(),
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

  const rules = await getRules();
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

listEl.addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) {
    const rules = await getRules();
    showForm(rules.find((r) => r.id === editId));
  } else if (delId) {
    const rules = (await getRules()).filter((r) => r.id !== delId);
    await setRules(rules);
    render();
  }
});

listEl.addEventListener("change", async (e) => {
  const toggleId = e.target.dataset.toggle;
  if (!toggleId) return;
  const rules = await getRules();
  const r = rules.find((x) => x.id === toggleId);
  if (r) {
    r.enabled = e.target.checked;
    await setRules(rules);
    render();
  }
});

// The service worker writes lastError after each sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastError) render();
});

render();
