import { parseMatchPattern, toDnrCondition } from "./match-pattern.js";

const $ = (sel) => document.querySelector(sel);

const listEl = $("#rule-list");
const emptyEl = $("#empty");
const formEl = $("#rule-form");
const formErrorEl = $("#form-error");
const lastErrorEl = $("#last-error");

const TYPES = new Set(["header", "cookie"]);
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

function renderRule(r) {
  const type = TYPES.has(r.type) ? r.type : "invalid";
  const li = el("li", "rule" + (r.enabled ? "" : " disabled"));

  const toggle = el("label", "switch");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(r.enabled);
  checkbox.dataset.toggle = r.id;
  toggle.append(checkbox, el("span", "slider"));

  const body = el("div", "rule-body");
  const top = el("div", "rule-top");
  top.append(el("span", "tag " + type, type), el("span", "rule-name", r.name || "(unnamed)"));
  const url = el("div", "rule-url", r.url);
  url.title = r.url;
  const kv = el("div", "rule-kv");
  kv.append(el("span", "k", r.key), `: ${r.value ?? ""}`);
  body.append(top, url, kv);

  const actions = el("div", "rule-actions");
  const edit = el("button", "icon-btn", "✎");
  edit.title = "Edit";
  edit.dataset.edit = r.id;
  const del = el("button", "icon-btn danger", "\u{1F5D1}");
  del.title = "Delete";
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

function showForm(rule) {
  $("#rule-id").value = rule?.id ?? "";
  $("#f-name").value = rule?.name ?? "";
  $("#f-type").value = rule?.type ?? "header";
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
