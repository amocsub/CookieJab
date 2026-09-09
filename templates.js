// Substitutes {{token}} placeholders in a rule value.
// Built-in tokens: random, timestamp, uuid. Any other token is looked up in vars,
// for example a bundle variable name. An unrecognized token is left untouched.

const TOKEN = /\{\{([A-Za-z0-9_-]+)\}\}/g;

export function renderTemplate(value, vars = {}) {
  if (typeof value !== "string" || !value.includes("{{")) return value;
  return value.replace(TOKEN, (whole, name) => {
    if (name === "random") return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    if (name === "timestamp") return String(Date.now());
    if (name === "uuid") return crypto.randomUUID();
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    return whole;
  });
}
