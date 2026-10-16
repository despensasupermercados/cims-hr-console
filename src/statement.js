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
// REBUILT 13 Oct 2026 (Miguel, on the 12 Oct version: "the PDF still comes out pretty bad"; it left half the page empty
// and printed "-" in every empty cell). One page for a normal career: the CIMS band, the seafarer and the details on
// file for them to check, four shaded numbers, the current (or last) contract as a feature with its progress bar, the
// contracts as a striped table with a status pill, every document with number / issue / expiry / issuer and how long it
// has left, the bonus standing, and a "please check" note naming Rita. The statement goes to the SEAFARER: it never
// carries notes, field intel, feedback, the console's status word or its grade beside TDG's position (§10g).
// Helvetica, Latin-1 only (no arrows or dashes past 255: they would print "?").
const DEEP = [0.078, 0.176, 0.282], SUBT = [0.584, 0.627, 0.678], SLATE = [0.42, 0.45, 0.50], INK = [0.086, 0.161, 0.239];
const LINE = [0.89, 0.91, 0.94], GINK = [0.243, 0.498, 0.180], CLOUD = [0.953, 0.961, 0.973], ZEBRA = [0.980, 0.984, 0.988];
const GTINT = [0.902, 0.945, 0.882], RTINT = [0.957, 0.898, 0.890], ATINT = [0.965, 0.933, 0.882], NTINT = [0.906, 0.925, 0.953];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoD = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
export const fmtD = (v) => { const d = isoD(v); return d ? MON[+d.slice(5, 7) - 1] + " " + (+d.slice(8, 10)) + ", " + d.slice(0, 4) : "-"; };
const dayN = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
function spanTxt(on, off) {
  const a = isoD(on), b = isoD(off); if (!a || !b || b < a) return "-";
  let m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); let d = +b.slice(8, 10) - +a.slice(8, 10);
  if (d < 0) { m -= 1; const ay = +a.slice(0, 4), am = +a.slice(5, 7) - 1 + m, ad = Math.min(+a.slice(8, 10), new Date(Date.UTC(ay, am + 1, 0)).getUTCDate()); d = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(ay, am, ad)) / 864e5); } // the days left after m whole months from a, month-end clamped (Jul 31 -> Mar 1 = 7 mo 1 d, never 7 mo -2 d)
  return (m ? m + " mo" : "") + (m && d ? " " : "") + (d || !m ? d + " d" : "");
}
// How long a document has left, in words a seafarer reads ("in 1 yr 5 mo", "in 4 mo 27 d", "3 mo 2 d ago").
function leftTxt(exp, today) {
  const e = isoD(exp); if (!e) return "";
  const a = e < today ? e : today, b = e < today ? today : e;
  let m = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); if (+b.slice(8, 10) < +a.slice(8, 10)) m -= 1;
  const t = m >= 12 ? Math.floor(m / 12) + " yr" + (m % 12 ? " " + (m % 12) + " mo" : "") : spanTxt(a, b); // under a year: months and days ("4 mo 27 d"), never a day count (16 Oct 2026)
  return e < today ? t + " ago" : (e === today ? "today" : "in " + t);
}
const portTxt = (p) => String(p || "").split(",")[0].trim().toLowerCase().replace(/(^|[ -])[a-z]/g, (m) => m.toUpperCase());
// Time at sea in months and days, as the profile says it (Miguel, 13 Oct 2026: "X months at sea .. 1 is enough"): each
// contract's calendar span to its sign-off or today, added up, days carried into months at 30.
export function seaTime(contracts, today) {
  let m = 0, d = 0;
  for (const x of contracts || []) {
    const a = isoD(x.on); if (!a || a > today) continue;
    // only a RECORDED sign-off ends the time at sea; a running / overdue / held contract (no act) is at sea to today
    const off = isoD(x.act), b = off && off < today ? off : today;
    if (b < a) continue; // a sign-off before the sign-on adds nothing (never subtracts)
    let mm = (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)), dd = +b.slice(8, 10) - +a.slice(8, 10);
    if (dd < 0) { mm -= 1; const ay = +a.slice(0, 4), am = +a.slice(5, 7) - 1 + mm, ad = Math.min(+a.slice(8, 10), new Date(Date.UTC(ay, am + 1, 0)).getUTCDate()); dd = Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(ay, am, ad)) / 864e5); }
    m += mm; d += dd;
  }
  m += Math.floor(d / 30); d %= 30;
  return m ? m + " mo" + (d ? " " + d + " d" : "") : d + " d";
}
// Cut a string to a width in points (real Helvetica metrics), with a trailing "." when cut.
const fit = (s, w, size, bold) => { s = String(s == null ? "" : s); if (Pdf.width(s, size, bold) <= w) return s; while (s.length > 1 && Pdf.width(s + ".", size, bold) > w) s = s.slice(0, -1); return s.trimEnd() + "."; };
// Word-wrap to a width; returns lines.
function wrap(s, w, size, bold) {
  const out = []; let line = "";
  // A word wider than the column (a URL in a field report) is cut into pieces that fit — it ran off the page (13 Oct 2026).
  const pieces = (word) => { const p = []; let cur = ""; for (const ch of word) { if (cur && Pdf.width(cur + ch, size, bold) > w) { p.push(cur); cur = ch; } else cur += ch; } if (cur) p.push(cur); return p; };
  for (const word0 of String(s || "").split(/\s+/)) for (const word of (Pdf.width(word0, size, bold) > w ? pieces(word0) : [word0])) { const t = line ? line + " " + word : word; if (Pdf.width(t, size, bold) > w && line) { out.push(line); line = word; } else line = t; }
  if (line) out.push(line); return out;
}

