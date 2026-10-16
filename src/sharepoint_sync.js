// SharePoint → console, automatic (PR 3; docs/SHAREPOINT_SYNC.md). Miguel, 15 Oct 2026: "I want all this to be automatic".
//
// Every hour the Worker reads two places on the CruiseLineManagedServicesTeam site through Microsoft Graph, with an
// identity DG3 IT gives it (app registration, Sites.Selected, a client secret in Cloudflare — never in this repo, §7):
//   {SP_SGA_PATH}/<year>/<NN month>/   TDG's "DG3 SGA EXCEL <month>.xlsx" (REVISED wins)  → applySga (the same path as drag-and-drop)
//   {SP_TRAVEL_PATH}/                  Rita's "UPDATED - Travel Expenses <year> …xlsx"      → applyTravel (same)
// A file is loaded once per (id, eTag): a changed file is a new eTag and loads again, replacing its month / year. Every
// attempt is recorded on sp_sync (what, when, outcome). Read-only against SharePoint; nothing here is money (§1).
//
// Everything that touches the network or the database is injected, so the whole decision path runs in tests with a fake
// Graph and a real SheetJS workbook: { fetch, now, db, parseWorkbook, applySga, applyTravel, log }.

import { isManningSheet, isSummarySheet } from "./sga.js";

export const GRAPH = "https://graph.microsoft.com/v1.0";

export function syncConfigured(env) {
  return !!(env && env.GRAPH_TENANT_ID && env.GRAPH_CLIENT_ID && env.GRAPH_CLIENT_SECRET && env.SP_DRIVE_ID);
}
// Staging never syncs (MAIL_ONLY_TO is the staging marker; staging also runs no cron) — a copied secret must still do nothing.
export function syncAllowed(env) {
  return syncConfigured(env) && !env.MAIL_ONLY_TO;
}

// Client-credentials token, cached per isolate until a minute before it expires.
const _tok = { v: null, exp: 0 };
export async function graphToken(env, fetchImpl, now = Date.now()) {
  if (_tok.v && now < _tok.exp - 60_000) return _tok.v;
  const body = new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  const r = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!r.ok) throw new Error("graph_token_" + r.status);
  const j = await r.json();
  _tok.v = j.access_token; _tok.exp = now + (Number(j.expires_in) || 3600) * 1000;
  return _tok.v;
}
export function _resetTokenCache() { _tok.v = null; _tok.exp = 0; }

async function gget(url, token, fetchImpl) {
  const r = await fetchImpl(url, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("graph_" + r.status + " " + url.replace(GRAPH, ""));
  return r;
}
// The children of a folder given by path (relative to the drive root). null when the folder does not exist.
export async function listChildren(env, token, path, fetchImpl) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  const out = [];
  let url = `${GRAPH}/drives/${env.SP_DRIVE_ID}/root:/${enc}:/children?$select=id,name,eTag,lastModifiedDateTime,size,folder,file&$top=200`;
  while (url) {
    const r = await gget(url, token, fetchImpl);
    if (!r) return null;
    const j = await r.json();
    out.push(...(j.value || []));
    url = j["@odata.nextLink"] || null;
  }
  return out;
}
export async function download(env, token, itemId, fetchImpl) {
  const r = await gget(`${GRAPH}/drives/${env.SP_DRIVE_ID}/items/${itemId}/content`, token, fetchImpl);
  if (!r) throw new Error("graph_404_content");
  return await r.arrayBuffer();
}

// Which workbook in a month folder is the month's file: the REVISED one when both exist, else the plain one; never the
// per-crew PDFs or the training PDF (scans). Returns the item or null.
export function pickSgaWorkbook(children) {
  const xl = (children || []).filter((c) => c.file && /sga excel/i.test(c.name) && /\.xlsx?$/i.test(c.name));
  if (!xl.length) return null;
  const rev = xl.filter((c) => /revised/i.test(c.name)).sort((a, b) => String(b.lastModifiedDateTime).localeCompare(String(a.lastModifiedDateTime)));
  return rev[0] || xl.sort((a, b) => String(b.lastModifiedDateTime).localeCompare(String(a.lastModifiedDateTime)))[0];
}
// Rita's workbook for a year in the Travel Expenses Crew folder ("UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx").
export function pickTravelWorkbook(children, year) {
  const xl = (children || []).filter((c) => c.file && /travel expenses/i.test(c.name) && String(c.name).includes(String(year)) && /\.xlsx?$/i.test(c.name));
  if (!xl.length) return null;
  const upd = xl.filter((c) => /updated/i.test(c.name));
  return (upd.length ? upd : xl).sort((a, b) => String(b.lastModifiedDateTime).localeCompare(String(a.lastModifiedDateTime)))[0];
}
// Which years to look at: this one, and last year until the end of February (TDG's December bill arrives in January;
// Rita closes the year late).
export function yearsToScan(today) {
  const y = +String(today).slice(0, 4), m = +String(today).slice(5, 7);
  return m <= 2 ? [y - 1, y] : [y];
}
const pad2 = (n) => String(n).padStart(2, "0");

