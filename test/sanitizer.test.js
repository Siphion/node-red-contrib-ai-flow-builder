const assert = require("assert");
const { sanitizeFlows, REDACTED } = require("../lib/sanitizer");

describe("sanitizeFlows", () => {
  it("strips top-level sensitive keys", () => {
    const r = sanitizeFlows([{ id: "1", type: "inject", password: "p", apiKey: "k", x_api_key: "z" }]);
    assert.strictEqual(r[0].password, REDACTED);
    assert.strictEqual(r[0].apiKey, REDACTED);
    assert.strictEqual(r[0]["x_api_key"], REDACTED);
    assert.strictEqual(r[0].type, "inject");
  });

  it("strips nested credentials", () => {
    const r = sanitizeFlows([{ id: "1", type: "mqtt", credentials: { user: "u", password: "p" } }]);
    assert.strictEqual(r[0].credentials, REDACTED);
  });

  it("leaves env references intact (only names, not actual secrets)", () => {
    const url = "https://api.example.com/${env.SECRET}";
    const r = sanitizeFlows([{ id: "1", type: "x", url }]);
    assert.strictEqual(r[0].url, url);
  });

  it("removes ai-provider-config nodes entirely", () => {
    const r = sanitizeFlows([
      { id: "a", type: "ai-provider-config", apiKey: "secret" },
      { id: "b", type: "inject" }
    ]);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].id, "b");
  });

  it("handles deeply nested arrays and objects", () => {
    const r = sanitizeFlows([{
      id: "1", type: "x",
      nested: { arr: [{ token: "t", ok: "keep" }] }
    }]);
    assert.strictEqual(r[0].nested.arr[0].token, REDACTED);
    assert.strictEqual(r[0].nested.arr[0].ok, "keep");
  });

  it("does not mutate the input", () => {
    const input = [{ id: "1", type: "x", password: "p" }];
    const copy = JSON.parse(JSON.stringify(input));
    sanitizeFlows(input);
    assert.deepStrictEqual(input, copy);
  });
});
