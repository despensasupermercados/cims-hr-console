// THE MAIL INTAKE — finance emails the bill, the console loads it (Miguel, 15 Oct 2026: "give me an email where finance
// can send u this .. u might get more emails .. but this will be one of them so u can pick it up and add the data where
// needs to be").
//
// Cloudflare Email Routing delivers mail for MAIL_SGA_TO (default sga@cims.work) to this Worker. The handler parses the
// MIME, keeps only the workbooks the console knows — TDG's "DG3 SGA EXCEL <month>.xlsx" (REVISED included) and Rita's
// "UPDATED - Travel Expenses <year> ….xlsx" — reads them with SheetJS into the Upload page's shape, and writes the sheets
// into sp_inbox exactly as the morning pickup does (one row per sheet part). The hourly cron's applyInbox (and an
// immediate run on arrival) then loads them through sgaStage/applySgaWorkbook or applyTravelYear — the ONE path each
// (§3) — and records sp_sync with source "email". Anything else in the mail (the PDF scans, the body, other files) is
// ignored and said so on the receipt (mail_intake).
//
// Who may feed the console: SGA_MAIL_SENDERS — a comma list of addresses or domains (default "dg3.com"). A workbook from
// anyone else is written as `held`, never `pending`: it loads nothing until Miguel adds the sender. The receipt names the
// sender, so the first mail from TDG's accounting shows exactly what to add. Nothing here is money (§1).
//
// Pure helpers here (pinned by test/mail_intake.test.js); the MIME parser, SheetJS and the database are injected.
import { inboxParts, inboxFileKey, pickSgaItem } from "./sp_inbox.js";
import { sgaPeriodFromName } from "./sga.js";

export const DEFAULT_SGA_MAIL_TO = "sga@cims.work";
export const DEFAULT_SENDERS = "dg3.com";

const lower = (s) => String(s || "").trim().toLowerCase();
// "Name <a@b.c>" / "a@b.c" → "a@b.c"
export function bareAddress(s) {
  const m = /<([^>]+)>/.exec(String(s || ""));
  return lower(m ? m[1] : s);
}
// The intake address for this deployment; a mail is the intake's when any recipient is it.
export function isIntakeMail(message, env) {
  const want = lower((env && env.MAIL_SGA_TO) || DEFAULT_SGA_MAIL_TO);
  const to = bareAddress(message && message.to);
  return !!want && to === want;
}
// SGA_MAIL_SENDERS: "dg3.com, accounting@tdgcrew.com" — an entry with "@" is an address, else a domain (sub-domains included).
export function senderAllowed(from, env) {
  const addr = bareAddress(from);
  if (!addr) return false;
  const list = String((env && env.SGA_MAIL_SENDERS) || DEFAULT_SENDERS).split(",").map(lower).filter(Boolean);
  const dom = addr.slice(addr.indexOf("@") + 1);
  return list.some((e) => (e.includes("@") ? e === addr : dom === e || dom.endsWith("." + e)));
}

const isXlsx = (a) => /\.xlsx?$/i.test(String(a.filename || "")) || /spreadsheetml|ms-excel/i.test(String(a.mimeType || ""));
export const isSgaName = (n) => /sga excel/i.test(String(n || "")) && /\.xlsx?$/i.test(String(n || ""));
export const isTravelName = (n) => /travel expenses/i.test(String(n || "")) && /\.xlsx?$/i.test(String(n || ""));
export function yearFromName(n) { const m = /\b(20\d{2})\b/.exec(String(n || "")); return m ? +m[1] : null; }

// Which attachments the console takes: every SGA workbook (one mail may carry a month and its REVISED twin — the newest
// wins per month like the Graph sync, by pickSgaItem over the same period) and every travel workbook with a year in its
// name. Returns { take: [{ att, kind, year, month }], ignored: [names] }.
export function pickAttachments(attachments) {
  const take = [], ignored = [];
  const sga = [];
  for (const a of attachments || []) {
    const name = a.filename || "";
    if (!isXlsx(a)) { ignored.push(name || a.mimeType || "?"); continue; }
    if (isSgaName(name)) { const p = sgaPeriodFromName(name); if (p) { sga.push({ att: a, kind: "sga", year: p.year, month: p.month, name, lastModifiedDateTime: "" }); continue; } }
    if (isTravelName(name)) { const y = yearFromName(name); if (y) { take.push({ att: a, kind: "travel", year: y, month: null }); continue; } }
    ignored.push(name);
  }
  // one SGA workbook per period: REVISED beats plain
  const byPeriod = new Map();
  for (const s of sga) { const k = s.year + "-" + s.month; (byPeriod.get(k) || byPeriod.set(k, []).get(k)).push(s); }
  for (const group of byPeriod.values()) {
    const win = pickSgaItem(group.map((g) => ({ ...g, file: {} })));
    for (const g of group) { if (g.name === win.name) take.push({ att: g.att, kind: "sga", year: g.year, month: g.month }); else ignored.push(g.name + " (a REVISED file for the same month is in this mail)"); }
  }
  return { take, ignored };
}

// SHA-256 of the attachment bytes — the file's identity (a REVISED file re-sent is a new hash; the same file twice is not).
export async function sha256Hex(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf instanceof ArrayBuffer ? buf : new Uint8Array(buf));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One mail → sp_inbox rows + a receipt. deps: { parse(raw) → PostalMime email, XLSX, sheetsOf, wantSga, wantTravel, now }.
// Returns { from, subject, files: [{ name, kind, year, month, hash, status, parts, rows }], ignored: [...], reason? }.
export async function intakeMail(env, rawMessage, meta, deps) {
  const mail = await deps.parse(rawMessage);
  const from = bareAddress((mail.from && mail.from.address) || meta.from);
  const allowed = senderAllowed(from, env);
  const { take, ignored } = pickAttachments(mail.attachments || []);
  const files = [];
  const at = new Date(deps.now || Date.now()).toISOString();
  for (const t of take) {
    const buf = t.att.content;
    const hash = await sha256Hex(buf);
    const sheets = deps.sheetsOf(deps.XLSX, buf, t.kind === "sga" ? deps.wantSga : deps.wantTravel);
    if (!Object.keys(sheets).length) { files.push({ name: t.att.filename, kind: t.kind, year: t.year, month: t.month, hash, status: "no_sheets", parts: 0, rows: 0 }); continue; }
    const key = inboxFileKey("mail:" + hash.slice(0, 16), hash.slice(0, 16));
    const parts = inboxParts(sheets);
    const status = allowed ? "pending" : "held";
    files.push({ name: t.att.filename, kind: t.kind, year: t.year, month: t.month, hash, status, parts: parts.length, rows: Object.values(sheets).reduce((a, r) => a + r.length, 0),
      inbox: parts.map((p, i) => ({ id: "inb_mail_" + hash.slice(0, 24) + "_" + String(i).padStart(2, "0"), file_key: key, kind: t.kind, year: t.year, month: t.month, item_id: "mail:" + hash.slice(0, 16), name: t.att.filename, path: "email:" + from, modified: hash.slice(0, 16), sheet: p.sheet, part: p.part, parts: p.parts, file_parts: p.file_parts, rows_json: p.rows_json, written_by: "email:" + from, at, status })) });
  }
  return { from, allowed, subject: mail.subject || meta.subject || null, messageId: mail.messageId || null, files, ignored, at };
}
