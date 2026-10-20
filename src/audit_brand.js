// PRINTSHOP OPS AUDIT — the name and the mark (Miguel, 20 Oct 2026: "change also the icon .. make it the right color and
// fit in the printshop audit .. call it Printshop Ops Audit", with a clipboard-and-check icon as the reference; drawn on
// the mock-up canvas 45Hsjnr7Vr6f1BPussctg3, board "0 · Icon and name"). Brain recvkcnJgTjcpcQtJ.
// ONE definition: the pages, the manifest and the icon files all come from here. The PNG / ICO files are rendered from
// markSvg() by scripts/audit_icons_build.mjs into src/audit_brand_icons.js (generated, never hand-edited); the test pins
// that the files were rendered from the drawing that is here now.
// Only the audit app carries it: cims.work keeps the CIMS icon, and the emails keep the CIMS letterhead.

export const AUDIT_NAME = "Printshop Ops Audit";
export const AUDIT_SHORT = "Ops Audit";

export const NAVY = "#1B3A5C";
export const GREEN = "#5FB946";

const LINES = [533, 685, 837, 989];

// The clipboard (white on navy) with the check in a green circle cut out of its corner. tile = the rounded square an
// app icon sits in; white = the variant for a navy background (navy clipboard on a white tile); square = the tile with
// no rounding, for the files a phone rounds itself (iOS paints a transparent corner of an apple-touch-icon black;
// Android crops a maskable icon to its own shape — the mark sits inside the middle 70%, inside its 80% safe zone).
export function markSvg(size, { white = false, tile = true, square = false } = {}) {
  const bg = white ? "#fff" : NAVY, fg = white ? NAVY : "#fff";
  const inner =
    '<rect x="140" y="215" width="845" height="950" rx="85" fill="' + fg + '"/>' +
    '<rect x="285" y="120" width="555" height="360" rx="105" fill="' + bg + '"/>' +
    '<circle cx="562" cy="215" r="105" fill="' + fg + '"/>' +
    '<rect x="352" y="218" width="421" height="190" rx="36" fill="' + fg + '"/>' +
    LINES.map((y) => '<rect x="265" y="' + y + '" width="315" height="70" rx="35" fill="' + bg + '"/>').join("") +
    '<circle cx="948" cy="778" r="315" fill="' + bg + '"/>' +
    '<circle cx="948" cy="778" r="245" fill="' + GREEN + '"/>' +
    '<path d="M853 768 L922 835 L1045 712" fill="none" stroke="#fff" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>';
  if (!tile) return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="120 95 1090 1090" role="img" aria-label="' + AUDIT_NAME + '">' + inner + "</svg>";
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" role="img" aria-label="' + AUDIT_NAME + '">' +
    '<rect width="100" height="100" rx="' + (square ? 0 : 23) + '" fill="' + bg + '"/>' +
    '<svg x="15" y="15" width="70" height="70" viewBox="120 95 1090 1090">' + inner + "</svg></svg>";
}

// Every drawing the icon files are rendered from, in one string: the build stamps its hash on the files and the test
// compares, so a changed drawing with files not re-rendered fails the suite.
export const MARK_FILES = {
  PNG180: () => markSvg(180, { square: true }),   // apple-touch-icon: iOS rounds it
  PNG512: () => markSvg(512),                     // the manifest's "any" icon
  PNG512M: () => markSvg(512, { square: true }),  // the manifest's "maskable" icon: Android crops it
  PNG32: () => markSvg(32),
  ICO16: () => markSvg(16), ICO48: () => markSvg(48),
};
export const markSource = () => Object.keys(MARK_FILES).map((k) => k + "=" + MARK_FILES[k]()).join("|");

// The icon files, by path: /audit/... on any host (the shell links them on cims.work/audit too), and on audit.cims.work
// the paths a browser or a phone asks for by itself. cims.work keeps the CIMS icon. [constant name, content type]
export const AUDIT_ICON_PATHS = {
  "/audit/icon-180.png": ["PNG180", "image/png"],
  "/audit/icon-512.png": ["PNG512", "image/png"],
  "/audit/icon-512-maskable.png": ["PNG512M", "image/png"],
  "/audit/icon-32.png": ["PNG32", "image/png"],
  "/audit/favicon.ico": ["ICO", "image/x-icon"],
};
export const AUDIT_HOST_ICON_PATHS = {
  "/favicon.ico": "/audit/favicon.ico",
  "/apple-touch-icon.png": "/audit/icon-180.png",
  "/apple-touch-icon-precomposed.png": "/audit/icon-180.png",
  "/icon-512.png": "/audit/icon-512.png",
};
// The path → [constant, type] the request asks for, or null when it is not an audit icon on this host.
export function auditIconFor(p, onAuditHost) {
  return AUDIT_ICON_PATHS[p] || (onAuditHost && AUDIT_ICON_PATHS[AUDIT_HOST_ICON_PATHS[p]]) || null;
}
