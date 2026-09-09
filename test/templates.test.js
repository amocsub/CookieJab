import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../templates.js";

test("passes through a value with no placeholders", () => {
  assert.equal(renderTemplate("plain-value"), "plain-value");
});

test("substitutes the timestamp token", () => {
  const before = Date.now();
  const rendered = renderTemplate("t={{timestamp}}");
  const after = Date.now();
  const value = Number(rendered.slice(2));
  assert.ok(value >= before && value <= after);
});

test("substitutes the uuid token with a v4 uuid", () => {
  const rendered = renderTemplate("id={{uuid}}");
  assert.match(rendered, /^id=[0-9a-f-]{36}$/);
});

test("substitutes the random token with a short hex string", () => {
  const rendered = renderTemplate("r={{random}}");
  assert.match(rendered, /^r=[0-9a-f]{8}$/);
});

test("random and uuid change on every call", () => {
  assert.notEqual(renderTemplate("{{random}}"), renderTemplate("{{random}}"));
  assert.notEqual(renderTemplate("{{uuid}}"), renderTemplate("{{uuid}}"));
});

test("substitutes a caller-provided variable by name", () => {
  assert.equal(renderTemplate("id={{identity}}", { identity: "userA" }), "id=userA");
});

test("leaves an unrecognized token untouched", () => {
  assert.equal(renderTemplate("id={{nope}}", { identity: "userA" }), "id={{nope}}");
});

test("substitutes multiple tokens in one value", () => {
  const rendered = renderTemplate("{{identity}}-{{timestamp}}", { identity: "userB" });
  assert.match(rendered, /^userB-\d+$/);
});

test("ignores non-string input", () => {
  assert.equal(renderTemplate(undefined), undefined);
  assert.equal(renderTemplate(null), null);
});
