import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMatchPattern, matchesUrl, toDnrCondition } from "../match-pattern.js";

// Mirror how the service worker would evaluate a regexFilter against a URL.
function dnrMatches(pattern, url) {
  const { regexFilter } = toDnrCondition(parseMatchPattern(pattern));
  return new RegExp(regexFilter).test(url);
}

function both(pattern, url) {
  const p = parseMatchPattern(pattern);
  const a = matchesUrl(p, url);
  const b = dnrMatches(pattern, url);
  assert.equal(a, b, `matchesUrl and regexFilter disagree for ${pattern} vs ${url}`);
  return a;
}

test("parses a full pattern into parts", () => {
  const p = parseMatchPattern("https://*.example.com:8443/api/*");
  assert.deepEqual(p, {
    scheme: "https", host: "*.example.com", port: "8443", path: "/api/*",
    canonical: "https://*.example.com:8443/api/*"
  });
});

test("fills in defaults for a bare host", () => {
  assert.equal(parseMatchPattern("example.com").canonical, "*://example.com/*");
  assert.equal(parseMatchPattern("Example.COM/foo").canonical, "*://example.com/foo");
  assert.equal(parseMatchPattern("<all_urls>").canonical, "*://*/*");
  assert.equal(parseMatchPattern("  https://a.b  ").canonical, "https://a.b/*");
});

test("converts unicode hosts to punycode", () => {
  assert.equal(parseMatchPattern("*://bücher.example/*").host, "xn--bcher-kva.example");
});

test("rejects invalid patterns", () => {
  const bad = [
    "", "ftp://example.com/*", "*://foo.*.bar/*", "*://*foo.com/*", "*://exa mple.com/*",
    "*://user@example.com/*", "*://example.com:99999/*", "*://example.com:abc/*",
    "*://[::1]/*", "*://example.com?x/*", "*://example.com#x/*", "://example.com/*"
  ];
  for (const b of bad) assert.throws(() => parseMatchPattern(b), `expected throw for ${JSON.stringify(b)}`);
});

test("exact host matches only that host", () => {
  assert.equal(both("*://www.example.com/*", "https://www.example.com/"), true);
  assert.equal(both("*://www.example.com/*", "https://example.com/"), false);
  assert.equal(both("*://www.example.com/*", "https://a.www.example.com/"), false);
  assert.equal(both("*://www.example.com/*", "https://wwwxexample.com/"), false);
});

test("subdomain wildcard matches the base host and subdomains", () => {
  assert.equal(both("*://*.example.com/*", "https://example.com/"), true);
  assert.equal(both("*://*.example.com/*", "https://a.example.com/x?y=1"), true);
  assert.equal(both("*://*.example.com/*", "https://a.b.example.com/"), true);
  assert.equal(both("*://*.example.com/*", "https://notexample.com/"), false);
  assert.equal(both("*://*.example.com/*", "https://example.com.evil.net/"), false);
});

test("the pattern in the query string of another origin does not match", () => {
  const attacker = "https://attacker.com/?x=://a.example.com/";
  assert.equal(both("*://*.example.com/*", attacker), false);
  assert.equal(both("*://example.com/*", attacker), false);
  assert.equal(both("*://*.example.com/*", "https://attacker.com/a.example.com/"), false);
  assert.equal(both("*://*.example.com/*", "https://a.example.com.attacker.com/"), false);
  assert.equal(both("*://*.example.com/*", "https://attacker.com/#@a.example.com/"), false);
});

test("scheme wildcard accepts http and https only", () => {
  const p = parseMatchPattern("*://example.com/*");
  assert.equal(matchesUrl(p, "http://example.com/"), true);
  assert.equal(matchesUrl(p, "https://example.com/"), true);
  assert.equal(matchesUrl(p, "ftp://example.com/"), false);
  assert.equal(matchesUrl(parseMatchPattern("https://example.com/*"), "http://example.com/"), false);
  assert.equal(dnrMatches("https://example.com/*", "http://example.com/"), false);
});

test("host wildcard matches any host", () => {
  assert.equal(both("*://*/*", "https://anything.test/path"), true);
  assert.equal(both("https://*/*", "http://anything.test/"), false);
});

test("path glob semantics", () => {
  assert.equal(both("*://example.com/api/*", "https://example.com/api/v1/x"), true);
  assert.equal(both("*://example.com/api/*", "https://example.com/apix"), false);
  assert.equal(both("*://example.com/*.json", "https://example.com/a/b.json"), true);
  assert.equal(both("*://example.com/*.json", "https://example.com/a/b.json?x=1"), false);
  assert.equal(both("*://example.com/exact", "https://example.com/exact"), true);
  assert.equal(both("*://example.com/exact", "https://example.com/exact?q=1"), false);
  assert.equal(both("*://example.com/exact*", "https://example.com/exact?q=1"), true);
  assert.equal(both("*://example.com/", "https://example.com/"), true);
  assert.equal(both("*://example.com/", "https://example.com/x"), false);
});

test("path is case sensitive and regex characters are literal", () => {
  assert.equal(both("*://example.com/API/*", "https://example.com/api/"), false);
  assert.equal(both("*://example.com/a.b", "https://example.com/aXb"), false);
  assert.equal(both("*://example.com/a(b)", "https://example.com/a(b)"), true);
  assert.equal(both("*://example.com/a+b", "https://example.com/a+b"), true);
});

test("ports", () => {
  assert.equal(both("*://localhost:3000/*", "http://localhost:3000/x"), true);
  assert.equal(both("*://localhost:3000/*", "http://localhost:3001/x"), false);
  assert.equal(both("*://localhost/*", "http://localhost:3000/x"), true);
  assert.equal(both("http://example.com:80/*", "http://example.com/"), true);
  assert.equal(both("https://example.com:443/*", "https://example.com/"), true);
  assert.equal(both("https://example.com:8443/*", "https://example.com/"), false);
});

test("dnr condition shape", () => {
  const c = toDnrCondition(parseMatchPattern("*://*.example.com/*"));
  assert.equal(c.regexFilter, "^https?://(?:[^/:?#@]+\\.)?example\\.com(?::\\d+)?/.*");
  assert.deepEqual(c.requestDomains, ["example.com"]);
  assert.equal(c.isUrlFilterCaseSensitive, true);
  assert.ok(c.resourceTypes.includes("main_frame"));

  const all = toDnrCondition(parseMatchPattern("*://*/*"));
  assert.equal(all.requestDomains, undefined);

  const exact = toDnrCondition(parseMatchPattern("https://api.example.com/v1"));
  assert.equal(exact.regexFilter, "^https://api\\.example\\.com(?::\\d+)?/v1$");
  assert.deepEqual(exact.requestDomains, ["api.example.com"]);
});

test("matchesUrl returns false for unparsable urls", () => {
  assert.equal(matchesUrl(parseMatchPattern("*://*/*"), "not a url"), false);
});
