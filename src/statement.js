// Crew statement composer - pure. Turns crew + contracts + bonus into a PDF (via ./pdf.js).
// Brand: navy #1B3A5C, green #5FB946. Includes bonus standing (Miguel's choice 2026-06-12).

import { Pdf, PAGE_W, PAGE_H, MARGIN } from "./pdf.js";

const NAVY = [0.106, 0.227, 0.361];
const GREEN = [0.373, 0.725, 0.275];
const MUT = [0.42, 0.49, 0.58];
const RED = [0.74, 0.23, 0.17];
const AMBER = [0.69, 0.45, 0.10];

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US");
const fullName = (c) => [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") || c.agency_id || "Crew";

// Document expiry status as label + color, relative to `today` (ISO yyyy-mm-dd).
export function docStatus(dt, today) {
  if (!dt) return { txt: "-", color: MUT };
  const days = (new Date(dt) - new Date(today)) / 86400000;
  if (isNaN(days)) return { txt: dt, color: MUT }; // unparseable date -> show muted, not "ok" black
  if (days < 0) return { txt: dt + "  (EXPIRED)", color: RED };
  if (days < 90) return { txt: dt + "  (<90d)", color: AMBER };
  return { txt: dt, color: [0, 0, 0] };
}

// Build the statement PDF. Returns Uint8Array.
// REDESIGNED 12 Oct 2026 (Miguel: "the download PDF .. the pdf .. well design"; mock-up approved the same evening): the
// CIMS letterhead band, the crew and their last ship, a strip of four numbers, the contracts (TDG's dates), every document
// with number / issue / expiry / issuer, the bonus standing, and a footer naming Rita as the contact. The statement goes
// to the SEAFARER: it never carries notes, field intel, feedback or anything kept for HR only. Helvetica, Latin-1 only.
const DEEP = [0.078, 0.176, 0.282], SUBT = [0.584, 0.627, 0.678], SLATE = [0.42, 0.45, 0.50], INK = [0.086, 0.161, 0.239];
const LINE = [0.89, 0.91, 0.94], GINK = [0.243, 0.498, 0.180];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoD = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
export const fmtD = (v) => { const d = isoD(v); return d ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4) : "-"; };
function spanTxt(on, off) {
  const a = isoD(on), b = isoD(off); if (!a || !b || b < a) return "-";
  let m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); let d = +b.slice(8, 10) - +a.slice(8, 10);
  if (d < 0) { m -= 1; d += new Date(Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, 0)).getUTCDate(); }
  return (m ? m + " mo" : "") + (m && d ? " " : "") + (d || !m ? d + " d" : "");
}
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "." : s; };

