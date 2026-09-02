// Match pattern parsing shared by the popup and the service worker.
// The grammar follows Chrome extension match patterns: <scheme>://<host>[:port]/<path>.
// The path part is matched against the URL path plus query string, as Chrome does.

const SCHEMES = new Set(["*", "http", "https"]);

export const RESOURCE_TYPES = [
  "main_frame", "sub_frame", "stylesheet", "script", "image", "font",
  "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "other"
];

const RE2_META = /[\\^$.|?*+()[\]{}]/g;

function escapeRegex(s) {
  return s.replace(RE2_META, "\\$&");
}

// Turn a glob where `*` matches any run of characters into a regex fragment.
function globToRegex(glob) {
  return glob.split("*").map(escapeRegex).join(".*");
}

/**
 * Parse a match pattern into its parts.
 * Accepts `<all_urls>`, a full pattern, or a bare host with an optional path.
 * Throws an Error with a message suitable for the UI when the pattern is invalid.
 */
export function parseMatchPattern(input) {
  let s = String(input ?? "").trim();
  if (!s) throw new Error("URL pattern is required.");
  if (s === "<all_urls>") s = "*://*/*";
  if (!s.includes("://")) s = "*://" + s;

  const schemeEnd = s.indexOf("://");
  const scheme = s.slice(0, schemeEnd).toLowerCase();
  if (!SCHEMES.has(scheme)) {
    throw new Error(`Scheme "${scheme}" is not supported. Use *, http, or https.`);
  }

  const rest = s.slice(schemeEnd + 3);
  const slash = rest.indexOf("/");
  let hostPort = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "/*" : rest.slice(slash);

  if (hostPort.startsWith("[")) throw new Error("IPv6 hosts are not supported.");

  let port = null;
  const colon = hostPort.indexOf(":");
  if (colon !== -1) {
    port = hostPort.slice(colon + 1);
    hostPort = hostPort.slice(0, colon);
    if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) {
      throw new Error(`Port "${port}" is not valid.`);
    }
  }

  let host = hostPort.toLowerCase();
  if (!host) throw new Error("Host is required.");

  if (host !== "*") {
    let wildcard = false;
    if (host.startsWith("*.")) {
      wildcard = true;
      host = host.slice(2);
    }
    if (host.includes("*")) {
      throw new Error("In the host, * is only allowed as the first label, for example *.example.com.");
    }
    if (!host) throw new Error("Host is required.");
    let u;
    try {
      u = new URL("http://" + host + "/");
    } catch {
      throw new Error(`Host "${host}" is not valid.`);
    }
    const clean = u.username === "" && u.password === "" && u.port === "" &&
      u.pathname === "/" && u.search === "" && u.hash === "";
    if (!clean) throw new Error(`Host "${host}" is not valid.`);
    host = wildcard ? "*." + u.hostname : u.hostname;
  }

  const canonical = `${scheme}://${host}${port ? ":" + port : ""}${path}`;
  return { scheme, host, port, path, canonical };
}

/** Return true when `url` matches the parsed pattern. */
export function matchesUrl(pattern, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const proto = u.protocol.slice(0, -1);
  if (pattern.scheme === "*") {
    if (proto !== "http" && proto !== "https") return false;
  } else if (proto !== pattern.scheme) {
    return false;
  }

  if (pattern.host !== "*") {
    if (pattern.host.startsWith("*.")) {
      const base = pattern.host.slice(2);
      if (u.hostname !== base && !u.hostname.endsWith("." + base)) return false;
    } else if (u.hostname !== pattern.host) {
      return false;
    }
  }

  if (pattern.port) {
    const urlPort = u.port || (proto === "https" ? "443" : "80");
    if (urlPort !== pattern.port) return false;
  }

  const rx = new RegExp("^" + globToRegex(pattern.path) + "$");
  return rx.test(u.pathname + u.search);
}

/** Build a declarativeNetRequest rule condition equivalent to the parsed pattern. */
export function toDnrCondition(pattern) {
  const scheme = pattern.scheme === "*" ? "https?" : pattern.scheme;

  let host;
  if (pattern.host === "*") {
    host = "[^/:?#@]+";
  } else if (pattern.host.startsWith("*.")) {
    host = "(?:[^/:?#@]+\\.)?" + escapeRegex(pattern.host.slice(2));
  } else {
    host = escapeRegex(pattern.host);
  }

  let port;
  if (!pattern.port) {
    port = "(?::\\d+)?";
  } else if (pattern.port === "80" || pattern.port === "443") {
    // Chrome drops default ports from canonical URLs.
    port = "(?::" + pattern.port + ")?";
  } else {
    port = ":" + pattern.port;
  }

  const path = globToRegex(pattern.path);
  const end = pattern.path.endsWith("*") ? "" : "$";
  const regexFilter = "^" + scheme + "://" + host + port + path + end;

  const condition = { regexFilter, isUrlFilterCaseSensitive: true, resourceTypes: RESOURCE_TYPES };
  if (pattern.host !== "*") {
    condition.requestDomains = [pattern.host.replace(/^\*\./, "")];
  }
  return condition;
}
