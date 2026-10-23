// Generates src/audit_icons.js from @phosphor-icons/core 2.1.1 (MIT): the library's own glyphs, never hand-drawn, inlined
// so the audit pages keep their icons offline on a ship. Run by hand when an icon is added:
//   PHOSPHOR_ASSETS=<path to node_modules/@phosphor-icons/core/assets> node scripts/audit_icons_gen.mjs
// A name is the regular weight; "f:" the fill weight; "b:" the bold weight (the small check / x / ! inside a coloured dot).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NAMES = [
  "file-pdf", "check-circle", "warning-circle", "cloud-arrow-up", "printer", "wrench", "package", "magnifying-glass", "clock",
  "caret-right", "caret-left", "check", "x", "paper-plane-tilt", "lock-simple", "envelope-simple", "anchor", "arrow-clockwise",
  "plus", "minus", "boat", "list-checks", "user", "files", "chat-circle-text", "clipboard-text", "hourglass-medium", "seal-check",
  "f:file-pdf", "f:check-circle", "f:warning-circle", "f:cloud-arrow-up", "f:printer", "f:wrench", "f:package",
  "f:magnifying-glass", "f:clock", "f:caret-right", "f:caret-left", "f:check", "f:x", "f:paper-plane-tilt", "f:lock-simple",
  "f:envelope-simple", "f:anchor", "f:arrow-clockwise", "f:plus", "f:minus", "f:boat", "f:list-checks", "f:user", "f:files",
  "f:chat-circle-text", "f:clipboard-text", "f:hourglass-medium", "f:seal-check", "truck", "camera", "desktop", "t-shirt",
  "graduation-cap", "toolbox", "x-circle", "circle", "arrow-right", "cloud-check", "cloud-slash", "flag", "airplane-landing",
  "note-pencil", "image", "f:x-circle", "f:circle", "clock-counter-clockwise",
  // the Printshop Ops Audit redesign (20 Oct 2026, canvas 45Hsjnr7Vr6f1BPussctg3)
  "arrow-left", "file-text", "list", "shopping-cart", "wifi-slash", "caret-down", "chat-circle", "info",
  "b:check", "b:x", "b:exclamation-mark", "b:plus", "b:minus",
];
const dir = process.env.PHOSPHOR_ASSETS;
if (!dir) throw new Error("set PHOSPHOR_ASSETS to node_modules/@phosphor-icons/core/assets");
const svg = (name) => {
  const [w, n] = name.startsWith("f:") ? ["fill", name.slice(2)] : name.startsWith("b:") ? ["bold", name.slice(2)] : ["regular", name];
  const raw = readFileSync(join(dir, w, (w === "regular" ? n : n + "-" + w) + ".svg"), "utf8").trim();
  return raw.replace(' xmlns="http://www.w3.org/2000/svg"', "").replace("<svg ", '<svg ').replace(/fill="currentColor">/, 'fill="currentColor" aria-hidden="true">');
};
const out = {};
for (const n of NAMES) out[n] = svg(n);
writeFileSync(new URL("../src/audit_icons.js", import.meta.url),
  "// Phosphor Icons (MIT, @phosphor-icons/core 2.1.1) — the library's own glyphs, GENERATED from the package, never hand-drawn.\n" +
  "// Inlined so the audit pages keep their icons offline on a ship. Regenerate from the package; do not edit by hand.\n" +
  "export const ICONS = " + JSON.stringify(out) + ";\n" +
  'export const icon = (name, cls) => (ICONS[name] || "").replace("<svg ", "<svg class=\\"ic" + (cls ? " " + cls : "") + "\\" ");\n');
console.log("wrote", NAMES.length, "icons");
