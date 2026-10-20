// Printshop Ops Audit — the name and the mark (Miguel, 20 Oct 2026: "change also the icon .. make it the right color and
// fit in the printshop audit .. call it Printshop Ops Audit"). src/audit_brand.js holds the drawing; the icon files are
// rendered from it (scripts/audit_icons_build.mjs). These tests hold: the files are the drawing that is there now, they
// are real PNG / ICO files at the size their path says, audit.cims.work answers the browser's own icon paths with the
// mark while cims.work keeps the CIMS icon, and every audit page links the audit's icons and says the name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { AUDIT_NAME, AUDIT_SHORT, markSource, markSvg, auditIconFor, AUDIT_ICON_PATHS } from "../src/audit_brand.js";
import * as FILES from "../src/audit_brand_icons.js";
import { ICO_B64 } from "../src/icons.js";
import { AUDIT_MANIFEST, AUDIT_HTML } from "../src/audit_ui.js";
import { auditUploadHtml, auditClosedHtml } from "../src/audit_upload_ui.js";
import worker from "../src/worker.js";

const b = (k) => Buffer.from(FILES[k], "base64");
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Width, height, bit depth, colour type, and the alpha of the top-left pixel. Row 0's first pixel is its raw bytes
// whatever the row's filter (every predictor reads zeros there), so no full decode is needed.
function png(buf) {
  assert.ok(buf.subarray(0, 8).equals(PNG_SIG), "a PNG signature");
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], color = buf[25];
  const idat = [];
  for (let o = 8; o < buf.length;) { const n = buf.readUInt32BE(o), t = buf.toString("ascii", o + 4, o + 8); if (t === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + n)); o += 12 + n; }
  const raw = inflateSync(Buffer.concat(idat));
  // colour type 2 = RGB, no alpha channel: every pixel is opaque
  return { w, h, depth, color, cornerAlpha: depth !== 8 ? null : color === 2 ? 255 : color === 6 ? raw[4] : null };
}

test("the icon files were rendered from the drawing that is in audit_brand.js now", () => {
  assert.equal(FILES.SOURCE_SHA, createHash("sha256").update(markSource()).digest("hex").slice(0, 16),
    "the drawing changed: run node scripts/audit_icons_build.mjs");
});

test("every PNG is the size its path says; the files a phone rounds itself are full squares", () => {
  const want = { PNG180: [180, 255], PNG512: [512, 0], PNG512M: [512, 255], PNG32: [32, 0] };
  for (const [k, [size, alpha]] of Object.entries(want)) {
    const p = png(b(k));
    assert.deepEqual([p.w, p.h, p.depth], [size, size, 8], k);
    assert.ok(p.color === 6 || (alpha === 255 && p.color === 2), k + ": RGBA, or RGB where every pixel is opaque");
    assert.equal(p.cornerAlpha, alpha, k + (alpha ? ": iOS paints a transparent corner black" : ": the rounded tile"));
  }
});

test("the favicon is an ICO of three PNGs, 16 / 32 / 48", () => {
  const ico = b("ICO");
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3]);
  const sizes = [0, 1, 2].map((i) => {
    const e = 6 + 16 * i, len = ico.readUInt32LE(e + 8), off = ico.readUInt32LE(e + 12);
    const p = png(ico.subarray(off, off + len));
    assert.equal(p.w, ico[e]);
    return p.w;
  });
  assert.deepEqual(sizes, [16, 32, 48]);
});

