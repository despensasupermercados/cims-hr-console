// The crew survey for leadership: ONE page, the same sections in the same order as Reports › Crew survey (Miguel, 23 Oct 2026,
// on the first cut: "report needs re-do .. it does not make any sense"), read off the same report (surveyReport).
// Miguel, 23 Oct 2026, on the HR view: "4. pdf" — a download, never an email. Internal: names stay in; never sent to a
// cruise line, never the crew. Pure: (report, { today, lineLabel }) => Uint8Array.
import { Pdf, PAGE_W, PAGE_H, MARGIN } from "./pdf.js";

const NAVY = [0.106, 0.227, 0.361], DEEP = [0.078, 0.176, 0.282], GREEN = [0.373, 0.725, 0.275], GINK = [0.243, 0.498, 0.180];
const SLATE = [0.420, 0.447, 0.502], INK = [0.216, 0.255, 0.318], CLOUD = [0.953, 0.957, 0.965], GREY = [0.612, 0.639, 0.686];
const RED = [0.588, 0.157, 0.106], REDT = [0.957, 0.898, 0.890], AMBER = [0.718, 0.475, 0.122], AMBT = [0.965, 0.933, 0.882];
const SUBT = [0.584, 0.627, 0.678], LINE = [0.898, 0.906, 0.922], BLUE = [0.118, 0.435, 0.816];
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? +d.slice(8, 10) + " " + M[+d.slice(5, 7) - 1] + " " + d.slice(0, 4) : "");
const LINE_NAME = { Royal: "Royal", Celebrity: "Celebrity", Azamara: "Azamara", NCL: "Norwegian" };
const LINE_FULL = { Royal: "Royal Caribbean", Celebrity: "Celebrity", Azamara: "Azamara", NCL: "Norwegian" };
const LINES = ["Royal", "Celebrity", "Azamara", "NCL"];
const PERIOD = { "30D": "Last 30 days", QTD: "Quarter to date", YTD: "Year to date", All: "Everything on file" };
const fit = (s, w, size, bold) => { s = String(s == null ? "" : s); if (Pdf.width(s, size, bold) <= w) return s; while (s.length > 1 && Pdf.width(s + "…", size, bold) > w) s = s.slice(0, -1); return s.trimEnd() + "..."; };
function wrap(s, w, size, bold) {
  const out = []; let line = "";
  for (const word of String(s || "").split(/\s+/).filter(Boolean)) { const t = line ? line + " " + word : word; if (Pdf.width(t, size, bold) > w && line) { out.push(line); line = word; } else line = t; }
  if (line) out.push(line); return out;
}

