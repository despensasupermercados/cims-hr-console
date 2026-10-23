// THE CREW HUB — one page per seafarer, reached by their own link (Miguel, 19 Oct 2026: "a 'good to know' that points them
// there ... the landing page that they can read"; of the options, "Per-crew link"; the mock-up approved with "deploy").
// No login: the link is the key (crew_hub_link, revocable). Pure: (model) => HTML. The bonus ladder is READ from bonus.js
// (never copied, never written — §1); the wording is the one Miguel approved on 19 Oct 2026 ("ok cool"). Payroll dates
// are data (payroll.js). Every value from the database is escaped. Pinned by test/crew_hub.test.js.
import { LADDER, ladderValue, FLOOR } from "./bonus.js";
import { payrollRows, nextPayday, PAYROLL } from "./payroll.js";

export const HUB_UPDATED = "19 Oct 2026";
const L = { ticket: "https://support.onboardprint.com", house: "https://house.cims.work/book", expense: "/hub/expense.xlsx",
  shipsupport: "mailto:Shipsupport@DG3.com", ray: "mailto:Ray.Guerra@dg3.com", zendesk: "https://support.onboardprint.com/hc/en-us" };

// ---- dates (calendar dates, UTC arithmetic only) ----
const D = (s) => new Date(s + "T00:00:00Z");
const days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dm = (s) => `${+s.slice(8)} ${MON[+s.slice(5, 7) - 1]}`;
const dmy = (s) => `${dm(s)} ${s.slice(0, 4)}`;
const wd = (s) => WD[D(s).getUTCDay()];
const usd = (n) => "$" + n.toLocaleString("en-US");
const iso = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
export const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---- icons (24px, stroke) ----
const P = {
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3.6 17.4a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.3-.3-2.4z",
  box: "M21 7.5 12 3 3 7.5l9 4.5 9-4.5zM3 7.5v9l9 4.5 9-4.5v-9M12 12v9",
  bed: "M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12.2a1.7 1.7 0 1 0 0-.01",
  down: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  cal: "M4 6.5h16V20H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7l11-3.5V7M16.5 13.5h.01",
  trophy: "M8 21h8M12 16.5V21M7 4h10v5a5 5 0 0 1-10 0zM17 5.5h3V8a3 3 0 0 1-3 3M7 5.5H4V8a3 3 0 0 0 3 3",
  shield: "M12 3l7.5 3v6c0 4.6-3.2 7.9-7.5 9-4.3-1.1-7.5-4.4-7.5-9V6z",
  shirt: "M8.5 3.5 4 6l1.8 4L8 9.2V20h8V9.2l2.2.8L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0z",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z",
  mail: "M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8M12 17h.01",
  check: "M5 12.5l4.2 4.2L19 7",
  arrow: "M5 12h14M13 6l6 6-6 6",
  ship: "M3 17l1.6 3h14.8l1.6-3M5 17V11h14v6M8 11V7h8v4M12 4v3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  alert: "M12 3.5 2.5 20h19zM12 10v4.5M12 17.5h.01",
  pin: "M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
};
const ic = (k, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k]}"/></svg>`;

