// Crew statement composer - pure. Turns crew + contracts + bonus into a PDF (via ./pdf.js).
// Brand: navy #1B3A5C, green #5FB946. Includes bonus standing (Miguel's choice 2026-06-12).

import { Pdf } from "./pdf.js";

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
export function composeStatement(data) {
  const c = data.crew || {};
  const contracts = data.contracts || [];
  const bonus = data.bonus || null;
  const today = (data.generatedAt || new Date().toISOString()).slice(0, 10);
  const pdf = new Pdf();

  // Header band
  pdf.bar(30, NAVY);
  pdf.text("DG3 CIMS  -  Crew Statement", { size: 14, bold: true, color: [1, 1, 1], lh: 1.1 });
  pdf.gap(8);
  pdf.text("DG3 Cruise Industry Managed Services  ·  Generated " + today, { size: 8.5, color: MUT });
  pdf.gap(6);

  // Crew identity
  pdf.text(fullName(c), { size: 18, bold: true, color: NAVY, lh: 1.2 });
  pdf.text((c.agency_id || "") + "   ·   " + (c.rank_override || c.rank_observed || "-"), { size: 10, color: MUT });
  pdf.text("Status: " + (c.status || "-") + "      Vessel: " + (c.vessel_observed || "-"), { size: 10 });
  const contact = [c.email, c.phone, c.province, (c.dob ? "DOB " + c.dob : "")].filter(Boolean).join("   ·   ");
  if (contact) pdf.text(contact, { size: 9, color: MUT });
  pdf.rule();

  // Document compliance
  pdf.text("Document compliance", { size: 11, bold: true, color: NAVY });
  pdf.gap(2);
  const docs = [
    ["Medical", c.med_exp], ["Seaman's book", c.sirb_exp], ["Passport", c.pp_exp],
    ["US visa (C1/D)", c.usv_exp], ["Schengen", c.sch_exp],
  ];
  for (const [label, dt] of docs) {
    const s = docStatus(dt, today);
    // Color the whole row by status so expired/expiring docs jump out on the printed statement.
    pdf.row([label, s.txt], [0, 150], { size: 9.5, color: s.color });
  }
  pdf.rule();

  // Bonus standing (included per policy decision)
  if (bonus && !bonus.error) {
    pdf.text("Bonus standing", { size: 11, bold: true, color: NAVY });
    pdf.gap(2);
    pdf.text("Rank: " + (bonus.rank || "-") + "      Completed contracts: " + (bonus.count != null ? bonus.count : 0) +
      (bonus.baseline_set ? "" : "   (baseline not yet set)"), { size: 9.5 });
    pdf.text("Next rung if clean: " + (bonus.nextRungIfClean != null ? money(bonus.nextRungIfClean) : "-"),
      { size: 9.5, bold: true, color: GREEN });
    pdf.gap(4);
    const outs = bonus.outcomes || [];
    if (outs.length) {
      pdf.row(["Date", "Ships", "Score", "Gate", "Pay"], [0, 90, 300, 360, 430], { size: 9, bold: true, color: MUT });
      for (const o of outs) {
        let ships = "";
        try { ships = JSON.parse(o.ships_json || "[]").join(", "); } catch (e) {}
        pdf.row([(o.committed_at || "").slice(0, 10), ships.slice(0, 34), (o.score_pct != null ? o.score_pct + "%" : "-"),
          (o.gate || "-"), money(o.pay_usd)], [0, 90, 300, 360, 430], { size: 9 });
      }
    } else {
      pdf.text("No bonus outcomes committed yet.", { size: 9, color: MUT });
    }
    pdf.rule();
  }

  // Contract history
  pdf.text("Contract history" + (data.daysWorked ? "   ·   " + Number(data.daysWorked).toLocaleString() + " sea-days" : ""),
    { size: 11, bold: true, color: NAVY });
  pdf.gap(2);
  if (!contracts.length) {
    pdf.text("No Keyman contract history on file.", { size: 9, color: MUT });
  } else {
    pdf.row(["#", "Ship", "Sign on", "Sign off", "Basis"], [0, 30, 230, 320, 410], { size: 9, bold: true, color: MUT });
    for (const x of contracts) {
      const off = x.act || x.proj || "-";
      const basis = x.act ? "actual" : (x.proj ? "projected" : "open");
      pdf.row([String(x.seq != null ? x.seq : ""), (x.ship || "-").slice(0, 32), x.on || "-", off, basis],
        [0, 30, 230, 320, 410], { size: 9 });
    }
  }

  pdf.gap(14);
  pdf.text("This statement is generated from DG3 CIMS records. For questions contact CIMS HR.", { size: 8, color: MUT });
  return pdf.build();
}
