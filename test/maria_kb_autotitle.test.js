// Maria knowledge auto-titling (Session-7).
// Dropping a document should never require typing a title: Maria names it from the content,
// and if the model call can't be reached the save still succeeds via a first-line fallback.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { mariaQuickTitle } from "../src/maria.js";

const okResp = (title) => ({ ok: true, json: async () => ({ content: [{ type: "text", text: title }] }) });

test("mariaQuickTitle returns null without an API key or text (never throws)", async () => {
  assert.strictEqual(await mariaQuickTitle({ apiKey: "", text: "hello" }), null);
  assert.strictEqual(await mariaQuickTitle({ apiKey: "k", text: "" }), null);
});

test("mariaQuickTitle cleans quotes/whitespace/trailing period from the model output", async () => {
  const t = await mariaQuickTitle({ apiKey: "k", text: "some doc", fetchImpl: async () => okResp('  "Konica dry-dock checklist."  ') });
  assert.strictEqual(t, "Konica dry-dock checklist");
});

test("mariaQuickTitle returns null on provider failure so the caller can fall back", async () => {
  const bad = await mariaQuickTitle({ apiKey: "k", text: "x", fetchImpl: async () => ({ ok: false, text: async () => "403" }) });
  assert.strictEqual(bad, null);
  const threw = await mariaQuickTitle({ apiKey: "k", text: "x", fetchImpl: async () => { throw new Error("network"); } });
  assert.strictEqual(threw, null);
});

test("mariaQuickTitle returns null on empty model text", async () => {
  const t = await mariaQuickTitle({ apiKey: "k", text: "x", fetchImpl: async () => okResp("   ") });
  assert.strictEqual(t, null);
});

// ---- worker source pins ----
const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");

test("knowledge add: title optional, AI-named with first-line fallback", () => {
  assert.ok(src.includes("function firstLineTitle"), "fallback titler present");
  assert.ok(src.includes("mariaQuickTitle({ apiKey: env.ANTHROPIC_API_KEY, text: body })"), "AI naming call");
  assert.ok(src.includes("if (!body) return json"), "only body is required now");
  assert.ok(!src.includes('if (!title || !body) return json'), "old title-required gate removed");
});

test("knowledge add: date auto-stamped to today when not supplied", () => {
  assert.ok(src.includes('const docDate = String(b.doc_date || "").slice(0, 10) || TODAY();'), "date defaults to today");
});

test("knowledge panel leads with drop zone and no required title", () => {
  assert.ok(src.includes("Leave blank and Maria names it from the content"), "optional-title placeholder");
  assert.ok(src.includes("Maria is reading and naming it"), "naming progress state");
  assert.ok(src.includes("class=kbdrop"), "styled drop zone");
});
