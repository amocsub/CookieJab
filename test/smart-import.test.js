import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, parseModelOutput } from "../smart-import.js";

test("the prompt fences the pasted text between markers", () => {
  const prompt = buildPrompt("GET /x HTTP/1.1\nHost: example.com");
  assert.match(prompt, /<<<BEGIN INPUT>>>[\s\S]*Host: example\.com[\s\S]*<<<END INPUT>>>/);
});

test("parses a plain JSON response", () => {
  const raw = JSON.stringify({
    url: "https://example.com/api",
    headers: [{ name: "Authorization", value: "Bearer x" }],
    cookies: [{ name: "session", value: "abc" }]
  });
  const { parsed, error } = parseModelOutput(raw);
  assert.equal(error, null);
  assert.deepEqual(parsed, {
    url: "https://example.com/api",
    headers: [{ name: "Authorization", value: "Bearer x" }],
    cookies: [{ name: "session", value: "abc" }]
  });
});

test("parses JSON wrapped in a markdown fence", () => {
  const raw = "Here you go:\n```json\n" + JSON.stringify({ url: null, headers: [], cookies: [] }) + "\n```";
  const { parsed, error } = parseModelOutput(raw);
  assert.equal(error, null);
  assert.deepEqual(parsed, { url: null, headers: [], cookies: [] });
});

test("drops malformed header and cookie entries", () => {
  const raw = JSON.stringify({
    url: "https://example.com",
    headers: [{ name: "X-Ok", value: "1" }, { name: "", value: "2" }, { value: "no name" }, "not an object"],
    cookies: [{ name: "ok", value: "1" }, { name: "bad" }]
  });
  const { parsed } = parseModelOutput(raw);
  assert.deepEqual(parsed.headers, [{ name: "X-Ok", value: "1" }]);
  assert.deepEqual(parsed.cookies, [{ name: "ok", value: "1" }]);
});

test("treats a missing url as null rather than a blank string", () => {
  const raw = JSON.stringify({ url: "", headers: [], cookies: [] });
  const { parsed } = parseModelOutput(raw);
  assert.equal(parsed.url, null);
});

test("reports an error when the response is not JSON", () => {
  const { parsed, error } = parseModelOutput("I could not find anything.");
  assert.equal(parsed, null);
  assert.ok(error);
});

test("reports an error when the JSON is malformed", () => {
  const { parsed, error } = parseModelOutput("{not valid json");
  assert.equal(parsed, null);
  assert.ok(error);
});

test("reports an error when the JSON is not an object", () => {
  const { parsed, error } = parseModelOutput("[1,2,3]");
  assert.equal(parsed, null);
  assert.ok(error);
});
