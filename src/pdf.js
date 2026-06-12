// Minimal, dependency-free PDF writer. Enough for a one-/multi-page text statement:
// Helvetica + Helvetica-Bold, left-aligned text, horizontal rules, simple columns,
// RGB fills (header bar), and automatic page breaks. Output is a Uint8Array.
//
// Why hand-rolled: the rest of this Worker is dependency-free pure modules bundled by
// wrangler; pulling a big npm PDF lib through a build we can't observe is a needless
// risk. PDF is a text format — a statement is just text + a couple of tables.
//
// Coordinates: PDF origin is bottom-left; this API works top-down via a cursor.

const PAGE_W = 612;   // US Letter, 72 dpi points
const PAGE_H = 792;
const MARGIN = 54;

// WinAnsi-safe: keep bytes 0..255, replace anything higher with '?'.
function latin1(s) {
  let o = "";
  for (const ch of String(s == null ? "" : s)) {
    const c = ch.codePointAt(0);
    o += c <= 255 ? ch : "?";
  }
  return o;
}
// Escape for a PDF literal string.
function esc(s) {
  return latin1(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export class Pdf {
  constructor() {
    this.pages = [];      // each page = array of content-stream fragments (strings)
    this._newPage();
    this.x = MARGIN;
    this.y = PAGE_H - MARGIN;
  }
  _newPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.y = PAGE_H - MARGIN;
  }
  _need(h) {
    if (this.y - h < MARGIN) this._newPage();
  }
  // Draw one line of text; advances the cursor down by size*lh.
  text(str, { size = 10, bold = false, indent = 0, color = null, lh = 1.5 } = {}) {
    this._need(size * lh);
    const f = bold ? "F2" : "F1";
    const x = MARGIN + indent;
    const col = color ? `${color[0]} ${color[1]} ${color[2]} rg\n` : "0 0 0 rg\n";
    this.cur.push(`${col}BT /${f} ${size} Tf ${x} ${this.y - size} Td (${esc(str)}) Tj ET\n`);
    this.y -= size * lh;
    return this;
  }
  // A row of columns at fixed x offsets (from left margin). cols/xs same length.
  row(cols, xs, { size = 9, bold = false, color = null, lh = 1.6 } = {}) {
    this._need(size * lh);
    const f = bold ? "F2" : "F1";
    const col = color ? `${color[0]} ${color[1]} ${color[2]} rg\n` : "0 0 0 rg\n";
    let frag = col;
    for (let i = 0; i < cols.length; i++) {
      const x = MARGIN + (xs[i] || 0);
      frag += `BT /${f} ${size} Tf ${x} ${this.y - size} Td (${esc(cols[i])}) Tj ET\n`;
    }
    this.cur.push(frag);
    this.y -= size * lh;
    return this;
  }
  rule({ color = [0.85, 0.88, 0.92], w = 0.75 } = {}) {
    this._need(8);
    this.y -= 4;
    this.cur.push(`${color[0]} ${color[1]} ${color[2]} RG ${w} w ${MARGIN} ${this.y} m ${PAGE_W - MARGIN} ${this.y} l S\n`);
    this.y -= 6;
    return this;
  }
  bar(h, color) {
    // Full-width filled rectangle at the current cursor (used for the header band).
    this._need(h);
    this.cur.push(`${color[0]} ${color[1]} ${color[2]} rg ${MARGIN - 6} ${this.y - h + 4} ${PAGE_W - 2 * (MARGIN - 6)} ${h} re f\n`);
    return this;
  }
  gap(h = 8) { this.y -= h; return this; }

  // Serialize to a Uint8Array (valid PDF with xref).
  build() {
    const objs = [];                 // objs[n] = body string for object n (1-indexed)
    const set = (n, body) => { objs[n] = body; };
    set(1, "<< /Type /Catalog /Pages 2 0 R >>");
    set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    let n = 5;
    for (const page of this.pages) {
      const contentObj = n++, pageObj = n++;
      const stream = page.join("");
      set(contentObj, `<< /Length ${latin1(stream).length} >>\nstream\n${stream}endstream`);
      set(pageObj, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`);
      kids.push(`${pageObj} 0 R`);
    }
    set(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${this.pages.length} >>`);

    const maxN = objs.length - 1;
    let out = "%PDF-1.4\n";
    const offsets = [];
    for (let i = 1; i <= maxN; i++) {
      offsets[i] = latin1(out).length;
      out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xrefPos = latin1(out).length;
    out += `xref\n0 ${maxN + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= maxN; i++) {
      out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${maxN + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    // Latin1 -> bytes
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
