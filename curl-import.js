// Parses a curl command copied from a browser or a terminal into the
// headers, cookies, and url that CookieJab can import as rules.

// Splits a shell command into words. Supports single quotes, double quotes
// with backslash escapes, backslash escapes outside quotes, and a
// backslash-newline line continuation, which covers the commands that
// browsers produce with "Copy as cURL".
export function tokenizeShellCommand(input) {
  const tokens = [];
  let cur = "";
  let hasCur = false;
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    if (inSingle) {
      if (c === "'") inSingle = false;
      else cur += c;
      i++;
      continue;
    }

    if (inDouble) {
      if (c === '"') {
        inDouble = false;
      } else if (c === "\\" && '"\\$`\n'.includes(input[i + 1] ?? "")) {
        cur += input[i + 1];
        i++;
      } else {
        cur += c;
      }
      i++;
      continue;
    }

    if (c === "'") {
      inSingle = true;
      hasCur = true;
      i++;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      hasCur = true;
      i++;
      continue;
    }
    if (c === "\\") {
      if (input[i + 1] === "\n") {
        i += 2;
        continue;
      }
      if (input[i + 1] === "\r" && input[i + 2] === "\n") {
        i += 3;
        continue;
      }
      if (i + 1 < input.length) {
        cur += input[i + 1];
        hasCur = true;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      if (hasCur) {
        tokens.push(cur);
        cur = "";
        hasCur = false;
      }
      i++;
      continue;
    }

    cur += c;
    hasCur = true;
    i++;
  }
  if (hasCur) tokens.push(cur);
  return tokens;
}

// Flags that take the following token as their argument. Every other flag
// that starts with "-" is treated as a boolean flag, for example -s or -L.
const FLAG_WITH_ARG = new Set([
  "-H", "--header",
  "-b", "--cookie",
  "-X", "--request",
  "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode",
  "-A", "--user-agent",
  "-e", "--referer",
  "-u", "--user",
  "-o", "--output",
  "--url"
]);

// Headers that a browser adds on every request. They rarely carry a secret,
// so an import screen unchecks them by default without hiding them.
export const NOISY_HEADERS = new Set([
  "host", "content-length", "content-type", "connection", "accept",
  "accept-encoding", "accept-language", "user-agent", "origin", "referer",
  "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user",
  "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
  "upgrade-insecure-requests", "dnt", "pragma", "cache-control", "te", "priority"
]);

/**
 * Parses a curl command into { url, headers, cookies }.
 * headers and cookies are arrays of { name, value }. A Cookie header and a
 * -b or --cookie flag both feed the cookies array, split on ";".
 */
export function parseCurl(text) {
  const tokens = tokenizeShellCommand(text.trim());
  let i = tokens[0] === "curl" ? 1 : 0;

  let url = null;
  const headers = [];
  let cookieText = "";

  const addCookieText = (value) => {
    cookieText += (cookieText ? "; " : "") + value;
  };

  for (; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === "--url") {
      url = tokens[++i] ?? url;
      continue;
    }
    if (t === "-H" || t === "--header") {
      const h = tokens[++i] ?? "";
      const idx = h.indexOf(":");
      if (idx > 0) {
        const name = h.slice(0, idx).trim();
        const value = h.slice(idx + 1).trim();
        if (name.toLowerCase() === "cookie") addCookieText(value);
        else headers.push({ name, value });
      }
      continue;
    }
    if (t === "-b" || t === "--cookie") {
      const v = tokens[++i] ?? "";
      if (v.includes("=")) addCookieText(v);
      continue;
    }
    if (t === "-A" || t === "--user-agent") {
      headers.push({ name: "User-Agent", value: tokens[++i] ?? "" });
      continue;
    }
    if (t === "-e" || t === "--referer") {
      headers.push({ name: "Referer", value: tokens[++i] ?? "" });
      continue;
    }
    if (FLAG_WITH_ARG.has(t)) {
      i++;
      continue;
    }
    if (t.startsWith("-")) continue;
    if (!url) {
      url = t;
      continue;
    }
  }

  const cookies = [];
  if (cookieText) {
    for (const pair of cookieText.split(";")) {
      const idx = pair.indexOf("=");
      if (idx > 0) cookies.push({ name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() });
    }
  }

  return { url, headers, cookies };
}

/** Builds a starting match pattern from a url: every path on that host. */
export function defaultPatternFor(url) {
  try {
    return `*://${new URL(url).hostname}/*`;
  } catch {
    return "";
  }
}
