// The crew survey for leadership: ONE page, read off the same report the page draws (surveyReport, src/crew_survey.js).
// Miguel, 23 Oct 2026, on the HR view: "4. pdf" — a download, never an email. Internal: names stay in; never sent to a
// cruise line, never the crew. Pure: (report, { today, lineLabel }) => Uint8Array.
import { Pdf, PAGE_W, PAGE_H, MARGIN } from "./pdf.js";

const NAVY = [0.106, 0.227, 0.361], DEEP = [0.078, 0.176, 0.282], GREEN = [0.373, 0.725, 0.275], GINK = [0.243, 0.498, 0.180];
const SLATE = [0.420, 0.447, 0.502], INK = [0.216, 0.255, 0.318], CLOUD = [0.953, 0.957, 0.965], GREY = [0.612, 0.639, 0.686];
const RED = [0.588, 0.157, 0.106], REDT = [0.957, 0.898, 0.890], AMBER = [0.718, 0.475, 0.122], AMBT = [0.965, 0.933, 0.882];
const SUBT = [0.584, 0.627, 0.678], LINE = [0.898, 0.906, 0.922];
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? +d.slice(8, 10) + " " + M[+d.slice(5, 7) - 1] + " " + d.slice(0, 4) : "");
const LINE_NAME = { Royal: "Royal", Celebrity: "Celebrity", Azamara: "Azamara", NCL: "Norwegian" };
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
  const heading = (s, top) => { pdf.textAt(s, L, top, { size: 11.5, bold: true, color: NAVY }); return top + 18; };

  // the letterhead (the CIMS standard: 60/40 rule, deep band, the wordmark and its underline)
  pdf.rect(0, 0, PAGE_W * 0.6, 5, NAVY).rect(PAGE_W * 0.6, 0, PAGE_W * 0.4, 5, GREEN).rect(0, 5, PAGE_W, 70, DEEP);
  pdf.textAt("CIMS", L, 23, { size: 20, bold: true, color: [1, 1, 1], spacing: 5 });
  pdf.rect(L, 48, 78, 2, GREEN);
  pdf.textAt("CRUISE INDUSTRY MANAGED SERVICES", L, 55, { size: 6, bold: true, color: SUBT, spacing: 1.6 });
  rtext("Crew survey  -  internal", R, 24, { size: 10, bold: true, color: [1, 1, 1] });
  rtext((PERIOD[r.p] || "") + "  ·  " + (lineLabel || (r.line === "all" ? "All lines" : LINE_NAME[r.line] || r.line)), R, 40, { size: 8, color: SUBT });
  rtext(day(today), R, 54, { size: 8, color: SUBT });

  // the answer in its first line
  let t = 94;
  const h = r.headline || {};
  for (const ln of wrap(h.lead, W, 19, true)) { pdf.textAt(ln, L, t, { size: 19, bold: true, color: NAVY }); t += 23; }
  if (h.rest) for (const ln of wrap(h.rest, W, 15, true)) { pdf.textAt(ln, L, t, { size: 15, bold: true, color: GREY }); t += 19; }
  t += 2;
  for (const ln of wrap(h.sub, W, 9.5, false)) { pdf.textAt(ln, L, t, { size: 9.5, color: INK }); t += 13; }
  t += 8;

  // five numbers, each topped by a status rule
  const pct = (a, b) => (b ? Math.round(a / b * 100) + "%" : "-");
  const tiles = [
    [String(r.n), "Answers", r.n < r.minRead ? "below " + r.minRead + ": a floor check" : "enough to read", r.n < r.minRead ? AMBER : GREEN],
    [r.wouldReturn ? r.wouldReturn.yes + " of " + r.wouldReturn.of : "-", "Would sail again", "4 or 5 on Would return", GREEN],
    [r.overall == null ? "-" : r.overall.toFixed(2), "Overall / 5", r.quick ? r.quick + " quick left out" : "Overall satisfaction", GREEN],
    [r.n ? r.allSame + " of " + r.n : "-", "Same answer to all", "every statement alike", r.n && r.allSame * 2 >= r.n ? RED : GREEN],
    [r.rate ? pct(r.rate.answered, r.rate.of) : "-", "Answer rate", r.rate ? r.rate.answered + " of " + r.rate.of + " asked" : "console invitations", r.rate && r.rate.answered / r.rate.of < 0.6 ? AMBER : GREY],
  ];
  const g = 7, tw = (W - 4 * g) / 5;
  tiles.forEach(([v, l, s, c], i) => {
    const x = L + i * (tw + g);
    pdf.rect(x, t, tw, 2.5, c).rect(x, t + 2.5, tw, 50, CLOUD);
    pdf.textAt(fit(v, tw - 16, 17, true), x + 8, t + 10, { size: 17, bold: true, color: NAVY });
    pdf.textAt(fit(l, tw - 16, 7.5, true), x + 8, t + 31, { size: 7.5, bold: true, color: INK });
    pdf.textAt(fit(s, tw - 16, 6.8, false), x + 8, t + 41, { size: 6.8, color: SLATE });
  });
  t += 68;

  // people to call
  t = heading("People to call", t);
  const calls = r.needsCall || [];
  if (calls.length) {
    for (const c of calls.slice(0, 5)) {
      const why = [(c.low || []).length >= 3 ? (c.low || []).length + " answers at 1-2" : "", c.why && c.why.includes("return") ? "would return " + c.ret : ""].filter(Boolean).join(" · ");
      pdf.rrect(L, t, W, 30, 5, REDT);
      pdf.textAt(fit(c.name || "Name not given", 200, 9.5, true), L + 10, t + 6, { size: 9.5, bold: true, color: RED });
      pdf.textAt(fit([c.ship, day(c.at)].filter(Boolean).join("  ·  "), 200, 7.5, false), L + 10, t + 18, { size: 7.5, color: SLATE });
      pdf.textAt(fit(why + ((c.low || []).length ? "  ·  " + c.low.map((x) => x.short + " " + x.v).join(", ") : ""), W - 230, 8, false), L + 220, t + 11, { size: 8, color: INK });
      t += 35;
    }
    if (calls.length > 5) { pdf.textAt("+ " + (calls.length - 5) + " more on the console.", L, t, { size: 8, color: SLATE }); t += 12; }
  } else {
    const c = r.closest;
    const line = "Nobody to call: no answer has 3 statements at 1-2 or would not return."
      + (c ? " Closest: " + (c.name || "name not given") + ", " + (c.ship || "") + " (" + [c.low.length ? c.low.map((x) => x.short + " " + x.v).join(", ") : "", c.fours ? c.fours + " at 4" : ""].filter(Boolean).join("; ") + ")." : "");
    const ls = wrap(line, W - 20, 8.5, false);
    pdf.rrect(L, t, W, 10 + ls.length * 11.5, 5, CLOUD);
    ls.forEach((x, i) => pdf.textAt(x, L + 10, t + 6 + i * 11.5, { size: 8.5, color: INK }));
    t += 16 + ls.length * 11.5;
  }
  t += 6;

  // where it hurts: themes x lines, the number behind every cell; under the minimum the cell stays grey
  t = heading("Where it hurts, by cruise line", t);
  const cols = ["Royal", "Celebrity", "Azamara", "NCL"], cx = [L + 150, L + 220, L + 290, L + 360, L + 430], cw = 62;
  caps("THEME", L, t, SLATE); cols.forEach((c, i) => caps(LINE_NAME[c].toUpperCase(), cx[i], t)); caps("ALL", cx[4], t);
  t += 11; pdf.hline(L, R, t, LINE); t += 4;
  for (const th of r.themes || []) {
    pdf.textAt(th.title, L, t + 3, { size: 9, bold: true, color: NAVY });
    const draw = (cell, x) => {
      const ok = cell && cell.n >= r.minCell && cell.avg != null;
      const bg = !ok ? null : cell.avg >= 4.5 ? [0.906, 0.953, 0.882] : cell.avg >= 4 ? [0.941, 0.965, 0.925] : cell.avg >= 3 ? AMBT : REDT;
      const fg = !ok ? GREY : cell.avg >= 4 ? GINK : cell.avg >= 3 ? AMBER : RED;
      if (bg) pdf.rrect(x - 4, t, cw - 8, 21, 3, bg);
      pdf.textAt(ok ? cell.avg.toFixed(2) : "-", x, t + 2, { size: 9, bold: ok, color: fg });
      pdf.textAt("n " + (cell ? cell.n : 0), x, t + 12.5, { size: 6.5, color: SLATE });
    };
    cols.forEach((c, i) => draw(th.cells[c], cx[i]));
    draw(th.all, cx[4]);
    t += 25;
  }
  pdf.textAt("A cell with fewer than " + r.minCell + " answers stays grey: one person cannot paint a whole line.", L, t + 1, { size: 7, color: SLATE });
  t += 18;

  // what they asked us to fix, by theme and owner
  t = heading("What they asked us to fix", t);
  const groups = r.fixGroups || [];
  if (!groups.length) { pdf.textAt("Nobody named something to fix in this period.", L, t, { size: 8.5, color: SLATE }); t += 14; }
  for (const gp of groups) {
    if (t > PAGE_H - 92) break;
    pdf.textAt(gp.label + (gp.owner ? "  ·  owner " + gp.owner : "  ·  no owner set") + "  ·  " + gp.n + (gp.n === 1 ? " mention" : " mentions"), L, t, { size: 8.5, bold: true, color: gp.hot ? RED : NAVY });
    t += 13;
    for (const it of gp.items.slice(0, 3)) {
      if (t > PAGE_H - 84) break;
      const ls = wrap("“" + it.clause + "”  - " + (it.name || "name not given") + ", " + (it.ship || ""), W - 12, 8, false).slice(0, 2);
      pdf.rect(L, t - 1, 2, ls.length * 10.5, gp.hot ? RED : AMBER);
      ls.forEach((x, i) => pdf.textAt(x, L + 9, t + i * 10.5, { size: 8, color: INK }));
      t += ls.length * 10.5 + 4;
    }
    t += 3;
  }

  // the footer, every time
  const foot = "Internal - CIMS HR. Feedback only: never the Score Card or the bonus, never sent to a cruise line. "
    + (r.sources ? (r.sources.forms ? r.sources.forms + " answers from the Microsoft Forms survey; " : "") + (r.sources.console || 0) + " from the console." : "");
  pdf.hline(L, R, PAGE_H - 52, LINE);
  wrap(foot, W, 7, false).slice(0, 2).forEach((x, i) => pdf.textAt(x, L, PAGE_H - 46 + i * 9, { size: 7, color: SLATE }));
  return pdf.build();
}