export function composeStatement(data) {
  const c = data.crew || {};
  const contracts = (data.contracts || []).slice().sort((a, b) => String(a.on || "").localeCompare(String(b.on || "")));
  const bonus = data.bonus || null;
  const today = (data.generatedAt || new Date().toISOString()).slice(0, 10);
  const pdf = new Pdf();
  const L = MARGIN, R = PAGE_W - MARGIN, W = R - L;

  // 1. the letterhead: the 60/40 rule over the deep band, the wordmark, its underline, the subtitle
  pdf.rect(0, 0, PAGE_W * 0.6, 5, NAVY).rect(PAGE_W * 0.6, 5 - 5, PAGE_W * 0.4, 5, GREEN).rect(0, 5, PAGE_W, 70, DEEP);
  pdf.textAt("CIMS", L, 24, { size: 20, bold: true, color: [1, 1, 1], spacing: 4.5 });
  pdf.rect(L, 49, 70, 2, GREEN);
  pdf.textAt("CRUISE INDUSTRY MANAGED SERVICES", L, 56, { size: 6, bold: true, color: SUBT, spacing: 1.6 });
  const t1 = "Crew statement", t2 = fmtD(today);
  pdf.textAt(t1, R - Pdf.width(t1, 10, true), 30, { size: 10, bold: true, color: [1, 1, 1] });
  pdf.textAt(t2, R - Pdf.width(t2, 9), 46, { size: 9, color: SUBT });

  // 2. who, and the last ship
  const name = fullName(c);
  pdf.textAt(name, L, 100, { size: 20, bold: true, color: NAVY });
  const who = [c.agency_id, c.rank_override || c.rank_observed, c.province, c.dob ? "born " + fmtD(c.dob) : ""].filter(Boolean).join("  \u00b7  ");
  pdf.textAt(who, L, 126, { size: 9, color: SLATE });
  const last = contracts[contracts.length - 1] || null;
  if (last) {
    pdf.textAt("Last ship", R - Pdf.width("Last ship", 8.5), 102, { size: 8.5, color: SLATE });
    pdf.textAt(clip(last.ship, 26), R - Pdf.width(clip(last.ship, 26), 11, true), 116, { size: 11, bold: true, color: NAVY });
  }

  // 3. four numbers
  const docs = [["Medical", c.med_exp, c.med_cert_no, c.med_issue, c.med_place], ["Seaman book", c.sirb_exp, c.sirb_no, c.sirb_issue, c.sirb_place],
    ["Passport", c.pp_exp, c.pp_no, c.pp_issue, c.pp_place], ["US visa (C1/D)", c.usv_exp, c.usv_no, c.usv_issue, c.usv_place], ["Schengen", c.sch_exp, c.sch_no, c.sch_issue, c.sch_place, true]];
  const valid = docs.filter((d) => !d[5] && isoD(d[1]) && isoD(d[1]) >= today).length;
  const nums = [[bonus && bonus.contracts != null ? String(bonus.contracts) : "-", "Completed contracts"], [Number(data.daysWorked || 0).toLocaleString("en-US"), "Days at sea"],
    [bonus ? String(bonus.count != null ? bonus.count : 0) : "-", "Bonus count (consecutive)"], [valid + " of 4", "Documents valid"]];
  const bw = W / 4, bt = 148, bh = 48;
  pdf.frame(L, bt, W, bh, LINE);
  nums.forEach(([n, l], i) => {
    const x = L + i * bw;
    if (i) pdf.hline(x, x, bt, LINE).cur.push(`0.89 0.91 0.94 RG 0.75 w ${x} ${PAGE_H - bt} m ${x} ${PAGE_H - bt - bh} l S\n`);
    pdf.textAt(n, x + 12, bt + 9, { size: 16, bold: true, color: NAVY });
    pdf.textAt(l, x + 12, bt + 31, { size: 7.5, color: SLATE });
  });

  // 4. contracts
  pdf.setTop(222);
  const head = (title, top) => pdf.textAt(title, L, top, { size: 11.5, bold: true, color: NAVY });
  head("Contracts", pdf.top); pdf.setTop(pdf.top + 20);
  const cx = [0, 22, 190, 282, 374, 440];
  pdf.row(["#", "SHIP", "SIGN-ON", "SIGN-OFF", "LENGTH", "BASIS"], cx, { size: 7, bold: true, color: SLATE });
  pdf.hline(L, R, pdf.top - 3, [0.84, 0.87, 0.91]);
  if (!contracts.length) pdf.row(["", "No contract on file.", "", "", "", ""], cx, { size: 9, color: SLATE });
  contracts.forEach((x, i) => {
    const off = x.act || x.proj || null;
    pdf.row([String(i + 1), clip(x.ship || "-", 30), fmtD(x.on), off ? fmtD(off) : "-", off ? spanTxt(x.on, off) : "-", x.act ? "actual" : (x.proj ? "projected" : "open")], cx, { size: 9, color: INK, lh: 1.9 });
    pdf.hline(L, R, pdf.top - 4, LINE);
  });
  if (data.fileAt) { pdf.gap(2); pdf.text("Dates from TDG's crew file of " + fmtD(data.fileAt) + ".", { size: 7.5, color: SLATE }); }

  // 5. documents
  pdf.gap(14); pdf.newPageIfBelow(560);
  head("Documents", pdf.top); pdf.setTop(pdf.top + 20);
  const dx = [0, 88, 170, 248, 326, 456];
  pdf.row(["DOCUMENT", "NUMBER", "ISSUED", "EXPIRES", "ISSUED BY", "STANDING"], dx, { size: 7, bold: true, color: SLATE });
  pdf.hline(L, R, pdf.top - 3, [0.84, 0.87, 0.91]);
  for (const [label, exp, no, iss, place, opt] of docs) {
    const s = docStatus(exp, today);
    const standing = !isoD(exp) ? (opt ? "Not held" : "Missing") : (s.color === RED ? "Expired" : (s.color === AMBER ? "Expiring" : "Valid"));
    const col = !isoD(exp) ? (opt ? SLATE : RED) : (s.color === RED ? RED : (s.color === AMBER ? AMBER : GINK));
    pdf.row([label, clip(no || "-", 16), iss ? fmtD(iss) : "-", exp ? fmtD(exp) : "-", clip(place || "-", 24), ""], dx, { size: 9, color: INK, lh: 1.9 });
    pdf.textAt(standing, L + dx[5], pdf.top - 9 * 1.9 + 1.8, { size: 9, bold: true, color: col });
    pdf.hline(L, R, pdf.top - 4, LINE);
  }

  // 6. bonus standing — the two counts never confused (CLAUDE.md §10c): completed (cumulative) vs consecutive
  if (bonus && !bonus.error) {
    pdf.gap(14); pdf.newPageIfBelow(640);
    head("Bonus standing", pdf.top); pdf.setTop(pdf.top + 20);
    pdf.text("Completed contracts: " + (bonus.contracts != null ? bonus.contracts : "-") + "      " +
      "Consecutive bonus count: " + (bonus.count != null ? bonus.count : 0) + (bonus.baseline_set ? "" : "   (baseline not yet set)"), { size: 9.5, color: INK });
    if (bonus.nextRungIfClean) pdf.text("Next rung if the next contract is clean: " + money(bonus.nextRungIfClean), { size: 9.5, bold: true, color: GINK });
    const outs = bonus.outcomes || [];
    if (outs.length) {
      pdf.gap(4);
      pdf.row(["DATE", "SHIPS", "SCORE", "GATE", "PAY"], [0, 90, 300, 360, 430], { size: 7, bold: true, color: SLATE });
      for (const o of outs) {
        let ships = "";
        try { ships = JSON.parse(o.ships_json || "[]").join(", "); } catch (e) {}
        pdf.row([fmtD(o.committed_at), clip(ships, 34), (o.score_pct != null ? o.score_pct + "%" : "-"), (o.gate || "-"), money(o.pay_usd)], [0, 90, 300, 360, 430], { size: 9, color: INK });
      }
    } else pdf.text("No bonus paid yet.", { size: 9, color: SLATE });
  }

  // 7. footer on every page
  pdf.pages.forEach((pg, i) => {
    pg.push(`0.89 0.91 0.94 RG 0.75 w ${L} ${MARGIN - 6} m ${R} ${MARGIN - 6} l S\n`);
    const foot = (str, x, y, col = SLATE) => pg.push(`${col[0]} ${col[1]} ${col[2]} rg BT /F1 7.5 Tf ${x} ${y} Td (${String(str).replace(/[()\\]/g, "")}) Tj ET\n`);
    foot("Generated by CIMS for DG3 Cruise Industry Managed Services on " + fmtD(today) + ".", L, MARGIN - 18);
    foot("Questions: Rita Berenyi - rita.berenyi@dg3.com", L, MARGIN - 29);
    const pgTxt = (c.agency_id || "") + "   Page " + (i + 1) + " of " + pdf.pages.length;
    foot(pgTxt, R - Pdf.width(pgTxt, 7.5), MARGIN - 18);
  });
  return pdf.build();
}