// m = { first, ship, code, brand ("Royal" | "Celebrity" | "Azamara" | null), on, off, offProjected, contractNo (null when the
// consecutive count is not known: no baseline and no committed outcome), today }
export function hubPage(m) {
  const TODAY = iso(m && m.today) || new Date().toISOString().slice(0, 10);
  const on = iso(m.on), off = iso(m.off), hasK = !!(on && off && off >= on);
  const CREW = { first: esc(m.first || "there"), ship: esc(m.ship || ""), code: esc(m.code || ""),
    brand: String(m.brand || "").toLowerCase(), on, off, offProjected: !!m.offProjected,
    contractNo: Number.isInteger(m.contractNo) && m.contractNo >= 1 ? m.contractNo : null };
  const year = TODAY.slice(0, 4);
  const rows = payrollRows(year);
  const next = nextPayday(TODAY);
  const inDays = next ? next.inDays : null;
  const cDays = hasK ? days(on, off) : 0, cDay = hasK ? Math.max(1, days(on, TODAY) + 1) : 0, cPct = hasK ? Math.min(100, Math.max(2, Math.round(100 * cDay / cDays))) : 0;
  const stepNow = CREW.contractNo ? ladderValue(CREW.contractNo) : 0, stepNext = CREW.contractNo ? ladderValue(CREW.contractNo + 1) : 0;
  const total9 = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((a, n) => a + ladderValue(n), 0);
  const exStep = stepNow > 0 ? stepNow : 500, example = Math.round(exStep * 90 / 100);
  // Where the sign-off date comes from (§10d): TDG's word is final; Rita's date or her reliever card is a plan; else projected.
  const offNote = m.offSource === "tdg" ? "Sign-off confirmed by TDG." : (m.offSource === "rita" || m.offSource === "card") ? "Sign-off planned by Rita. TDG confirms it later." : "Sign-off projected. TDG confirms it later.";
// ---- sections ----
  const NAV = [["payday", "Payday", "cal"], ["pay", "Pay & benefits", "wallet"], ["bonus", "Bonus", "trophy"], ["house", "Staff House", "bed"],
    ["help", "Get help", "help"], ["ordering", "Ordering", "box"], ["uniform", "Uniform", "shirt"], ["safety", "Safety", "shield"], ["values", "Our values", "heart"]];
  const head = (id, eyebrow, title, lead) => `<header class="sh"><div class="eb">${eyebrow}</div><h2>${title}</h2>${lead ? `<p class="lead">${lead}</p>` : ""}</header>`;
  
  const tiles = rows.map((r) => {
    const st = r.paid < TODAY ? "past" : next && r.paid === next.paid ? "next" : "";
    return `<li class="pt ${st}">${st === "next" ? `<span class="tag">Next</span>` : st === "past" ? `<span class="tick">${ic("check")}</span>` : ""}
     <span class="pm">${MON[r.m - 1]} pay</span><b class="pd">${dm(r.paid)}</b><span class="pw">${wd(r.paid).slice(0, 3)}${st === "next" ? ` &middot; in ${inDays} d` : ""}</span></li>`;
  }).join("");
  
  const ben = (v, t, line, more) => `<li class="bn"><div class="bh"><span class="bt">${t}</span><b class="bv">${v}</b></div><div class="bl">${line}</div>${more ? `<details><summary>What it covers</summary>${more}</details>` : ""}</li>`;
  
  const maxStep = Math.max(...LADDER);
  const ladder = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
    const v = ladderValue(n), h = v ? Math.round(18 + 82 * v / maxStep) : 6;
    const st = n < CREW.contractNo ? "done" : n === CREW.contractNo ? "now" : "";
    return `<li class="lb ${st}" style="--p:${h}%"><span class="lv">${st === "now" ? `<span class="you">You</span>` : ""}${v ? usd(v) : "$0"}</span><span class="bar"></span><span class="ln">${n}</span></li>`;
  }).join("");
  
  const step = (n, t) => `<li><span class="sn">${n}</span><span>${t}</span></li>`;
  const ROYAL = ["Get the order schedule from inventory management onboard, every week.", "Review last month's consumption and today's counts onboard.",
    "Build your statistics file with everything you gathered.", "Create the order on OBP by the schedule's due date. US ships keep the next 3 months on OBP, international ships the next 6.",
    "One order a month is best. A spare container? Split the order to balance stock.", "Tell shoreside management about any request, change or approval.",
    "DG3 shoreside approves. Then the order is created in CrunchTime, approved by the GSM / DCM and the IM (MOT).",
    "DG3 receives the PO two weeks before delivery to Weston; the order goes into a container and comes onboard.",
    "Inspect and accept the whole delivery on OBP within 24 hours. Report any shortage with backup data, per the SOP."];
  const AZ = ["DG3 sends the ordering schedule every two weeks or monthly. Review it.", "DG3 orders toner and paper for the Konica C4070.",
    "You create the orders for Konica C4070 parts. MFD toners and parts are sent as the ship needs them.", "Tell shoreside management about any request, change or approval.",
    "DG3 approves your order, gets the PO and processes it. It goes to the Blue Water Shipping warehouse, then onboard.",
    "Inspect and accept the whole delivery on OBP within 24 hours. Report any shortage with backup data, per the SOP."];
  // Norwegian (the Getaway pilot, in service 16 Nov 2026). NCL orders through its own MXP system from a template DG3 built
  // for the ship; the steps are what the Brain holds on it (recD2YcbbX9kaEHn0, rec2sYS0HGZgAGZkv, rec2S1tG9DnBiOmtt,
  // rec1chZ7sqWRJ2g5e). Miguel, 23 Oct 2026: "we need to bring them now because the crew has them"; then, who does what:
  // "the printer update OBP .. MXP will be managed by the linen keeper for right now".
  const NCL = ["Every two weeks the ship's linen keeper raises the Getaway order in MXP, NCL's own system, from the template DG3 built for the ship. Give the linen keeper your counts and what you need in time.",
    "You keep OBP up to date every day, like on every ship. It is the record DG3 checks the order against.",
    "Watch NCL's storing dates: an order closes two days before the storing date.", "Tell shoreside management about any request, change or approval.",
    "DG3 shoreside approves the order. Apollo, NCL's warehouse in Miami, receives it and trucks it to the port for the storing date.",
    "Check the delivery against the order the day it comes aboard. Report any shortage to shoreside within 24 hours, with backup data."];
  const DAILY = ["Update OBP every day with any change in toner, paper and parts.", "Keep your printer logs up to date. They are your backup data.",
    "Check your usage once a week, so you never need an emergency order.", "Can't avoid an emergency order? Raise it early, with the documents."];
  
  const TEAM = [["Rolando Abellan", "Head of Tech Support", "Rolando.Abellan@dg3.com"], ["Ohji Miranda", "Technical Operations", "Ohji.Miranda@dg3.com"],
    ["Ray Guerra", "Inventory & supplies", "Ray.Guerra@dg3.com"], ["Jonathan Alonzo", "Inventory Operations", "Jonathan.Alonzo@dg3.com"],
    ["Joemar De Leon", "Training", "Joemar.Deleon@dg3.com"], ["Dexter Lawrence", "Traveling Manager", "Dexter.Lawrence@dg3.com"],
    ["Rita Berenyi", "HR & scheduling", "Rita.Berenyi@dg3.com"]];
  const ini = (n) => n.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("");
  const amp = (s) => s.replace(/&/g, "&amp;");
  
  const VALUES = [["One Team", "Different views, one crew. That is where good ideas come from."],
    ["People Commitment", "You have a voice, and you own your growth and your career."],
    ["Operational Excellence", "Do the work well, measure it, make it better, every day."],
    ["Passion for Results", "Meet what we promised, on money, on operations and on people, the right way."],
    ["Integrity", "Honest and consistent, so every guest and client can trust us."],
    ["Customer Focus", "Know what the people we serve need, and give it to them on time."]];
  
  const css = `
  :root{--navy:#1B3A5C;--deep:#142D48;--green:#5FB946;--gink:#3E7F2E;--slate:#6B7280;--cloud:#F3F4F6;--border:#E5E7EB;--body:#374151;--grey:#9CA3AF;--sub:#95A0AD;--gtint:#EAF4E6;--amber:#B7791F;--atint:#F6EEE1;--red:#96281B;--rtint:#F4E5E3;--ntint:#E8EEF5;
  --fh:'Outfit',Helvetica,Arial,sans-serif;--fb:'DM Sans',Helvetica,Arial,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--cloud);color:var(--body);font:15px/1.55 var(--fb)}
  a{color:var(--navy)}h1,h2,h3{font-family:var(--fh);color:var(--navy);margin:0}
  .ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
  .rule{display:flex;height:4px}.rule i{flex:60;background:var(--navy)}.rule i+i{flex:40;background:var(--green)}
  .top{background:var(--deep);color:#fff;padding:0 16px 88px}
  .wrap{max-width:1120px;margin:0 auto}
  .brand{display:flex;align-items:center;justify-content:space-between;padding:20px 0 0}
  .wm{font:700 20px/1 var(--fh);letter-spacing:5px;color:#fff}.wm i{display:block;width:78px;height:2px;background:var(--green);margin:7px 0 5px}
  .wm small{display:block;font:600 7px/1 var(--fb);letter-spacing:2.2px;color:var(--sub)}
  .hubtag{font:700 11px/1 var(--fb);letter-spacing:2px;color:var(--sub);border:1px solid #2C4A6B;border-radius:999px;padding:8px 12px}
  .hello{padding:44px 0 0}.hello h1{color:#fff;font-size:44px;font-weight:600;letter-spacing:-.8px;line-height:1.05}
  .hello p{margin:12px 0 0;color:#C9D1DB;font-size:17px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .hello .code{font:700 12px/1 var(--fb);letter-spacing:1px;background:#21405F;color:#fff;border-radius:6px;padding:5px 7px}
  .cards{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:16px;margin:-64px auto 0;padding:0 16px;max-width:1152px}
  .card{display:flex;flex-direction:column;background:#fff;border-radius:20px;padding:22px 24px;box-shadow:0 1px 2px rgba(20,45,72,.06),0 8px 24px rgba(20,45,72,.06)}
  .lab{font:700 11px/1 var(--fb);letter-spacing:1.6px;text-transform:uppercase;color:var(--slate)}
  .lab.g{color:var(--gink)}
  .big{font:600 40px/1.05 var(--fh);color:var(--navy);letter-spacing:-.6px;margin-top:12px}
  .mid{font:600 21px/1.2 var(--fh);color:var(--navy);margin-top:12px}
  .muted{color:var(--slate);font-size:14px}
  .pill{display:inline-flex;align-items:center;gap:6px;font:700 12px/1 var(--fb);border-radius:999px;padding:7px 11px;background:var(--gtint);color:var(--gink)}
  .row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .track{height:6px;border-radius:6px;background:var(--cloud);margin:16px 0 8px;overflow:hidden}.track i{display:block;height:100%;background:var(--green);border-radius:6px}
  .ends{display:flex;justify-content:space-between;font-size:13px;color:var(--slate)}.ends b{color:var(--navy);font-weight:700}
  .spark{display:flex;align-items:flex-end;gap:4px;height:40px;margin-top:14px}.spark i{flex:1;background:var(--ntint);border-radius:3px 3px 1px 1px}.spark i.d{background:#C4D0DD}.spark i.n{background:var(--green)}
  .go{align-self:flex-start;margin-top:auto!important;padding-top:14px;display:inline-flex;align-items:center;gap:6px;font:700 13px/1 var(--fb);color:var(--navy);text-decoration:none;margin-top:14px}.go .ic{width:16px;height:16px}
  .quick{max-width:1152px;margin:16px auto 0;padding:0 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;list-style:none}
  .quick li{display:flex}.quick a{flex:1;display:flex;align-items:center;gap:14px;background:#fff;border-radius:16px;padding:16px 18px;text-decoration:none;border:1px solid var(--border);min-height:76px}
  .quick a:hover{border-color:#C4D0DD}
  .qi{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--ntint);color:var(--navy);flex:none}
  .qi.g{background:var(--gtint);color:var(--gink)}
  .qt{font:600 16px/1.2 var(--fh);color:var(--navy)}.qs{font-size:13px;color:var(--slate);line-height:1.35;margin-top:2px}
  .quick .ic.ar{width:18px;height:18px;margin-left:auto;color:var(--grey)}
  .layout{max-width:1152px;margin:28px auto 0;padding:0 16px 40px;display:grid;grid-template-columns:200px 1fr;gap:28px;align-items:start}
  nav.rail{position:sticky;top:16px}
  nav.rail a{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;color:var(--body);text-decoration:none;font-weight:500;font-size:14px}
  nav.rail a .ic{width:18px;height:18px;color:var(--slate)}nav.rail a:hover{background:#fff;color:var(--navy)}
  main{min-width:0}main section{background:#fff;border-radius:20px;padding:28px 30px;margin-bottom:16px;scroll-margin-top:16px;border:1px solid var(--border)}
  .sh{margin-bottom:20px}.eb{font:700 12px/1 var(--fb);letter-spacing:1.4px;text-transform:uppercase;color:var(--gink)}
  .sh h2{font-size:28px;font-weight:600;letter-spacing:-.4px;margin-top:10px;line-height:1.15}.lead{margin:8px 0 0;font-size:15px;color:var(--body);max-width:640px}
  ol,ul{margin:0;padding:0;list-style:none}
  .pay{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
  .pt{position:relative;border:1px solid var(--border);border-radius:14px;padding:14px 12px 12px;display:flex;flex-direction:column;gap:2px;min-height:96px}
  .pm{font-size:12px;color:var(--slate);font-weight:500}.pd{font:600 22px/1.15 var(--fh);color:var(--navy);margin-top:6px}.pw{font-size:12px;color:var(--slate)}
  .pt.past{background:var(--cloud);border-color:var(--cloud)}.pt.past .pd{color:var(--grey)}
  .pt.next{border:2px solid var(--green);padding:13px 11px 11px;background:#F7FBF5}.pt.next .pw{color:var(--gink);font-weight:700}
  .tag{position:absolute;top:12px;right:10px;font:700 10px/1 var(--fb);letter-spacing:1px;text-transform:uppercase;background:var(--green);color:#fff;border-radius:999px;padding:4px 7px}
  .tick{position:absolute;top:10px;right:10px;color:var(--grey)}.tick .ic{width:16px;height:16px}
  .note{display:flex;gap:10px;margin-top:16px;font-size:13.5px;color:var(--slate);line-height:1.5}.note .ic{width:18px;height:18px;margin-top:1px}
  .grp{font:700 12px/1 var(--fb);letter-spacing:1.4px;text-transform:uppercase;color:var(--slate);margin:24px 0 12px}.grp:first-of-type{margin-top:0}
  .bens{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .bn{border:1px solid var(--border);border-radius:14px;padding:15px 16px}.bh{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
  .bv{font:600 18px/1.2 var(--fh);color:var(--gink);white-space:nowrap}.bt{font-weight:700;color:var(--navy);font-size:15px;line-height:1.3}.bl{font-size:13.5px;color:var(--slate);line-height:1.45;margin-top:4px}
  details{margin-top:8px;font-size:13.5px}summary{cursor:pointer;color:var(--navy);font-weight:700;list-style:none}summary::-webkit-details-marker{display:none}summary:after{content:" +";color:var(--grey)}details[open] summary:after{content:" \\2212"}
  details ul{margin-top:6px}details li{padding:3px 0;color:var(--body)}details li b{color:var(--navy)}
  .ladder{display:grid;grid-template-columns:repeat(9,1fr);gap:8px;height:220px;align-items:end;padding:26px 0 0}
  .lb{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
  .lb .bar{height:var(--p);width:100%;max-width:56px;background:var(--ntint);border-radius:8px 8px 3px 3px}.lb.done .bar{background:#C4D0DD}.lb.now .bar{background:var(--green)}
  .lv{display:flex;flex-direction:column;align-items:center;gap:6px;font:600 13px/1 var(--fh);color:var(--navy);margin-bottom:6px;white-space:nowrap}.lb.now .lv{color:var(--gink);font-size:15px}
  .ln{font-size:12px;color:var(--slate);margin-top:8px;font-weight:700}
  .you{font:700 10px/1 var(--fb);letter-spacing:1px;text-transform:uppercase;background:var(--navy);color:#fff;border-radius:999px;padding:4px 8px}
  .axis{display:flex;justify-content:space-between;font-size:12px;color:var(--slate);border-top:1px solid var(--border);margin-top:8px;padding-top:8px}
  .rules{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}
  .rl{border-radius:14px;padding:14px 16px;font-size:14px;line-height:1.5;border-left:3px solid}
  .rl b{display:block;color:var(--navy);font-family:var(--fh);font-size:16px;font-weight:600;margin-bottom:4px}
  .rl.g{background:var(--gtint);border-color:var(--green)}.rl.a{background:var(--atint);border-color:var(--amber)}.rl.r{background:var(--rtint);border-color:var(--red)}
  .small{font-size:13px;color:var(--slate);margin-top:14px}
  .house{display:grid;grid-template-columns:1.3fr 1fr;gap:16px}
  .facts{display:grid;grid-template-columns:1fr;gap:9px}.facts li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.4}.facts .ic{color:var(--gink);width:20px;height:20px}
  .book{background:var(--deep);color:#C9D1DB;border-radius:16px;padding:20px 22px}.book .big{color:#fff;font-size:34px;margin-top:10px}.book .lab{color:var(--sub)}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--green);color:#fff;text-decoration:none;font:700 15px/1 var(--fb);border-radius:12px;padding:15px 18px;margin-top:16px}
  .btn .ic{width:18px;height:18px}.btn.s{background:var(--ntint);color:var(--navy)}
  .hr{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.hr li{display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.45;background:var(--cloud);border-radius:12px;padding:12px 14px}
  .num{font:700 14px/1 var(--fh);color:#fff;background:var(--navy);border-radius:999px;width:26px;height:26px;display:grid;place-items:center;flex:none}
  .helpg{display:grid;grid-template-columns:1.1fr 1fr;gap:12px}.hstack{display:grid;gap:12px}
  .hc{border:1px solid var(--border);border-radius:16px;padding:18px;display:flex;flex-direction:column}
  .hc h3{font-size:18px;font-weight:600}.hc .muted{margin-top:4px}.hc .btn{margin-top:auto}.hstack .hc .btn{margin-top:14px}
  .hc ul{margin:12px 0 16px}.hc li{display:flex;gap:8px;font-size:13.5px;padding:3px 0}.hc li .ic{width:16px;height:16px;color:var(--gink);margin-top:2px}
  .hc.main{border:2px solid var(--green)}
  .team{display:grid;grid-template-columns:repeat(2,1fr);gap:0 24px;margin-top:8px}
  .teamh{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:28px}.pilln{display:inline-flex;align-items:center;gap:8px;font:700 13px/1 var(--fb);color:var(--navy);text-decoration:none;background:var(--ntint);border-radius:999px;padding:9px 13px}.pilln .ic{width:16px;height:16px}.tm{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border);text-decoration:none}
  .av{width:36px;height:36px;border-radius:999px;background:var(--ntint);color:var(--navy);font:700 13px/36px var(--fh);text-align:center;flex:none}
  .tm b{display:block;color:var(--navy);font-size:14.5px;line-height:1.25}.tm span span{font-size:13px;color:var(--slate)}.tm .em{margin-left:auto;font-size:13px;font-weight:700;color:var(--navy);white-space:nowrap}
  .tabs{display:inline-flex;background:var(--cloud);border-radius:12px;padding:4px;gap:4px;margin-bottom:18px}
  .tabs label{font:700 14px/1 var(--fb);color:var(--slate);padding:11px 16px;border-radius:9px;cursor:pointer}
  #t1:checked~.tabs label[for=t1],#t2:checked~.tabs label[for=t2],#t3:checked~.tabs label[for=t3]{background:#fff;color:var(--navy);box-shadow:0 1px 2px rgba(20,45,72,.12)}
  .tp{display:none}#t1:checked~.p1,#t2:checked~.p2,#t3:checked~.p3{display:block}input.tr{position:absolute;opacity:0;pointer-events:none}
  .steps li{display:flex;gap:14px;align-items:flex-start;padding:10px 0;font-size:14.5px;line-height:1.5;position:relative}
  .steps li:not(:last-child):before{content:"";position:absolute;left:13px;top:38px;bottom:-6px;width:2px;background:var(--border)}
  .sn{font:700 13px/1 var(--fh);color:var(--navy);background:var(--ntint);border-radius:999px;width:28px;height:28px;display:grid;place-items:center;flex:none}
  .daily{background:var(--gtint);border-radius:16px;padding:16px 18px;margin-top:18px}.daily h3{font-size:16px;font-weight:600;margin-bottom:8px}
  .daily li{display:flex;gap:10px;font-size:14px;padding:4px 0}.daily .ic{width:18px;height:18px;color:var(--gink);margin-top:1px}
  .uni{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .uc{border:1px solid var(--border);border-radius:16px;padding:18px}.uc h3{font-size:18px;font-weight:600}.uc .muted{margin-top:2px}
  .uc li{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:14.5px}.uc li:last-child{border:0}.uc li b{color:var(--navy)}
  .warnb{display:flex;gap:12px;background:var(--atint);border-left:3px solid var(--amber);border-radius:0 12px 12px 0;padding:14px 16px;font-size:14.5px;line-height:1.5}.warnb .ic{color:var(--amber)}
  .lift{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}
  .lf{border:1px solid var(--border);border-radius:16px;padding:16px}.lf .n{font:600 34px/1 var(--fh);color:var(--green)}.lf p{margin:10px 0 0;font-size:14.5px;line-height:1.45;color:var(--navy);font-weight:500}
  .hit{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.hit li{font-size:13.5px;font-weight:700;color:var(--navy);background:var(--ntint);border-radius:999px;padding:8px 13px}
  .vals{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .vl{border-radius:16px;padding:18px;background:var(--cloud)}.vl b{display:block;font:600 17px/1.2 var(--fh);color:var(--navy)}.vl span{display:block;font-size:14px;line-height:1.45;margin-top:6px}
  footer{max-width:1152px;margin:0 auto;padding:8px 16px 48px;font-size:13px;color:var(--slate);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .chips{display:none}
  @media (max-width:980px){.layout{grid-template-columns:minmax(0,1fr)}nav.rail{display:none}
   .chips{display:flex;gap:8px;overflow-x:auto;position:sticky;top:0;z-index:5;background:var(--cloud);padding:12px 16px;margin:0 -16px;scrollbar-width:none}
   .chips::-webkit-scrollbar{display:none}
   .chips a{flex:none;font:700 13px/1 var(--fb);color:var(--navy);text-decoration:none;background:#fff;border:1px solid var(--border);border-radius:999px;padding:10px 14px}
   .cards{grid-template-columns:1fr 1fr}.cards .card:first-child{grid-column:1/-1}.quick{grid-template-columns:1fr 1fr}
   .pay{grid-template-columns:repeat(4,1fr)}.lift{grid-template-columns:1fr 1fr}.helpg{grid-template-columns:1fr}.hc .btn{margin-top:4px}}
  @media (max-width:640px){body{font-size:15px}.top{padding-bottom:76px}.hello{padding-top:32px}.hello h1{font-size:34px}.hello p{font-size:15px}
   .cards{grid-template-columns:1fr;gap:12px}.card{padding:20px}.big{font-size:36px}
   .quick{gap:10px}.quick a{flex-direction:column;align-items:flex-start;gap:10px;padding:14px;min-height:0}.quick .ic.ar{display:none}.qt{font-size:15px}
   .layout{margin-top:12px;gap:0}main section{padding:22px 18px;border-radius:18px;margin-bottom:12px}.sh h2{font-size:24px}
   .pay{grid-template-columns:repeat(3,1fr);gap:8px}.pt{padding:12px 10px 10px;min-height:88px}.pt.next{padding:11px 9px 9px}.pd{font-size:19px}.pm{font-size:11.5px}
   .tag{display:none}.tick{top:8px;right:8px}
   .bens{grid-template-columns:1fr}.bn{padding:14px}.bv{font-size:17px}
   .ladder{display:flex;flex-direction:column;align-items:stretch;height:auto;gap:6px;padding-top:4px}.lb{display:grid;grid-template-columns:14px minmax(0,1fr) 104px;align-items:center;gap:10px;height:26px}.lb .bar{grid-column:2;grid-row:1;height:100%;width:var(--p);max-width:none;border-radius:3px 7px 7px 3px}.ln{grid-column:1;grid-row:1;margin:0;text-align:right}.lv{grid-column:3;grid-row:1;flex-direction:row;justify-content:flex-end;margin:0;font-size:13px}.lb.now .lv{font-size:14px}.axis{display:none}.you{font-size:9px;padding:3px 6px}
   .rules{grid-template-columns:1fr}.house{grid-template-columns:1fr}.facts{grid-template-columns:1fr}.hr{grid-template-columns:1fr}
   .team{grid-template-columns:1fr}.tm .em{font-size:0}.tm .em:after{content:"\\203A";font-size:22px;color:var(--grey)}
   .tabs{display:flex}.tabs label{flex:1;text-align:center;padding:11px 8px;font-size:13px}
   .uni{grid-template-columns:1fr}.lift{grid-template-columns:1fr 1fr}.vals{grid-template-columns:1fr}.vl{padding:14px 16px}.helpg{grid-template-columns:1fr}}
  @media (max-width:360px){.pay{grid-template-columns:repeat(2,1fr)}.lift{grid-template-columns:1fr}.hello h1{font-size:30px}.quick a{padding:12px}.qs{font-size:12.5px}}
  `;
  
  const html = `<!DOCTYPE html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow"><title>CIMS Crew Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Outfit:wght@500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style></head>
  <body>
  <div class="rule"><i></i><i></i></div>
  <div class="top"><div class="wrap">
   <div class="brand"><div class="wm">CIMS<i></i><small>CRUISE INDUSTRY MANAGED SERVICES</small></div><span class="hubtag">CREW HUB</span></div>
   <div class="hello"><h1>Hi ${CREW.first}.</h1><p>${hasK && CREW.ship ? `${CREW.code ? `<span class="code">${CREW.code}</span>` : ""}${CREW.ship} &middot; day ${cDay} of your contract` : "Everything you need, on one page."}</p></div>
  </div></div>
  
  <div class="cards">
   <div class="card">${next ? `
    <div class="row"><span class="lab g">Next payday</span><span class="pill">${ic("cal")}${inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`}</span></div>
    <div class="big">${wd(next.paid).slice(0, 3)} ${dm(next.paid)}</div>
    <div class="muted" style="margin-top:6px">Pay for ${MONTH[next.m - 1]}, straight to your bank or Brightwell card.</div>` : `
    <span class="lab g">Next payday</span>
    <div class="mid">Dates coming soon</div>
    <div class="muted" style="margin-top:6px">Payroll has not published the next dates yet. They appear here as soon as it does.</div>`}
    <a class="go" href="#payday">Every ${year} payday ${ic("arrow")}</a>
   </div>
   <div class="card">
    <span class="lab">Your contract</span>${hasK ? `
    <div class="mid">${CREW.ship}</div>
    <div class="muted" style="margin-top:4px">Day ${cDay} of ${cDays} &middot; ${cDays - cDay} days to go</div>
    <div style="margin-top:auto;padding-top:14px"><div class="track" style="margin-top:0"><i style="width:${cPct}%"></i></div>
    <div class="ends"><span>On <b>${dmy(CREW.on)}</b></span><span>Off <b>${CREW.offProjected ? "~" : ""}${dmy(CREW.off)}</b></span></div>
    <div class="muted" style="padding-top:6px;font-size:12.5px">${offNote}</div></div>` : `
    <div class="mid">Between contracts</div>
    <div class="muted" style="margin-top:4px">Rita has your next contract. Your paydays and benefits are below.</div>`}
   </div>
   <div class="card">
    <span class="lab">${CREW.contractNo ? "Your bonus" : "Multi Contract Bonus"}</span>${CREW.contractNo ? `
    <div class="mid">Contract ${CREW.contractNo} in a row</div>
    <div class="muted" style="margin-top:4px">Worth up to <b style="color:var(--navy)">${usd(stepNow)}</b>. The next one, up to ${usd(stepNext)}.</div>` : `
    <div class="mid">Up to ${usd(maxStep)} a contract</div>
    <div class="muted" style="margin-top:4px">Every contract in a row is worth more.</div>`}
    <div class="spark">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<i class="${n < CREW.contractNo ? "d" : n === CREW.contractNo ? "n" : ""}" style="height:${Math.round(12 + 88 * ladderValue(n) / maxStep)}%"></i>`).join("")}</div>
    <a class="go" href="#bonus">How the bonus works ${ic("arrow")}</a>
   </div>
  </div>
  
  <ul class="quick">
   <li><a href="${L.ticket}"><span class="qi">${ic("wrench")}</span><span><span class="qt">Machine problem</span><span class="qs" style="display:block">Open a ticket</span></span>${ic("arrow", "ar")}</a></li>
   <li><a href="#ordering"><span class="qi">${ic("box")}</span><span><span class="qt">Placing an order</span><span class="qs" style="display:block">Steps for your ship</span></span>${ic("arrow", "ar")}</a></li>
   <li><a href="${L.house}"><span class="qi">${ic("bed")}</span><span><span class="qt">Staff House</span><span class="qs" style="display:block">A free bed in Manila</span></span>${ic("arrow", "ar")}</a></li>
   <li><a href="${L.expense}" download><span class="qi g">${ic("down")}</span><span><span class="qt">Expense report</span><span class="qs" style="display:block">Download the form</span></span>${ic("arrow", "ar")}</a></li>
  </ul>
  
  <div class="layout">
   <nav class="rail">${NAV.map(([id, t, i]) => `<a href="#${id}">${ic(i)}${amp(t)}</a>`).join("")}</nav>
   <main>
    <div class="chips">${NAV.map(([id, t]) => `<a href="#${id}">${amp(t)}</a>`).join("")}</div>
  
    <section id="payday">${head("payday", "Payroll calendar " + year, "When you get paid", "Each month's pay lands on the date below.")}
     <ol class="pay">${tiles}</ol>
     <div class="note">${ic("help")}<span>Filipino nationals: the amount can vary with mandatory social cost and allotment. Pay starts the month after you join the ship.</span></div>
     ${PAYROLL[+year + 1] ? "" : `<div class="note">${ic("cal")}<span>The ${+year + 1} dates appear here as soon as payroll publishes them.</span></div>`}
    </section>
  
    <section id="pay">${head("pay", "Compensation package", "Your pay and benefits", "Every guest sees your work. This is what DG3 gives you in return.")}
     <div class="grp">Paid to you</div>
     <ul class="bens">
      ${ben("Monthly", "Your salary", "Paid in the first week after each month, starting the month after you join.")}
      ${ben("$50 / month", "Break &amp; Fix fee", "For the MFD program. Added to your shipboard pay at the end of every month, prorated.")}
      ${ben("$350", "Referral", "Refer a new hire. Paid when they finish their full 7-month contract.")}
      ${ben("20% off", "Gift shop", "Celebrity Cruises policy, on any purchase of $5 or more.")}
     </ul>
     <div class="grp">Covered for you</div>
     <ul class="bens">
      ${ben("Paid by DG3", "Flights and hotels", "DG3 books and pays your trip to the ship and back home, and a hotel when needed.")}
      ${ben("$30 / day", "Travel expenses", "Meals while you travel to or from the ship. Send them on the expense report.", `<ul><li>Taxi, bus or train with a receipt, when not pre-arranged</li><li>Meals: <b>US$30 a day</b></li><li>Visas such as Schengen and C1D</li><li><a href="${L.expense}" download><b>Download the expense report</b></a></li></ul>`)}
      ${ben("Up to $250", "Medical exam (PEME)", "DG3 pays your pre-employment medical up to US$250.")}
      ${ben("Free", "Ship's medical center", "See the ship's doctor for any health concern, at no cost.")}
      ${ben("PHP 100,000", "Health insurance", "Philippine crew and two dependents, per illness or injury.")}
      ${ben("$100,000", "Travel insurance", "Life cover for injury, disability or death.", `<ul><li>Permanent and total disability: <b>$100,000</b></li><li>Education: <b>$7,000</b> per child, per year</li><li>Burial and cremation: <b>$3,000</b></li></ul>`)}
      ${ben("Included", "Training", "Konica certification and InDesign certification.")}
     </ul>
    </section>
  
    <section id="bonus">${head("bonus", "Multi Contract Bonus", "Every contract in a row is worth more", `Up to ${usd(maxStep)} a contract. Nine in a row add up to ${usd(total9)}.`)}
     <ol class="ladder">${ladder}</ol>
     <div class="axis"><span>Contracts in a row</span><span>Bonus per contract, up to</span></div>
     <div class="rules">
      <div class="rl g"><b>Score ${FLOOR} or more</b>You are paid the step, times your score. A score of 90 on a ${usd(exStep)} step pays ${usd(example)}.</div>
      <div class="rl a"><b>Evaluation below 3</b>No bonus for this contract. Your count stays where it is.</div>
      <div class="rl r"><b>Back to contract 1</b>Not finishing the contract, a rush order from a missed order, or a failed inventory audit.</div>
     </div>
     <div class="small">A compassionate sign-off does not reset you. Full rules: the Contract Completion Bonus SOP on <a href="${L.zendesk}">Zendesk</a> and your seafarer agreement.</div>
    </section>
  
    <section id="house">${head("house", "Staff House Manila", "A free bed next to the airport", "A furnished studio across from Manila airport, for the long trips and the early flights. Those nights are on us.")}
     <div class="house">
      <ul class="facts">
       <li>${ic("pin")}<span>7 minutes to the airport by taxi or Grab</span></li>
       <li>${ic("bed")}<span>Bunk beds for four, plus a sofa bed</span></li>
       <li>${ic("check")}<span>Bathroom and kitchenette</span></li>
       <li>${ic("check")}<span>Fresh towels and linens</span></li>
       <li>${ic("check")}<span>Cleaned and restocked every Friday</span></li>
       <li>${ic("check")}<span>Pool in the building</span></li>
       <li>${ic("check")}<span>No fixed check-in or check-out</span></li>
      </ul>
      <div class="book"><span class="lab">Book every stay</span><div class="big">4 beds a night</div>
       <div style="margin-top:6px;font-size:14px">First booked, first served. No booking, no bed. A problem? Contact Joy.</div>
       <a class="btn" href="${L.house}">Book at house.cims.work ${ic("arrow")}</a></div>
     </div>
     <ol class="hr">
      <li><span class="num">1</span><span>Take your trash out and leave the unit tidy.</span></li>
      <li><span class="num">2</span><span>Strip your bed and leave it ready for the next crewmate.</span></li>
      <li><span class="num">3</span><span>Keep the noise low. Someone is always resting for a flight.</span></li>
     </ol>
    </section>
  
    <section id="help">${head("help", "Ship technical support", "Get help fast", "Pick the right channel the first time.")}
     <div class="helpg">
      <div class="hc main"><h3>Machine problem</h3><div class="muted">Error codes, jams, power, colour, network.</div>
       <ul><li>${ic("check")}Cruise line and machine type</li><li>${ic("check")}The machine's serial number</li><li>${ic("check")}The problem, and can you repeat it?</li><li>${ic("check")}Photos of the bad print</li></ul>
       <a class="btn" href="${L.ticket}">Open a ticket ${ic("arrow")}</a>
       <div class="small" style="margin-top:10px">Ohji, Joemar and Rolando answer every ticket. Sent one? Don't email as well.</div></div>
      <div class="hstack"><div class="hc"><h3>Anything else</h3><div class="muted">Not a machine fault.</div><a class="btn s" href="${L.shipsupport}">${ic("mail")}Shipsupport@DG3.com</a></div>
      <div class="hc"><h3>Orders and deliveries</h3><div class="muted">Logistics and inventory questions.</div><a class="btn s" href="${L.ray}">${ic("mail")}Ask Ray Guerra</a></div></div>
     </div>
     <div class="teamh"><div class="grp" style="margin:0">Your team &middot; one address for all</div><a class="pilln" href="mailto:onboardsupport@dg3.com">${ic("mail")}onboardsupport@dg3.com</a></div>
     <ul class="team">${TEAM.map(([n, r, e]) => `<li><a class="tm" href="mailto:${e}"><span class="av">${ini(n)}</span><span><b>${n}</b><span>${amp(r)}</span></span><span class="em">Email</span></a></li>`).join("")}</ul>
    </section>
  
    <section id="ordering">${head("ordering", "Inventory and supply chain", "Placing your orders", "Check the inventory team's ordering schedule first, so your order catches a container with time for review, approval and delivery.")}
     <input class="tr" type="radio" name="t" id="t1"${CREW.brand !== "azamara" && CREW.brand !== "ncl" ? " checked" : ""}><input class="tr" type="radio" name="t" id="t2"${CREW.brand === "azamara" ? " checked" : ""}><input class="tr" type="radio" name="t" id="t3"${CREW.brand === "ncl" ? " checked" : ""}>
     <div class="tabs"><label for="t1">Royal &amp; Celebrity</label><label for="t2">Azamara</label><label for="t3">Norwegian</label></div>
     <ol class="steps tp p1">${ROYAL.map((t, i) => step(i + 1, t)).join("")}</ol>
     <ol class="steps tp p2">${AZ.map((t, i) => step(i + 1, t)).join("")}</ol>
     <ol class="steps tp p3">${NCL.map((t, i) => step(i + 1, t)).join("")}</ol>
     <div class="daily"><h3>Every day, every ship</h3><ul>${DAILY.map((t) => `<li>${ic("check")}<span>${t}</span></li>`).join("")}</ul></div>
    </section>
  
    <section id="uniform">${head("uniform", "Uniform", "One full set, on day one", "Collect it from the storekeeper after safety training, with your uniform sheet. Anything more is yours to buy.")}
     <div class="uni">
      <div class="uc"><h3>Every 2 years</h3><ul>${[["Jacket", 1], ["Sweater", 1], ["Belt", 1], ["Tie", 1], ["Stripes (epaulettes)", 2]].map(([t, q]) => `<li><span>${t}</span><b>&times; ${q}</b></li>`).join("")}</ul></div>
      <div class="uc"><h3>Every year</h3><ul>${[["Day shirt", 2], ["Night shirt", 2], ["Pants or skirt", 2], ["Safety shoes", 1], ["Coveralls", 1]].map(([t, q]) => `<li><span>${t}</span><b>&times; ${q}</b></li>`).join("")}</ul></div>
     </div>
     <div class="small">Full rules: the Printer Specialist Uniform SOP on <a href="${L.zendesk}">Zendesk</a>.</div>
    </section>
  
    <section id="safety">${head("safety", "Ergonomics", "Lift and work without getting hurt", "Shoulders, back and knees take the strain onboard. The goal: nobody gets hurt.")}
     <div class="warnb">${ic("alert")}<span><b style="color:var(--navy)">Report it early.</b> Pain, swelling, stiffness, numbness, weak muscles or tiredness that does not go away.</span></div>
     <div class="grp" style="margin-top:22px">Four rules for every lift</div>
     <ol class="lift">
      <li class="lf"><span class="n">1</span><p>Keep the load close to your body.</p></li>
      <li class="lf"><span class="n">2</span><p>Keep it in front of you, in line with your spine.</p></li>
      <li class="lf"><span class="n">3</span><p>Don't twist. Turn your feet instead.</p></li>
      <li class="lf"><span class="n">4</span><p>Feet apart, back straight, head up. Let your legs lift.</p></li>
     </ol>
     <div class="grp" style="margin-top:22px">The hit list: spot it, report it</div>
     <ul class="hit"><li>Elbows out</li><li>Shoulder too high</li><li>Butts up</li><li>Twist and shout</li><li>High force</li><li>Contact</li></ul>
     <div class="small"><b style="color:var(--navy)">Butts up is the most common.</b> If you see more backs than faces, the work is too low. Keep work above your knees, about 61 cm (24 in).</div>
    </section>
  
    <section id="values">${head("values", "CIMS mission and values", "What we stand for", "")}
     <ul class="vals">${VALUES.map(([t, s]) => `<li class="vl"><b>${t}</b><span>${s}</span></li>`).join("")}</ul>
    </section>
   </main>
  </div>
  <footer><span>CIMS &middot; Cruise Industry Managed Services &middot; a division of DG3</span><span>Updated ${HUB_UPDATED}. If this page and your seafarer agreement differ, your agreement applies.</span></footer>
  </body></html>`;
  
  return html;
}

