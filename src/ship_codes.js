// The two-letter ship codes the team reads at a glance (Miguel, 13 Oct 2026: "use the 1st 2 letters .. we all
// recognize them"). They are NOT the first two letters: that rule collides on six pairs (Quantum/Quest,
// Independence/Infinity, Apex/Ascent, Liberty/Legend, Solstice/Silhouette, Summit/Star). These are the cruise
// lines' own codes, the prefix of every ship's role mailboxes, copied from cims-timecard `ship_contact`
// (48 hulls, 13 Oct 2026). A hull added to the fleet needs its row here; an unknown hull falls back to its
// first two letters so the page never shows a blank.
export const SHIP_CODES = {
  // Royal Caribbean
  adventure: "AD", allure: "AL", anthem: "AN", brilliance: "BR", enchantment: "EN", explorer: "EX",
  freedom: "FR", grandeur: "GR", harmony: "HM", icon: "IC", independence: "ID", jewel: "JW", legend: "LE",
  liberty: "LB", mariner: "MA", navigator: "NV", oasis: "OA", odyssey: "OY", ovation: "OV", quantum: "QN",
  radiance: "RD", rhapsody: "RH", serenade: "SR", spectrum: "SC", star: "ST", symphony: "SY", utopia: "UT",
  vision: "VI", voyager: "VY", wonder: "WN",
  // Celebrity
  apex: "AX", ascent: "AT", beyond: "BY", constellation: "CS", eclipse: "EC", edge: "EG", equinox: "EQ",
  infinity: "IN", millennium: "ML", reflection: "RF", silhouette: "SI", solstice: "SL", summit: "SM", xcel: "XC",
  // Azamara
  journey: "JR", onward: "ON", pursuit: "PR", quest: "QS",
};

// "MV CELEBRITY CONSTELLATION", "Liberty of the Seas", "Azamara Quest", "Quest" -> the one word that names the hull.
export function shipWord(name) {
  return String(name || "").toLowerCase()
    .replace(/^m\/?v\.?\s+/, "")
    .replace(/\b(celebrity|azamara|royal caribbean)\b/g, "")
    .replace(/\bof the seas\b/g, "")
    .replace(/[^a-z]+/g, " ").trim().split(" ").filter(Boolean).pop() || "";
}

export function shipCode(name) {
  const w = shipWord(name);
  if (!w) return "";
  return SHIP_CODES[w] || w.slice(0, 2).toUpperCase();
}