test("the mark is the CIMS navy and green, labelled with the app's name", () => {
  const s = markSvg(40);
  assert.match(s, /#1B3A5C/); assert.match(s, /#5FB946/); assert.match(s, /aria-label="Printshop Ops Audit"/);
  assert.match(markSvg(180, { square: true }), /<rect width="100" height="100" rx="0"/);
  assert.equal(AUDIT_NAME, "Printshop Ops Audit"); assert.equal(AUDIT_SHORT, "Ops Audit");
});

test("which host gets the mark: /audit/... everywhere, the browser's own paths only on audit.cims.work", () => {
  assert.deepEqual(auditIconFor("/audit/icon-180.png", false), ["PNG180", "image/png"]);
  assert.deepEqual(auditIconFor("/favicon.ico", true), ["ICO", "image/x-icon"]);
  assert.deepEqual(auditIconFor("/apple-touch-icon.png", true), ["PNG180", "image/png"]);
  assert.equal(auditIconFor("/favicon.ico", false), null, "cims.work keeps the CIMS icon");
  assert.equal(auditIconFor("/audit/nothing.png", true), null);
  for (const [k] of Object.values(AUDIT_ICON_PATHS)) assert.ok(FILES[k], k + " is rendered");
});

const fakeDB = () => {
  const st = () => { const s = { bind: () => s, run: async () => ({ meta: {} }), first: async () => null, all: async () => ({ results: [] }) }; return s; };
  return { prepare: st, batch: async () => [] };
};
const get = async (url) => { const r = await worker.fetch(new Request(url), { DB: fakeDB(), SESSION_SECRET: "x" }, { waitUntil() {} }); return { r, buf: Buffer.from(await r.arrayBuffer()) }; };

test("served without a sign-in: audit.cims.work's favicon and home-screen icon are the mark; cims.work's stay CIMS", async () => {
  { const { r, buf } = await get("https://audit.cims.work/favicon.ico"); assert.equal(r.status, 200); assert.equal(r.headers.get("Content-Type"), "image/x-icon"); assert.ok(buf.equals(b("ICO"))); }
  { const { r, buf } = await get("https://audit.cims.work/apple-touch-icon.png"); assert.equal(r.status, 200); assert.ok(buf.equals(b("PNG180"))); }
  { const { buf } = await get("https://cims.work/favicon.ico"); assert.ok(buf.equals(Buffer.from(ICO_B64, "base64")), "the console keeps its icon"); }
  { const { r, buf } = await get("https://cims.work/audit/icon-512-maskable.png"); assert.equal(r.status, 200); assert.ok(buf.equals(b("PNG512M"))); }
});

test("every audit page says the name and links the audit's icons, never the console's", () => {
  const m = JSON.parse(AUDIT_MANIFEST(true));
  assert.equal(m.name, "Printshop Ops Audit"); assert.equal(m.short_name, "Ops Audit");
  assert.deepEqual(m.icons.map((i) => [i.src, i.purpose || "any"]), [["/audit/icon-512.png", "any"], ["/audit/icon-512-maskable.png", "maskable"], ["/audit/icon-180.png", "any"]]);
  for (const i of m.icons) assert.ok(auditIconFor(i.src, false), i.src + " is served");
  const pages = { shell: AUDIT_HTML, crew: auditUploadHtml({ token: "t", ship: "Pursuit", crew: "Kevin" }), closed: auditClosedHtml("expired") };
  for (const [k, h] of Object.entries(pages)) {
    assert.match(h, /<title>Printshop Ops Audit/, k);
    assert.match(h, /href="\/audit\/favicon\.ico"/, k);
    assert.doesNotMatch(h, /href="\/(favicon\.ico|apple-touch-icon\.png)"/, k + ": the console's icon paths");
  }
  for (const [k, h] of Object.entries(pages)) assert.match(h, /class="brand"[^>]*>[\s\S]*?<b>Printshop Ops Audit<\/b><\/(span|a)>/, k + ": the app bar says the name");
  assert.doesNotMatch(AUDIT_HTML, /Printshop [Aa]udit</, "no old title left");
});

test("the emails keep their wording until Miguel signs off a render (CIMS email standard)", () => {
  // Renaming an email is a template change: render first, his sign-off, then ship. This pins that this change did not.
  const kit = readFileSync(new URL("../src/emails/audit_kit.js", import.meta.url), "utf8");
  assert.doesNotMatch(kit, /Ops Audit/);
});

test("the sign-in card fits a 320px phone on both hosts (measured 20 Oct 2026: it was 360px wide, 64px off the screen)", async () => {
  for (const host of ["audit.cims.work", "cims.work"]) {
    const { buf } = await get("https://" + host + "/login");
    const h = buf.toString("utf8");
    assert.match(h, /#g\{[^}]*grid-template-columns:minmax\(0,1fr\)/, host + ": the grid column may shrink below the card's 360px");
    assert.match(h, /\.box\{box-sizing:border-box;/, host + ": the card's padding sits inside its width");
  }
});
