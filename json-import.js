// Parses text pasted into the JSON import screen into rule objects.
// Only structural checks run here: required fields present, and values have
// the correct primitive type. Match pattern parsing and DNR regex support
// are checked later, per rule, by the same validate() the manual rule form
// uses, before anything is committed to storage.

const TYPES = new Set(["header", "cookie"]);

export function parseImportedRules(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rules: [], errors: ["The text is not valid JSON."] };
  }
  if (!Array.isArray(parsed)) {
    return { rules: [], errors: ["The top level value must be a list of rules."] };
  }

  const rules = [];
  const errors = [];

  parsed.forEach((item, i) => {
    const label = `Rule ${i + 1}`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push(`${label} is not an object.`);
      return;
    }
    if (!TYPES.has(item.type)) {
      errors.push(`${label}: "type" must be "header" or "cookie".`);
      return;
    }
    if (typeof item.url !== "string" || !item.url.trim()) {
      errors.push(`${label}: "url" is required.`);
      return;
    }
    if (typeof item.key !== "string" || !item.key.trim()) {
      errors.push(`${label}: "key" is required.`);
      return;
    }

    rules.push({
      type: item.type,
      url: item.url,
      key: item.key,
      value: typeof item.value === "string" ? item.value : "",
      bundle: typeof item.bundle === "string" ? item.bundle : "",
      bundleUrl: typeof item.bundleUrl === "string" ? item.bundleUrl : "",
      enabled: item.enabled !== false,
      mode: typeof item.mode === "string" ? item.mode : "set",
      side: item.side === "response" ? "response" : "request",
      resourceTypes: Array.isArray(item.resourceTypes) ? item.resourceTypes : null,
      cookieAttrs: typeof item.cookieAttrs === "object" && item.cookieAttrs !== null ? item.cookieAttrs : null,
      bundleVar: typeof item.bundleVar === "object" && item.bundleVar !== null ? item.bundleVar : null
    });
  });

  return { rules, errors };
}