// A link that was revoked or never existed: one plain sentence, the same letterhead, nothing about anybody.
export function hubGonePage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>CIMS Crew Hub</title>
<style>body{margin:0;background:#F3F4F6;font:16px/1.55 'DM Sans',Helvetica,Arial,sans-serif;color:#374151}.r{display:flex;height:4px}.r i{flex:60;background:#1B3A5C}.r i+i{flex:40;background:#5FB946}
.t{background:#142D48;color:#fff;padding:22px 20px 40px}.w{font:700 20px/1 Helvetica,Arial,sans-serif;letter-spacing:5px}.w i{display:block;width:78px;height:2px;background:#5FB946;margin:7px 0 0}
.c{max-width:520px;margin:-20px auto 0;background:#fff;border-radius:18px;padding:24px 22px;box-shadow:0 8px 24px rgba(20,45,72,.08)}h1{font:600 24px/1.2 Helvetica,Arial,sans-serif;color:#1B3A5C;margin:0 0 8px}a{color:#1B3A5C;font-weight:700}</style></head>
<body><div class="r"><i></i><i></i></div><div class="t"><div class="w">CIMS<i></i></div></div><div class="c"><h1>This link is not active.</h1>
<p>Ask Rita for your Crew Hub link: <a href="mailto:Rita.Berenyi@dg3.com">Rita.Berenyi@dg3.com</a></p></div></body></html>`;
}

// hub.cims.work with no personal link (Miguel, 19 Oct 2026: "still cant access hub.cims.work"): the bare domain served the
// console's login. On the hub host every path but /hub/... is this page — the console is never served there.
export const HUB_HOST = "hub.cims.work";
export function hubHomePage() {
  return hubGonePage().replace("<h1>This link is not active.</h1>", "<h1>Your CIMS Crew Hub</h1>")
    .replace("<p>Ask Rita for your Crew Hub link: <a href=\"mailto:Rita.Berenyi@dg3.com\">Rita.Berenyi@dg3.com</a></p>",
      "<p>Your own Crew Hub link is in your welcome-aboard email. It opens your page with no login: your paydays, pay and benefits, the bonus ladder, the Staff House and who to ask.</p><p>Lost the link? Ask Rita: <a href=\"mailto:Rita.Berenyi@dg3.com\">Rita.Berenyi@dg3.com</a></p><p><a href=\"/hub/expense.xlsx\">Download the Expense Report</a></p>");
}