export function composeSurveyReport(r, { today, lineLabel } = {}) {
  const pdf = new Pdf();
  const L = MARGIN, R = PAGE_W - MARGIN, W = R - L;
  const rtext = (s, x, top, o) => pdf.textAt(s, x - Pdf.width(s, o.size, o.bold), top, o);
  const caps = (s, x, top, col = SLATE) => pdf.textAt(s, x, top, { size: 6.5, bold: true, color: col, spacing: 0.9 });
  const col = (v) => (v == null ? GREY : v >= 4.5 ? GINK : v >= 4 ? NAVY : v >= 3 ? AMBER : RED);
  const f2 = (v) => (v == null ? "-" : v.toFixed(2));
  const lines = r.line === "all" ? LINES : [r.line];
  const lineName = lineLabel || (r.line === "all" ? "All cruise lines" : LINE_NAME[r.line] || r.line);
  const src = r.sources || {};

  // the letterhead (the CIMS standard: 60/40 rule, deep band, the wordmark and its underline)
  pdf.rect(0, 0, PAGE_W * 0.6, 5, NAVY).rect(PAGE_W * 0.6, 0, PAGE_W * 0.4, 5, GREEN).rect(0, 5, PAGE_W, 70, DEEP);
  pdf.textAt("CIMS", L, 23, { size: 20, bold: true, color: [1, 1, 1], spacing: 5 });
  pdf.rect(L, 48, 78, 2, GREEN);
  pdf.textAt("CRUISE INDUSTRY MANAGED SERVICES", L, 55, { size: 6, bold: true, color: SUBT, spacing: 1.6 });
  rtext("Internal - CIMS HR", R, 24, { size: 9, bold: true, color: [1, 1, 1] });
  rtext(day(today), R, 40, { size: 8, color: SUBT });

  // the title and what it covers: the same head as the page (Reports > Crew survey)
  let t = 92;
  pdf.textAt("Crew survey", L, t, { size: 19, bold: true, color: NAVY });
  t += 25;
  pdf.textAt(fit((PERIOD[r.p] || "") + "  ·  " + lineName + "  ·  " + r.n + " answers" + (src.forms ? "  (" + src.forms + " from the Microsoft Forms survey, " + (src.console || 0) + " from the console)" : ""), W, 9, false), L, t, { size: 9, color: SLATE });
  t += 20;

  // six numbers: the page's KPI strip
  const pct = (a, b) => (b ? Math.round(a / b * 100) + "%" : "-");
  const W8 = r.watch || [];
  const tiles = [
    [String(r.n), "Answers", r.n < r.minRead ? "below " + r.minRead + ": a floor check" : (r.quick ? r.quick + " quick, not averaged" : "in the period"), r.n < r.minRead ? AMBER : null],
    [f2(r.overall), "Overall / 5", r.fives + " gave 5", null],
    [r.wouldReturn ? r.wouldReturn.yes + " of " + r.wouldReturn.of : "-", "Would sail again", "4 or 5 on Would return", null],
    [r.n ? r.allSame + " of " + r.n : "-", "Same to all", "one number all the way down", r.n && r.allSame * 2 >= r.n ? RED : null],
    [r.rate ? pct(r.rate.answered, r.rate.of) : "-", "Answer rate", r.rate ? r.rate.answered + " of " + r.rate.of + " asked" : "starts with the console", null],
    [String(W8.length), "Watchlist", "3+ at 1-2 or would not return", W8.length ? RED : GINK],
  ];
  const g = 6, tw = (W - 5 * g) / 6;
  tiles.forEach(([v, l, s, c], i) => {
    const x = L + i * (tw + g);
    pdf.rrect(x, t, tw, 60, 5, CLOUD);
    pdf.textAt(fit(l.toUpperCase(), tw - 14, 6, true), x + 7, t + 8, { size: 6, bold: true, color: SLATE, spacing: 0.5 });
    pdf.textAt(fit(v, tw - 14, 15, true), x + 7, t + 19, { size: 15, bold: true, color: c || NAVY });
    wrap(s, tw - 14, 6.3, false).slice(0, 2).forEach((ln, j) => pdf.textAt(ln, x + 7, t + 39 + j * 8, { size: 6.3, color: SLATE }));
  });
  t += 74;

  // two blocks side by side: by cruise line | lowest statements
  const half = (W - 14) / 2, L2 = L + half + 14;
  const block = (x, top, title) => { caps(title.toUpperCase(), x, top); return top + 14; };
  let tl = block(L, t, "By cruise line"), tr = block(L2, t, "Lowest statements");
  const cA = L + 128, cO = L + 176, cR = L + half, hd = { size: 6.5, bold: true, color: SLATE };
  caps("LINE", L, tl); rtext("ANSWERS", cA, tl, hd); rtext("OVERALL", cO, tl, hd); rtext("WOULD RETURN", cR, tl, hd);
  tl += 10; pdf.hline(L, L + half, tl, LINE); tl += 5;
  const ret = (r.themes || []).find((x) => x.title === "Would return");
  const by = Object.fromEntries((r.byLine || []).map((x) => [x.line, x]));
  for (const l of lines) {
    const x = by[l] || { n: 0 }, rc = ret && ret.cells[l], ok = x.n >= r.minCell, rok = rc && rc.n >= r.minCell;
    pdf.textAt(LINE_FULL[l] || l, L, tl, { size: 8.5, color: INK });
    rtext(String((r.byLineCount || {})[l] || 0), cA, tl, { size: 8.5, color: INK });
    rtext(ok ? f2(x.avg) : "-", cO, tl, { size: 8.5, bold: ok, color: ok ? col(x.avg) : GREY });
    rtext(rok ? f2(rc.avg) : "-", cR, tl, { size: 8.5, bold: rok, color: rok ? col(rc.avg) : GREY });
    tl += 13; pdf.hline(L, L + half, tl - 3, LINE);
  }
  for (const ln of wrap("A line with fewer than " + r.minCell + " answers shows a dash: one person is not a line.", half, 6.8, false)) { pdf.textAt(ln, L, tl + 2, { size: 6.8, color: SLATE }); tl += 9; }
  const low = (r.statements || []).filter((s) => s.avg < 5), at5 = (r.statements || []).length - low.length;
  if (!low.length) { pdf.textAt("Every statement averages 5.0.", L2, tr, { size: 8.5, color: SLATE }); tr += 13; }
  for (const s of low.slice(0, 7)) {
    pdf.textAt(fit(s.short, 128, 8, false), L2, tr, { size: 8, color: INK });
    const bx = L2 + 132, bw = half - 132 - 24;
    pdf.rrect(bx, tr + 1, bw, 7, 3, CLOUD).rrect(bx, tr + 1, Math.max(4, bw * s.avg / 5), 7, 3, BLUE);
    rtext(s.avg.toFixed(1), L2 + half, tr, { size: 8, bold: true, color: col(s.avg) });
    tr += 13;
  }
  if (low.length > 7 || at5) { pdf.textAt([low.length > 7 ? (low.length - 7) + " more below 5" : "", at5 ? at5 + " at 5.0" : ""].filter(Boolean).join("  ·  "), L2, tr + 2, { size: 6.8, color: SLATE }); tr += 11; }
  t = Math.max(tl, tr) + 14;

  // the watchlist: a red rule, every statement at 1-2 by name, their own words
  if (W8.length) {
    const rows = W8.slice(0, 4).map((c) => {
      const why = [(c.why || []).includes("low") ? c.low.length + " answers at 1-2" : "", (c.why || []).includes("return") ? "would return " + c.ret : ""].filter(Boolean).join(" · ");
      // one page (Miguel approved it so): what does not fit is said, never cut silently (23 Oct 2026 review)
      const TAIL = " … more on the console";
      const more = (lines, n) => (lines.length > n ? lines.slice(0, n - 1).concat([fit(lines[n - 1], W - 24 - Pdf.width(TAIL, 7.5, false), 7.5, false).replace(/\.\.\.$/, "") + TAIL]) : lines);
      const detail = more(wrap(why + (c.low.length ? "  ·  " + c.low.map((x) => x.short + " " + x.v).join(", ") : ""), W - 24, 7.5, false), 3);
      const words = c.fix ? more(wrap("“" + c.fix + "”", W - 24, 7.5, false), 2) : [];
      return { c, detail, words, h: 14 + detail.length * 10 + words.length * 10 + 6 };
    });
    const h = 22 + rows.reduce((s, x) => s + x.h, 0) + (W8.length > 4 ? 12 : 0);
    pdf.rrect(L, t, W, h, 5, [1, 1, 1]).rect(L, t, 2.5, h, RED);
    caps("WATCHLIST  ·  " + W8.length, L + 12, t + 9, RED);
    let y = t + 22;
    for (const x of rows) {
      pdf.textAt(fit(x.c.name || "Name not given", 220, 9.5, true), L + 12, y, { size: 9.5, bold: true, color: NAVY });
      pdf.textAt(fit([x.c.ship, day(x.c.at)].filter(Boolean).join("  ·  "), W - 250, 7.5, false), L + 240, y + 1.5, { size: 7.5, color: SLATE });
      y += 14;
      x.detail.forEach((ln, i) => pdf.textAt(ln, L + 12, y + i * 10, { size: 7.5, bold: i === 0, color: i === 0 ? RED : INK }));
      y += x.detail.length * 10;
      x.words.forEach((ln, i) => pdf.textAt(ln, L + 12, y + i * 10, { size: 7.5, color: SLATE }));
      y += x.words.length * 10 + 6;
    }
    if (W8.length > 4) pdf.textAt("+ " + (W8.length - 4) + " more on the console.", L + 12, y, { size: 7.5, color: SLATE });
    t += h + 14;
  } else {
    pdf.rrect(L, t, W, 30, 5, [1, 1, 1]).rect(L, t, 2.5, 30, GREEN);
    caps("WATCHLIST", L + 12, t + 7, GINK);
    pdf.textAt("Clear - no answer in this period has 3 or more statements at 1-2 or would not return.", L + 12, t + 17, { size: 8, color: INK });
    t += 44;
  }

  // what they asked us to fix: the page's table, one example in their words under each theme
  caps("WHAT THEY ASKED US TO FIX", L, t); t += 14;
  const groups = r.fixGroups || [];
  if (!groups.length) { pdf.textAt("Nobody asked for something to be fixed in this period.", L, t, { size: 8.5, color: SLATE }); t += 14; }
  else {
    caps("THEME", L, t); caps("OWNER", L + 300, t); rtext("MENTIONS", R, t, { size: 6.5, bold: true, color: SLATE });
    t += 10; pdf.hline(L, R, t, LINE); t += 5;
    for (let gi = 0; gi < groups.length; gi++) {
      const gp = groups[gi];
      if (t > PAGE_H - 96) { pdf.textAt("+ " + (groups.length - gi) + " more theme" + (groups.length - gi === 1 ? "" : "s") + " on the console.", L, t, { size: 7.5, color: SLATE }); t += 12; break; }
      const ex = gp.items[0], exw = ex ? wrap("“" + ex.clause + "”  - " + (ex.name || "name not given"), W - 60, 7.3, false) : [];
      const exl = exw.length > 2 ? [exw[0], fit(exw[1] + " " + exw[2], W - 60, 7.3, false)] : exw;
      pdf.textAt(gp.label, L, t, { size: 9, bold: true, color: NAVY });
      pdf.textAt(gp.owner || "owner not set", L + 300, t, { size: 8.5, color: gp.owner ? INK : GREY });
      rtext(String(gp.n), R, t, { size: 9, bold: true, color: gp.hot ? RED : NAVY });
      exl.forEach((ln, i) => pdf.textAt(ln, L, t + 12 + i * 9.5, { size: 7.3, color: SLATE }));
      t += 14 + exl.length * 9.5 + 4;
      pdf.hline(L, R, t - 3, LINE);
    }
  }
  const quiet = [r.thanks ? r.thanks + " wrote thanks or \"all good\" (not counted as a fix)" : "", r.unwritten ? r.unwritten + " wrote nothing" : ""].filter(Boolean).join("  ·  ");
  pdf.textAt(fit("Grouped by keyword, no AI; one answer can ask about two themes." + (quiet ? "  " + quiet + "." : ""), W, 6.8, false), L, t + 2, { size: 6.8, color: SLATE });

  // the footer, every time
  const foot = "Internal - CIMS HR. Feedback only: never the Score Card or the bonus, never sent to a cruise line. A follow-up with a seafarer is a note on his profile.";
  pdf.hline(L, R, PAGE_H - 52, LINE);
  wrap(foot, W, 7, false).slice(0, 2).forEach((x, i) => pdf.textAt(x, L, PAGE_H - 46 + i * 9, { size: 7, color: SLATE }));
  return pdf.build();
}
