import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportedRules } from "../json-import.js";

test("parses a valid rule list", () => {
  const { rules, errors } = parseImportedRules(JSON.stringify([
    { type: "header", url: "*://example.com/*", key: "X-Test", value: "1" },
    { type: "cookie", url: "*://example.com/*", key: "session", value: "abc", mode: "absent" }
  ]));
  assert.deepEqual(errors, []);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].type, "header");
  assert.equal(rules[0].value, "1");
  assert.equal(rules[1].mode, "absent");
});

test("fills in defaults for optional fields", () => {
  const { rules, errors } = parseImportedRules(JSON.stringify([
    { type: "header", url: "*://example.com/*", key: "X-Test" }
  ]));
  assert.deepEqual(errors, []);
  assert.deepEqual(rules[0], {
    type: "header", url: "*://example.com/*", key: "X-Test", value: "",
    bundle: "", bundleUrl: "", enabled: true, mode: "set", side: "request",
    resourceTypes: null, cookieAttrs: null, bundleVar: null
  });
});

test("rejects text that is not JSON", () => {
  const { rules, errors } = parseImportedRules("not json");
  assert.deepEqual(rules, []);
  assert.equal(errors.length, 1);
});

test("rejects a JSON value that is not an array", () => {
  const { rules, errors } = parseImportedRules(JSON.stringify({ type: "header" }));
  assert.deepEqual(rules, []);
  assert.equal(errors.length, 1);
});

test("reports one error per malformed rule, by position", () => {
  const { rules, errors } = parseImportedRules(JSON.stringify([
    { type: "header", url: "*://example.com/*", key: "X-Test" },
    { type: "ftp", url: "*://example.com/*", key: "X-Test" },
    { type: "header", key: "X-Test" },
    { type: "header", url: "*://example.com/*" },
    "not an object"
  ]));
  assert.equal(rules.length, 1);
  assert.equal(errors.length, 4);
  assert.match(errors[0], /Rule 2/);
  assert.match(errors[1], /Rule 3/);
  assert.match(errors[2], /Rule 4/);
  assert.match(errors[3], /Rule 5/);
});