// What the sync would do, as a list of candidates: { kind, item, path, year, month? } — before any download.
export async function planSync(env, token, fetchImpl, today) {
  const plan = [];
  for (const y of yearsToScan(today)) {
    const months = await listChildren(env, token, `${env.SP_SGA_PATH}/${y}`, fetchImpl);
    for (const mf of (months || []).filter((c) => c.folder)) {
      const mm = /^(0[1-9]|1[0-2])\b/.exec(String(mf.name).trim());
      if (!mm) continue; // "00 For approval" and the like are not months
      const kids = await listChildren(env, token, `${env.SP_SGA_PATH}/${y}/${mf.name}`, fetchImpl);
      const wb = pickSgaWorkbook(kids);
      if (wb) plan.push({ kind: "sga", item: wb, path: `${env.SP_SGA_PATH}/${y}/${mf.name}/${wb.name}`, year: y, month: +mm[1] });
    }
    const tr = await listChildren(env, token, env.SP_TRAVEL_PATH, fetchImpl);
    const twb = pickTravelWorkbook(tr, y);
    if (twb) plan.push({ kind: "travel", item: twb, path: `${env.SP_TRAVEL_PATH}/${twb.name}`, year: y });
  }
  return plan;
}

// A SheetJS workbook (ArrayBuffer) → { sheetName: rows2D } for the sheets a parser wants, raw values, '' for blanks —
// the same shape the Upload page sends.
export function sheetsOf(XLSX, buf, want) {
  const wb = XLSX.read(buf, { type: "array", raw: true });
  const out = {};
  for (const sn of wb.SheetNames) if (want(String(sn))) out[sn] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" });
  return out;
}
export const WANT_SGA = (n) => isManningSheet(n) || /trainrel/i.test(n) || /^training$/i.test(n.trim()) || isSummarySheet(n);
export const WANT_TRAVEL = (n) => ["JAN", "FEB", "MAR", "APRIL", "MAY", "JUNE", "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC", "CIMS"].includes(n.trim().toUpperCase());

// One run. deps: { fetch, now (ms), today (ISO), db, XLSX, applySga(sheets, meta) → result, applyTravel(sheets, year, meta) → result, log(fn) }.
// Returns the report the Data page shows: { ran, reason?, planned, loaded: [...], skipped: n, errors: [...] }.
export async function runSync(env, deps) {
  if (!syncAllowed(env)) return { ran: false, reason: syncConfigured(env) ? "staging" : "not_configured", planned: 0, loaded: [], skipped: 0, errors: [] };
  const token = await graphToken(env, deps.fetch, deps.now);
  const plan = await planSync(env, token, deps.fetch, deps.today);
  const seen = await deps.db.seen(plan.map((p) => p.item.id)); // Map id → eTag already processed OK
  const report = { ran: true, planned: plan.length, loaded: [], skipped: 0, errors: [] };
  for (const p of plan) {
    if (seen.get(p.item.id) === p.item.eTag) { report.skipped++; continue; }
    const rec = { item_id: p.item.id, path: p.path, name: p.item.name, etag: p.item.eTag, modified: p.item.lastModifiedDateTime, kind: p.kind, year: p.year, month: p.month || null, at: new Date(deps.now).toISOString() };
    try {
      const buf = await download(env, token, p.item.id, deps.fetch);
      const sheets = sheetsOf(deps.XLSX, buf, p.kind === "sga" ? WANT_SGA : WANT_TRAVEL);
      const meta = { name: p.item.name, hash: p.item.eTag, source: "sharepoint", by: "sharepoint-sync", path: p.path };
      const res = p.kind === "sga" ? await deps.applySga(sheets, meta) : await deps.applyTravel(sheets, p.year, meta);
      await deps.db.record({ ...rec, status: res && res.error ? "error" : "ok", detail: JSON.stringify(res || null).slice(0, 2000) });
      if (res && res.error) report.errors.push({ path: p.path, error: res.error, detail: res.detail || null }); else report.loaded.push({ path: p.path, kind: p.kind, year: p.year, month: p.month || null, result: res });
    } catch (e) {
      await deps.db.record({ ...rec, status: "error", detail: String((e && e.message) || e).slice(0, 2000) }).catch(() => null);
      report.errors.push({ path: p.path, error: String((e && e.message) || e) });
    }
  }
  return report;
}
