import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizeShellCommand, parseCurl, defaultPatternFor } from "../curl-import.js";

test("tokenizes single and double quoted words", () => {
  assert.deepEqual(tokenizeShellCommand(`curl 'https://a.com' -H "X-A: 1"`),
    ["curl", "https://a.com", "-H", "X-A: 1"]);
});

test("handles a backslash-newline line continuation, as browsers produce", () => {
  const cmd = "curl 'https://a.com' \\\n  -H 'X-A: 1' \\\n  -H 'X-B: 2'";
  assert.deepEqual(tokenizeShellCommand(cmd), ["curl", "https://a.com", "-H", "X-A: 1", "-H", "X-B: 2"]);
});

test("unescapes backslash sequences inside double quotes", () => {
  assert.deepEqual(tokenizeShellCommand(`-H "X-A: say \\"hi\\""`), ["-H", 'X-A: say "hi"']);
});

test("parses the url and header flags into headers", () => {
  const r = parseCurl(`curl 'https://api.example.com/v1/users' -H 'Authorization: Bearer abc' -H 'Accept: application/json'`);
  assert.equal(r.url, "https://api.example.com/v1/users");
  assert.deepEqual(r.headers, [
    { name: "Authorization", value: "Bearer abc" },
    { name: "Accept", value: "application/json" }
  ]);
  assert.deepEqual(r.cookies, []);
});

test("splits a Cookie header into individual cookies and keeps it out of headers", () => {
  const r = parseCurl(`curl 'https://a.com' -H 'Cookie: session_id=xyz; theme=dark'`);
  assert.equal(r.headers.length, 0);
  assert.deepEqual(r.cookies, [
    { name: "session_id", value: "xyz" },
    { name: "theme", value: "dark" }
  ]);
});

test("reads cookies from -b and --cookie the same way as a Cookie header", () => {
  const short = parseCurl(`curl 'https://a.com' -b 'a=1; b=2'`);
  assert.deepEqual(short.cookies, [{ name: "a", value: "1" }, { name: "b", value: "2" }]);
  const long = parseCurl(`curl 'https://a.com' --cookie 'a=1'`);
  assert.deepEqual(long.cookies, [{ name: "a", value: "1" }]);
});

test("a -b value with no = is not treated as a cookie, matching curl's own file-path meaning", () => {
  const r = parseCurl(`curl 'https://a.com' -b cookies.txt`);
  assert.deepEqual(r.cookies, []);
});

test("boolean flags do not consume the url as their argument", () => {
  const r = parseCurl(`curl -s -L --compressed 'https://a.com/x' -H 'X-A: 1'`);
  assert.equal(r.url, "https://a.com/x");
  assert.deepEqual(r.headers, [{ name: "X-A", value: "1" }]);
});

test("--url sets the target even when a bare url-like token also appears as data", () => {
  const r = parseCurl(`curl --url 'https://real.example.com/' -d 'redirect=https://fake.example.com/'`);
  assert.equal(r.url, "https://real.example.com/");
});

test("keeps repeated headers of the same name as separate entries", () => {
  const r = parseCurl(`curl 'https://a.com' -H 'X-A: 1' -H 'X-A: 2'`);
  assert.deepEqual(r.headers, [{ name: "X-A", value: "1" }, { name: "X-A", value: "2" }]);
});

test("-A and -e fold into User-Agent and Referer headers", () => {
  const r = parseCurl(`curl 'https://a.com' -A 'MyAgent/1.0' -e 'https://ref.example.com/'`);
  assert.deepEqual(r.headers, [
    { name: "User-Agent", value: "MyAgent/1.0" },
    { name: "Referer", value: "https://ref.example.com/" }
  ]);
});

test("a header without a colon is ignored rather than crashing", () => {
  const r = parseCurl(`curl 'https://a.com' -H 'not-a-header'`);
  assert.deepEqual(r.headers, []);
});

test("text with only flags and no bare token leaves url null", () => {
  const r = parseCurl("-s -L --compressed");
  assert.equal(r.url, null);
  assert.deepEqual(r.headers, []);
  assert.deepEqual(r.cookies, []);
});

test("text with no curl command takes the first bare word, which the caller must validate as a url", () => {
  const r = parseCurl("just some notes, no command here");
  assert.equal(r.url, "just");
  assert.equal(defaultPatternFor(r.url), "");
});

test("defaultPatternFor builds a whole-host pattern from the url", () => {
  assert.equal(defaultPatternFor("https://api.example.com/v1/users?x=1"), "*://api.example.com/*");
  assert.equal(defaultPatternFor("not a url"), "");
});