export function composeStatement(data) {
  const c = data.crew || {};
  const INT = !!data.feedback; // the INTERNAL crew file (13 Oct 2026): HR reads it, so nothing on it is addressed to the crew
  const contracts = (data.contracts || []).slice().sort((a, b) => String(a.on || "").localeCompare(String(b.on || "")));
  const bonus = data.bonus || null;
  const today = (data.generatedAt || new Date().toISOString()).slice(0, 10);
  const pdf = new Pdf();
  const L = MARGIN, R = PAGE_W - MARGIN, W = R - L, BOTTOM = PAGE_H - 68;
  const rtext = (str, x, top, o) => pdf.textAt(str, x - Pdf.width(str, o.size, o.bold) - (o.spacing || 0) * String(str).length, top, o);
  const caps = (str, x, top, col = SLATE, size = 6.5) => pdf.textAt(str, x, top, { size, bold: true, color: col, spacing: 0.9 });
  const pill = (txt, xRight, top, bg, fg, size = 7) => { const w = Pdf.width(txt, size, true) + 14; pdf.rrect(xRight - w, top, w, size + 7, (size + 7) / 2, bg); pdf.textAt(txt, xRight - w + 7, top + 3.6, { size, bold: true, color: fg }); return w; };
  const room = (h) => { if (pdf.top + h > BOTTOM) { pdf._newPage(); pdf.setTop(60); return true; } return false; };
  const section = (title, note, need = 60) => { room(22 + need); const t = pdf.top; pdf.textAt(title, L, t, { size: 12, bold: true, color: INK }); if (note) rtext(note, R, t + 3, { size: 7.5, color: SLATE }); pdf.setTop(t + 20); };

  // 1. the letterhead: the 60/40 rule over the deep band, the wordmark, its underline, the subtitle; the date on the right
  pdf.rect(0, 0, PAGE_W * 0.6, 5, NAVY).rect(PAGE_W * 0.6, 0, PAGE_W * 0.4, 5, GREEN).rect(0, 5, PAGE_W, 76, DEEP);
  pdf.textAt("CIMS", L, 25, { size: 22, bold: true, color: [1, 1, 1], spacing: 5 });
  pdf.rect(L, 52, 78, 2, GREEN);
  pdf.textAt("CRUISE INDUSTRY MANAGED SERVICES", L, 60, { size: 6, bold: true, color: SUBT, spacing: 1.6 });
  rtext(data.feedback ? "Crew file  -  internal" : "Crew statement", R, 26, { size: 10, bold: true, color: [1, 1, 1] });
  rtext(fmtD(today), R, 41, { size: 13, bold: true, color: [1, 1, 1] });
  if (c.agency_id) rtext((INT ? "" : "Issued to ") + c.agency_id, R, 60, { size: 7.5, color: SUBT });

  // 2. who: the name, the position TDG holds, the ship; beside it the details on file, for them to check
  const name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") || c.agency_id || "Crew";
  const PX = L + 300, PW = R - PX;
  let ns = 22; while (ns > 15 && Pdf.width(name, ns, true) > PX - L - 14) ns -= 1;
  pdf.textAt(fit(name, PX - L - 14, ns, true), L, 104, { size: ns, bold: true, color: NAVY }); // never under the details box
  const pos = c.rank_override || c.rank_observed || "";
  if (pos) pdf.textAt(pos, L, 134, { size: 9.5, bold: true, color: GINK });
  pdf.textAt((c.agency_id || "") + (c.ship_crew_id ? "  ·  Ship ID " + c.ship_crew_id : ""), L + (pos ? Pdf.width(pos, 9.5, true) + 10 : 0), 134, { size: 9, color: SLATE });
  const last = contracts[contracts.length - 1] || null;
  const running = last && !last.act && isoD(last.on) && last.on <= today;
  if (last) pdf.textAt((running ? "On board " : "Last ship ") + (last.ship || ""), L, 152, { size: 9, color: SLATE });
  const emg = [c.emergency_name, c.emergency_relation ? "(" + c.emergency_relation + ")" : "", c.emergency_phone].filter(Boolean).join(" ");
  const det = [["Born", c.dob ? fmtD(c.dob) : ""], ["Province", c.province || ""], ["Mobile", c.phone || ""], ["Email", c.email || ""], ["Emergency", emg]];
  pdf.rrect(PX, 98, PW, 78, 6, CLOUD);
  caps(INT ? "DETAILS ON FILE" : "YOUR DETAILS ON FILE  \u00b7  PLEASE CHECK", PX + 12, 106, SLATE, 6);
  det.forEach(([k, v], i) => {
    const t = 118 + i * 10.6;
    pdf.textAt(k, PX + 12, t, { size: 7.5, color: SLATE });
    pdf.textAt(v ? fit(v, PW - 72, 8, true) : "Not on file", PX + 60, t, { size: 8, bold: !!v, color: v ? INK : SUBT });
  });

  // 3. four numbers, shaded tiles with a coloured mark
  const DOCS = [["Medical", c.med_exp, c.med_cert_no, c.med_issue, c.med_place], ["Seaman book", c.sirb_exp, c.sirb_no, c.sirb_issue, c.sirb_place],
    ["Passport", c.pp_exp, c.pp_no, c.pp_issue, c.pp_place], ["US visa (C1/D)", c.usv_exp, c.usv_no, c.usv_issue, c.usv_place], ["Schengen", c.sch_exp, c.sch_no, c.sch_issue, c.sch_place, true]];
  // Read against the running contract, as the profile reads them (Miguel, 13 Oct 2026: "this is also important .. also in
  // the PDF"): expired today = Expired, valid today but gone before the sign-off = Lapses; with no contract running, today
  // and the next 90 days (Expiring).
  const lastC = contracts[contracts.length - 1] || null;
  const runOff = lastC && !lastC.act && isoD(lastC.on) && lastC.on <= today && isoD(lastC.proj) ? lastC.proj : null;
  const stOf = (exp, opt) => { const e = isoD(exp); if (!e) return opt ? "Not held" : "Missing";
    if (runOff) return e < today ? "Expired" : (e < runOff ? "Lapses" : "Valid");
    const s = docStatus(e, today); return s.color === RED ? "Expired" : (s.color === AMBER ? "Expiring" : "Valid"); };
  const valid = DOCS.filter((d) => !d[5] && (stOf(d[1]) === "Valid" || (!runOff && stOf(d[1]) === "Expiring"))).length;
  const docCol = valid === 4 ? GREEN : (DOCS.some((d) => !d[5] && (stOf(d[1]) === "Expired" || stOf(d[1]) === "Missing")) ? RED : AMBER);
  const cnt = bonus && bonus.contracts != null ? bonus.contracts : null;
  const cntSub = bonus && bonus.contracts_source === "tdg" && bonus.contracts_as_of ? "TDG count, " + fmtD(bonus.contracts_as_of) + (bonus.contracts_added ? " + " + bonus.contracts_added : "") : INT ? "from the contract dates" : "from your contract dates";
  const tiles = [[cnt != null ? String(cnt) : "-", "Completed contracts", cnt != null ? cntSub : "", GREEN],
    [seaTime(contracts, today), "Time at sea", contracts.length + " contract" + (contracts.length === 1 ? "" : "s"), GREEN],
    [valid + " of 4", "Documents valid", runOff ? "for this contract, to " + fmtD(runOff) : "required documents, today", docCol],
    [bonus ? String(bonus.count != null ? bonus.count : 0) : "-", "Bonus count", bonus && bonus.nextRungIfClean ? "next clean contract: " + money(bonus.nextRungIfClean) : (bonus && bonus.baseline_set === false ? "consecutive, baseline not set" : "consecutive contracts"), NAVY]];
  const tg = 8, tw = (W - 3 * tg) / 4, tt = 184, th = 58;
  tiles.forEach(([n, l, sub, col], i) => {
    const x = L + i * (tw + tg);
    pdf.rrect(x, tt, tw, th, 6, CLOUD).rect(x + 12, tt + 13, 2.5, 20, col);
    pdf.textAt(n, x + 21, tt + 12, { size: 19, bold: true, color: NAVY });
    pdf.textAt(l, x + 12, tt + 37, { size: 7.5, bold: true, color: INK });
    if (sub) pdf.textAt(fit(sub, tw - 20, 6.8), x + 12, tt + 47, { size: 6.8, color: SLATE });
  });

  // 4. the current (or last) contract, as a feature: the ship, the route, the progress bar between the two dates
  pdf.setTop(tt + th + 12);
  if (last) {
    const t = pdf.top, h = 80, off = last.act || last.proj || null;
    pdf.rrect(L, t, W, h, 8, CLOUD);
    caps(running ? "CURRENT CONTRACT" : "LAST CONTRACT", L + 16, t + 14, GINK);
    pdf.textAt(fit(last.ship || "-", W - 200, 16, true), L + 16, t + 24, { size: 16, bold: true, color: NAVY });
    const route = last.from || last.to ? portTxt(last.from || "?") + "  to  " + portTxt(last.to || "?") : "";
    if (route) pdf.textAt(route, L + 16, t + 42, { size: 8.5, color: SLATE });
    if (running) pill("On board", R - 16, t + 12, GTINT, GINK); else pill(last.act ? "Signed off" : "Planned", R - 16, t + 12, last.act ? NTINT : ATINT, last.act ? NAVY : AMBER);
    const lenTxt = off ? spanTxt(last.on, running ? today : off) : "";
    if (lenTxt && lenTxt !== "-") { rtext(lenTxt, R - 16, t + 31, { size: 13, bold: true, color: NAVY }); rtext(running ? "aboard so far" : "served", R - 16, t + 45, { size: 7.5, color: SLATE }); }
    const bx = L + 16, bw = W - 32, by = t + 56;
    pdf.rrect(bx, by, bw, 6, 3, LINE);
    let pct = 1;
    if (running && off && isoD(last.on)) pct = Math.max(0.02, Math.min(1, (dayN(today) - dayN(last.on)) / Math.max(1, dayN(off) - dayN(last.on))));
    pdf.rrect(bx, by, Math.max(6, bw * pct), 6, 3, GREEN);
    pdf.textAt("Signed on  " + fmtD(last.on), bx, by + 12, { size: 7.5, bold: true, color: INK });
    const endTxt = (last.act ? "Signed off  " : (off ? "Projected sign-off  " : "Sign-off  ")) + (off ? fmtD(off) : "not set");
    rtext(endTxt, bx + bw, by + 12, { size: 7.5, bold: true, color: last.act ? INK : AMBER });
    pdf.setTop(t + h + 16);
  }

  // 5. contracts: a striped table, the status as a pill
  section("Contracts", data.fileAt ? "Dates from TDG's crew file of " + fmtD(data.fileAt) + "." : "");
  const cx = [8, 24, 100, 252, 322, 392, W - 8];
  const tHead = () => {
    const t = pdf.top; pdf.rrect(L, t, W, 18, 4, CLOUD);
    ["#", "SHIP", "ROUTE", "SIGNED ON", "SIGNED OFF", "LENGTH"].forEach((h, i) => caps(h, L + cx[i], t + 6.5));
    rtext("STATUS", L + cx[6], t + 6.5, { size: 6.5, bold: true, color: SLATE, spacing: 0.9 }); pdf.setTop(t + 20);
  };
  tHead();
  if (!contracts.length) { pdf.textAt("No contract on file.", L + cx[1], pdf.top + 6, { size: 8.5, color: SLATE }); pdf.setTop(pdf.top + 22); }
  contracts.forEach((x, i) => {
    if (room(20)) tHead();
    const t = pdf.top, off = x.act || x.proj || null, cur = !x.act && isoD(x.on) && x.on <= today;
    if (i % 2) pdf.rect(L, t, W, 20, ZEBRA);
    const o = { size: 8.5, color: INK };
    pdf.textAt(String(i + 1), L + cx[0], t + 6, { size: 8.5, color: SLATE });
    pdf.textAt(fit(x.ship || "-", cx[2] - cx[1] - 8, 8.5, true), L + cx[1], t + 6, { size: 8.5, bold: true, color: INK });
    const rt = x.from || x.to ? portTxt(x.from || "?") + " - " + portTxt(x.to || "?") : "";
    pdf.textAt(rt ? fit(rt, cx[3] - cx[2] - 8, 8) : "Not on file", L + cx[2], t + 6.3, { size: 8, color: rt ? INK : SUBT });
    pdf.textAt(fmtD(x.on), L + cx[3], t + 6, o);
    pdf.textAt(off ? fmtD(off) : "Not set", L + cx[4], t + 6, { size: 8.5, color: off ? (x.act ? INK : AMBER) : SUBT });
    pdf.textAt(off ? spanTxt(x.on, x.act ? off : (cur ? today : off)) : "-", L + cx[5], t + 6, o);
    if (x.act) pill("Completed", L + cx[6], t + 3.5, GTINT, GINK, 6.8); else if (cur) pill("On board", L + cx[6], t + 3.5, GTINT, GINK, 6.8); else pill("Planned", L + cx[6], t + 3.5, ATINT, AMBER, 6.8);
    pdf.setTop(t + 20);
  });
  pdf.hline(L, R, pdf.top, LINE);
  pdf.setTop(pdf.top + 16);

  // 6. documents: number, issue, expiry with the time left, issuer, standing
  section("Documents", runOff ? (INT ? "Read against the current contract, to " : "Read against your current contract, to ") + fmtD(runOff) + ". Lapses = expires before the sign-off." : "Standing on " + fmtD(today) + ". Expiring = within 90 days.");
  const dx = [8, 92, 178, 250, 334, W - 8];
  const dHead = () => {
    const t = pdf.top; pdf.rrect(L, t, W, 18, 4, CLOUD);
    ["DOCUMENT", "NUMBER", "ISSUED", "EXPIRES", "ISSUED BY"].forEach((h, i) => caps(h, L + dx[i], t + 6.5));
    rtext("STANDING", L + dx[5], t + 6.5, { size: 6.5, bold: true, color: SLATE, spacing: 0.9 }); pdf.setTop(t + 20);
  };
  dHead();
  DOCS.forEach(([label, exp, no, iss, place, opt], i) => {
    if (room(24)) dHead();
    const t = pdf.top, st = stOf(exp, opt);
    if (i % 2) pdf.rect(L, t, W, 24, ZEBRA);
    const nf = (v, w) => (v ? { s: fit(v, w, 8.5), c: INK } : { s: opt && !isoD(exp) ? "" : "Not on file", c: SUBT });
    pdf.textAt(label, L + dx[0], t + 8, { size: 8.5, bold: true, color: INK });
    const n1 = nf(no, dx[2] - dx[1] - 8); pdf.textAt(n1.s, L + dx[1], t + 8, { size: 8.5, color: n1.c });
    const n2 = nf(iss ? fmtD(iss) : "", 70); pdf.textAt(n2.s, L + dx[2], t + 8, { size: 8.5, color: n2.c });
    if (isoD(exp)) { pdf.textAt(fmtD(exp), L + dx[3], t + 4.5, { size: 8.5, color: INK }); pdf.textAt(leftTxt(exp, today), L + dx[3], t + 14, { size: 6.8, color: st === "Expired" ? RED : (st === "Expiring" || st === "Lapses" ? AMBER : SLATE) }); }
    else pdf.textAt(opt ? "" : "Not on file", L + dx[3], t + 8, { size: 8.5, color: SUBT });
    const P = { Valid: [GTINT, GINK], Expiring: [ATINT, AMBER], Lapses: [ATINT, AMBER], Expired: [RTINT, RED], Missing: [RTINT, RED], "Not held": [CLOUD, SLATE] }[st];
    const pw = pill(st === "Not held" ? "Not held (optional)" : st, L + dx[5], t + 6, P[0], P[1], 6.8);
    const n3 = nf(place, dx[5] - dx[4] - pw - 10); pdf.textAt(n3.s, L + dx[4], t + 8, { size: 8.5, color: n3.c });
    pdf.setTop(t + 24);
  });
  pdf.hline(L, R, pdf.top, LINE);
  pdf.setTop(pdf.top + 20);

  // 7. bonus paid — the two counts are the tiles above, never confused (CLAUDE.md §10c: completed is cumulative, the
  // bonus count is consecutive); what was paid is listed here, unchanged from the bonus ledger. Nothing paid = no section.
  const outs = bonus && !bonus.error ? bonus.outcomes || [] : [];
  if (outs.length) {
    section("Bonus paid", "", 20 + outs.length * 20);
    const ox = [8, 100, 330, 390, W - 8];
    const t = pdf.top; pdf.rrect(L, t, W, 18, 4, CLOUD);
    ["PAID ON", "SHIPS", "SCORE", "GATE"].forEach((h, i) => caps(h, L + ox[i], t + 6.5));
    rtext("PAY", L + ox[4], t + 6.5, { size: 6.5, bold: true, color: SLATE, spacing: 0.9 });
    pdf.setTop(t + 20);
    outs.forEach((o, i) => {
      room(20); const y = pdf.top;
      if (i % 2) pdf.rect(L, y, W, 20, ZEBRA);
      let ships = ""; try { ships = JSON.parse(o.ships_json || "[]").join(", "); } catch (e) {}
      pdf.textAt(fmtD(o.committed_at), L + ox[0], y + 6, { size: 8.5, color: INK });
      pdf.textAt(fit(ships, 220, 8.5), L + ox[1], y + 6, { size: 8.5, color: INK });
      pdf.textAt(o.score_pct != null ? o.score_pct + "%" : "-", L + ox[2], y + 6, { size: 8.5, color: INK });
      pdf.textAt(o.gate || "-", L + ox[3], y + 6, { size: 8.5, color: INK });
      rtext(money(o.pay_usd), L + ox[4], y + 6, { size: 8.5, bold: true, color: INK });
      pdf.setTop(y + 20);
    });
    pdf.hline(L, R, pdf.top, LINE);
    pdf.setTop(pdf.top + 18);
  }

  // 8. please check — who to write to; on the last page only when it fits (the footer says it on every page)
  const ct = pdf.top, msg = "If your name, your details, a contract date or a document is wrong, reply to the email this came with, or write to Rita Berenyi at rita.berenyi@dg3.com. CIMS corrects it and sends you a new statement.";
  const lines = wrap(msg, W - 40, 8.5);
  if (!INT && ct + 22 + lines.length * 11.5 <= BOTTOM) { // the crew file is HR's: nothing asks the crew to check it
  pdf.rrect(L, ct, W, 22 + lines.length * 11.5, 6, GTINT).rect(L, ct + 8, 3, 6 + lines.length * 11.5, GREEN);
  pdf.textAt("Please check this statement.", L + 16, ct + 9, { size: 9, bold: true, color: GINK });
  lines.forEach((ln, i) => pdf.textAt(ln, L + 16, ct + 22 + i * 11.5, { size: 8.5, color: INK }));
  }

  // 9. CONTRACT FEEDBACK — the internal crew file only (Miguel, 13 Oct 2026: "in a clean page .. regardless if there is space
  // on a previous one .. as Contract feedback .. the entire historical data"). Always starts a new page; every contract,
  // newest first, everything said in it. Never in the crew's statement or its email (data.feedback is absent there).
  let fbStart = null;
  const FBK = data.feedback;
  if (FBK) {
    pdf._newPage(); fbStart = pdf.pages.length - 1;
    const KC = { note: [0.118, 0.435, 0.816], comment: [0.118, 0.435, 0.816], intel: RED, feedback: [0.478, 0.357, 0.780], review: [0.478, 0.357, 0.780] };
    pdf.rect(0, 0, PAGE_W * 0.6, 5, NAVY).rect(PAGE_W * 0.6, 0, PAGE_W * 0.4, 5, GREEN);
    pdf.textAt("Contract feedback", L, 34, { size: 20, bold: true, color: NAVY });
    rtext(name, R, 36, { size: 10, bold: true, color: INK }); rtext(c.agency_id || "", R, 50, { size: 8, color: SLATE });
    pdf.textAt("Everything recorded about this seafarer, every contract, newest first. Internal - never sent to the crew.", L, 62, { size: 8.5, color: SLATE });
    pdf.setTop(84); // (the feedback-requests strip is not printed: Miguel, 13 Oct 2026, "this is not needed in the PDF")
    const LX = 112, TW = W - LX;
    const line = (str, x, o, lh) => { room(lh); const t = pdf.top; pdf.textAt(str, x, t, o); pdf.setTop(t + lh); };
    for (const g of FBK.groups || []) {
      room(70);
      const t = pdf.top, k = g.contract;
      const title = k ? "Contract " + k.n + "  -  " + (k.ship || "") : "Between contracts";
      const span = k ? fmtD(k.on) + "  to  " + (k.off ? fmtD(k.off) : "open") + (k.current ? "  -  running" : "") : "notes and reports dated outside a contract";
      const endTxt = k && (k.earlyDays || k.end) ? [k.earlyDays ? "Ended " + (k.earlyText || "") + " early" : "", k.end ? "Why: " + k.end.reason + (k.end.note ? " - " + k.end.note : "") : ""].filter(Boolean).join("   ") : "";
      pdf.rrect(L, t, W, endTxt ? 34 : 22, 5, NTINT);
      pdf.textAt(title, L + 12, t + 6, { size: 10.5, bold: true, color: NAVY });
      rtext(span, R - 12, t + 7.5, { size: 8, color: SLATE });
      if (endTxt) pdf.textAt(fit(endTxt, W - 24, 8, true), L + 12, t + 21, { size: 8, bold: true, color: RED });
      pdf.setTop(t + (endTxt ? 34 : 22) + 8);
      if (!g.items.length) { line("Nothing recorded in this contract.", L + 12, { size: 8.5, color: SLATE }, 18); continue; }
      g.items.forEach((it, idx) => {
        room(34);
        const top = pdf.top, col = KC[it.kind] || SLATE;
        pdf.textAt(fmtD(it.at), L, top, { size: 8.5, bold: true, color: INK });
        pdf.rect(L, top + 14, 5, 5, col);
        pdf.textAt(it.label, L + 9, top + 12.5, { size: 7.5, bold: true, color: col });
        if (it.who) pdf.textAt(fit(it.who, LX - 14, 7.5), L, top + 24, { size: 7.5, color: SLATE });
        let first = true;
        if (it.tags.length) {
          // the answers as label + value, two columns
          const CW = TW / 2;
          for (let q = 0; q < it.tags.length; q += 2) {
            room(12); const y = pdf.top;
            [it.tags[q], it.tags[q + 1]].forEach((tg, ci) => { if (!tg) return; const x = L + LX + ci * CW, lab = tg[0] + "  ";
              pdf.textAt(lab, x, y + 0.6, { size: 7.5, color: SLATE });
              pdf.textAt(fit(tg[1], CW - Pdf.width(lab, 7.5) - 8, 8.5, true), x + Pdf.width(lab, 7.5), y, { size: 8.5, bold: true, color: INK }); });
            pdf.setTop(y + 12.5);
          }
          first = false;
        }
        for (const ln0 of it.lines) {
          // an intel part's label in bold, its text running on beside it
          const lab = ln0.label ? ln0.label + ":  " : "", lw = lab ? Pdf.width(lab, 8.5, true) : 0;
          const words = String(ln0.text || "").split(/\s+/).filter(Boolean);
          let head = "";
          while (words.length && Pdf.width(head ? head + " " + words[0] : words[0], 8.5) <= TW - lw) head = head ? head + " " + words.shift() : words.shift();
          room(12); const y = pdf.top;
          if (lab) pdf.textAt(lab, L + LX, y, { size: 8.5, bold: true, color: INK });
          pdf.textAt(head, L + LX + lw, y, { size: 8.5, color: INK }); pdf.setTop(y + 12);
          if (words.length) wrap(words.join(" "), TW, 8.5).forEach((ln) => line(ln, L + LX, { size: 8.5, color: INK }, 12));
          first = false;
        }
        if (it.superseded) line("Earlier answer - kept, not used for scoring.", L + LX, { size: 7.5, color: SLATE }, 11);
        if (it.meta) line(it.meta, L + LX, { size: 7.5, color: SLATE }, 11);
        if (first) pdf.setTop(top + 12);
        pdf.setTop(Math.max(pdf.top, top + 34) + 6);
        if (idx < g.items.length - 1) { pdf.hline(L, R, pdf.top - 4, LINE); }
      });
      pdf.setTop(pdf.top + 10);
    }
  }

  // 10. footer on every page
  pdf.pages.forEach((pg, i) => {
    pg.push(`0.89 0.91 0.94 RG 0.75 w ${L} ${MARGIN - 6} m ${R} ${MARGIN - 6} l S\n`);
    const foot = (str, x, y, col = SLATE) => pg.push(`${col[0]} ${col[1]} ${col[2]} rg BT /F1 7.5 Tf ${x} ${y} Td (${String(str).replace(/[()\\]/g, "")}) Tj ET\n`);
    foot("Generated by CIMS for DG3 Cruise Industry Managed Services on " + fmtD(today) + ".", L, MARGIN - 18);
    if (INT) foot("Internal - CIMS HR crew file. Not for the crew.", L, MARGIN - 29, RED);
    else foot("Questions: Rita Berenyi - rita.berenyi@dg3.com. Something wrong? Reply to the email or write to her.", L, MARGIN - 29);
    const pgTxt = (c.agency_id || "") + "   Page " + (i + 1) + " of " + pdf.pages.length;
    foot(pgTxt, R - Pdf.width(pgTxt, 7.5), MARGIN - 18);
  });
  return pdf.build();
}
