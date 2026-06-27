/* =====================================================================
   CIMS Parts Mailer — Cloudflare Worker
   ---------------------------------------------------------------------
   A small, dedicated sender for the parts-request form (order.cims.work).
   - POST /order   -> validate, send the branded email via Resend, return JSON
   - OPTIONS /order-> CORS preflight
   Reuses the same Resend account + verified cims.work sender as the rest of
   CIMS. The form lives on a different origin (order.cims.work), so CORS is
   open to exactly that origin and nothing else.

   Runtime config (Cloudflare dashboard -> Settings -> Variables and secrets):
     RESEND_API_KEY  (secret)  -- from resend.com  (the ONE thing only you add)
     MAIL_FROM       (var)     -- e.g. "CIMS Parts <parts@cims.work>"
   ===================================================================== */

const ALLOW_ORIGIN = "https://order.cims.work";

function cors(extra = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    ...extra
  };
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors() } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    if (request.method === "POST" && (url.pathname === "/order" || url.pathname === "/api/order")) {
      return handleOrder(request, env);
    }
    return json({ ok: false, error: "not found" }, 404);
  }
};

async function handleOrder(request, env) {
  let p;
  try { p = await request.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  // ---- server-side validation (never trust the client) ----
  const required = ["requester", "ship", "machineSerial", "neededBy", "items", "destination", "notify", "orderType"];
  for (const k of required) if (!p[k]) return json({ ok: false, error: "missing field: " + k }, 400);
  if (!Array.isArray(p.items) || p.items.length === 0) return json({ ok: false, error: "no items" }, 400);
  if (!["regular", "missed"].includes(p.orderType)) return json({ ok: false, error: "bad orderType" }, 400);
  if (p.orderType === "missed" && !(p.miss && p.miss.reason)) return json({ ok: false, error: "missed order requires a reason" }, 400);
  const d = p.destination;
  for (const k of ["port", "agentName", "street", "streetNo", "city", "zip", "phone1", "email1"])
    if (!d[k]) return json({ ok: false, error: "missing destination." + k }, 400);

  const orderRef = String(p.orderRef || "CIMS-" + Date.now());
  const subject = `${p.orderType === "missed" ? "[MISSED] " : ""}Parts Request ${orderRef} — ${p.ship} -> ${d.port} (need by ${p.neededBy})`;
  const recipients = [...new Set((p.notify || []).filter(Boolean))];
  if (recipients.length === 0) return json({ ok: false, error: "no recipients" }, 400);

  if (!env.RESEND_API_KEY) return json({ ok: false, error: "mailer not configured (missing RESEND_API_KEY)" }, 503);

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "CIMS Parts <parts@cims.work>",
      to: recipients,
      reply_to: d.email1,
      subject,
      text: buildEmailText(p, orderRef),
      html: buildEmailHtml(p, orderRef)
    })
  });
  if (!send.ok) {
    const detail = await send.text().catch(() => "");
    return json({ ok: false, error: "email send failed", detail }, 502);
  }
  return json({ ok: true, orderRef });
}

function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function buildEmailText(p, orderRef) {
  const d = p.destination; const t = p.totals || {};
  const lines = p.items.map(i =>
    `  ${String(i.partNumber).padEnd(16)} ${String(i.qty).padStart(2)} x ${money(i.unitPrice).padStart(9)} = ${money(i.lineTotal)}` +
    `  | ${i.group} - ${i.description}` + (i.verifyFit ? "  [VERIFY FIT]" : "") + (i.variant ? ` (var ${i.variant})` : "")
  ).join("\n");
  const anyVerify = p.items.some(i => i.verifyFit);
  const missBanner = p.orderType === "missed"
    ? `*** MISSED ORDER — ${String((p.miss && p.miss.reasonLabel) || "reason not set").toUpperCase()} ***${p.miss && p.miss.note ? "\nNote: " + p.miss.note : ""}\n\n`
    : "";
  return (missBanner +
`Order ref:    ${orderRef}
Order type:   ${p.orderType === "missed" ? "MISSED — " + ((p.miss && p.miss.reasonLabel) || "reason not set") : "Regular"}
Requester:    ${p.requester}
Vessel:       ${p.company || ""} - ${p.ship}
Machine S/N:  ${p.machineSerial}
Needed by:    ${p.neededBy}
Deliver to:   ${d.port}${d.country ? ", " + d.country : ""}${d.zone ? " (" + d.zone + ")" : ""}
Port agent:   ${d.agentName}
Address:      ${d.street} ${d.streetNo}, ${d.city} ${d.zip}
Phone:        ${d.phone1}${d.phone2 ? " / " + d.phone2 : ""}
Email:        ${d.email1}${d.email2 ? " / " + d.email2 : ""}

ITEMS
${lines}

Subtotal:     ${money(t.subtotal)}
Freight (est):${money(t.freightEst)}
Clearance:    ${money(t.customsClearance)}
GRAND TOTAL:  ${money(t.grandTotal)}
` + (p.notes ? `\nNotes: ${p.notes}\n` : "") +
    (anyVerify ? `\n** Some items are flagged VERIFY FIT — confirm the part fits the C4070 before ordering. **\n` : "") +
    `\nSubmitted ${p.submittedAt || new Date().toISOString()} via order.cims.work`);
}

function buildEmailHtml(p, orderRef) {
  const d = p.destination || {}; const t = p.totals || {};
  const missed = p.orderType === "missed";
  const reasonLabel = (p.miss && p.miss.reasonLabel) || "reason not set";
  const note = p.miss && p.miss.note ? p.miss.note : "";
  const missBand = missed ? `
    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;background:#FBEDE7;border-left:4px solid #C9461F;border-radius:4px;"><tr><td style="padding:13px 16px;">
        <div style="font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#9B3414;">&#9888;&nbsp; MISSED ORDER — ${esc(reasonLabel)}</div>
        ${note ? `<div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#9B3414;line-height:1.5;margin-top:4px;">Note: ${esc(note)}</div>` : ""}
      </td></tr></table>
    </td></tr>` : "";
  const itemRows = (p.items || []).map((i, idx) => `
        <tr style="background:${idx % 2 ? "#FBFDFE" : "#FFFFFF"};">
          <td style="padding:11px 12px;border-bottom:1px solid #EEF1F4;">
            <div style="font-family:'Courier New',monospace;font-size:11px;color:#1B3A5C;font-weight:600;">${esc(i.partNumber)}${i.variant ? " · var " + esc(i.variant) : ""}</div>
            <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12.5px;color:#15303D;margin-top:2px;">${esc(i.description)}${i.machineModel ? " · " + esc(i.machineModel) : ""}${i.verifyFit ? ' <span style="color:#9B3414;font-weight:700;">[VERIFY FIT]</span>' : ""}</div>
            <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;color:#9CA3AF;margin-top:2px;">${esc(i.group || "")} · ${money(i.unitPrice)} ea</div>
          </td>
          <td align="center" style="padding:11px 6px;border-bottom:1px solid #EEF1F4;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#1B3A5C;font-weight:600;">${esc(i.qty)}</td>
          <td align="right" style="padding:11px 12px;border-bottom:1px solid #EEF1F4;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#1B3A5C;font-weight:600;">${money(i.lineTotal)}</td>
        </tr>`).join("");
  const recipientLine = (p.notify || []).filter(Boolean).join(" · ");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>CIMS Parts Request</title></head>
<body style="margin:0;padding:0;background:#CBD5E1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#CBD5E1;font-size:1px;">${missed ? "MISSED · " : ""}${esc(p.ship)} · need by ${esc(p.neededBy)} · ${esc(orderRef)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#CBD5E1;"><tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;">
    <tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="60%" height="4" style="background:#1B3A5C;font-size:0;line-height:0;">&nbsp;</td><td width="40%" height="4" style="background:#5FB946;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td style="background:#1B3A5C;padding:26px 32px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td align="left" valign="middle">
          <div style="font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;color:#FFFFFF;letter-spacing:5px;line-height:1;">CIMS</div>
          <div style="width:54px;height:2px;background:#5FB946;margin:8px 0 7px;font-size:0;line-height:0;">&nbsp;</div>
          <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8.5px;font-weight:600;color:rgba(255,255,255,.55);letter-spacing:2.5px;text-transform:uppercase;">Cruise Industry Managed Services</div>
        </td>
        <td align="right" valign="top">
          <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8.5px;font-weight:600;color:#5FB946;letter-spacing:2.5px;text-transform:uppercase;">Parts Request</div>
          <div style="font-family:'Courier New',monospace;font-size:12px;color:rgba(255,255,255,.85);margin-top:6px;">${esc(orderRef)}</div>
        </td>
      </tr></table>
    </td></tr>
    ${missBand}
    <tr><td style="padding:20px 32px 4px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13.5px;color:#1B3A5C;line-height:1.6;">A new shipboard parts request has been submitted. A copy was sent to the vessel automatically.</div></td></tr>
    <tr><td style="padding:14px 32px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" valign="top" style="padding:0 6px 12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;border-radius:6px;"><tr><td style="padding:13px 15px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#5FB946;letter-spacing:2px;text-transform:uppercase;">Vessel</div><div style="font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#1B3A5C;margin-top:4px;">${esc(p.ship)}</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#6B7280;margin-top:1px;">${esc(p.company || "")}</div></td></tr></table></td>
        <td width="50%" valign="top" style="padding:0 0 12px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;border-radius:6px;"><tr><td style="padding:13px 15px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#5FB946;letter-spacing:2px;text-transform:uppercase;">Machine Serial</div><div style="font-family:'Courier New',monospace;font-size:14px;font-weight:600;color:#1B3A5C;margin-top:5px;">${esc(p.machineSerial)}</div></td></tr></table></td>
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" valign="top" style="padding:0 6px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;border-radius:6px;"><tr><td style="padding:13px 15px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#5FB946;letter-spacing:2px;text-transform:uppercase;">Deliver To</div><div style="font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#1B3A5C;margin-top:4px;">${esc(d.port)}</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#6B7280;margin-top:1px;">${esc(d.country || "")}${d.zone ? " · " + esc(d.zone) : ""}</div></td></tr></table></td>
        <td width="50%" valign="top" style="padding:0 0 0 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;border-radius:6px;"><tr><td style="padding:13px 15px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#5FB946;letter-spacing:2px;text-transform:uppercase;">Needed By</div><div style="font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#1B3A5C;margin-top:4px;">${esc(p.neededBy)}</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#6B7280;margin-top:1px;">Requester: ${esc(p.requester)}</div></td></tr></table></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 32px 0;">
      <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8.5px;font-weight:600;color:#5FB946;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:9px;">Items requested</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;">
        <tr style="background:#1B3A5C;"><td style="padding:9px 12px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:600;color:#FFFFFF;letter-spacing:.5px;text-transform:uppercase;">Part</td><td align="center" style="padding:9px 6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:600;color:#FFFFFF;text-transform:uppercase;">Qty</td><td align="right" style="padding:9px 12px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:600;color:#FFFFFF;text-transform:uppercase;">Total</td></tr>
        ${itemRows}
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="46%">&nbsp;</td><td width="54%">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:3px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;">Subtotal</td><td align="right" style="padding:3px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#1B3A5C;">${money(t.subtotal)}</td></tr>
          <tr><td style="padding:3px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;">Freight (est.)${d.zone ? " · " + esc(d.zone) : ""}</td><td align="right" style="padding:3px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#1B3A5C;">${money(t.freightEst)}</td></tr>
          <tr><td style="padding:3px 0 9px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;">Customs &amp; clearance</td><td align="right" style="padding:3px 0 9px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;color:#1B3A5C;">${money(t.customsClearance)}</td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1B3A5C;border-radius:6px;"><tr><td style="padding:11px 14px;font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:#FFFFFF;letter-spacing:.5px;">GRAND TOTAL</td><td align="right" style="padding:11px 14px;font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#6CC24A;">${money(t.grandTotal)}</td></tr></table>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:22px 32px 0;">
      <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8.5px;font-weight:600;color:#5FB946;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:9px;">Ship to · port agent</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;border-radius:6px;"><tr><td style="padding:15px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td width="50%" valign="top" style="padding-bottom:8px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;">Agent</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12.5px;color:#1B3A5C;margin-top:2px;">${esc(d.agentName)}</div></td><td width="50%" valign="top" style="padding-bottom:8px;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;">Address</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12.5px;color:#1B3A5C;margin-top:2px;">${esc(d.street)} ${esc(d.streetNo)}, ${esc(d.city)} ${esc(d.zip)}</div></td></tr>
          <tr><td width="50%" valign="top"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;">Phone</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12.5px;color:#1B3A5C;margin-top:2px;">${esc(d.phone1)}${d.phone2 ? " / " + esc(d.phone2) : ""}</div></td><td width="50%" valign="top"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8px;font-weight:600;color:#9CA3AF;letter-spacing:1.5px;text-transform:uppercase;">Email</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12.5px;color:#1B3A5C;margin-top:2px;">${esc(d.email1)}${d.email2 ? " / " + esc(d.email2) : ""}</div></td></tr>
        </table>
      </td></tr></table>
    </td></tr>
    ${p.notes ? `<tr><td style="padding:18px 32px 0;"><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:8.5px;font-weight:600;color:#5FB946;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:6px;">Notes for Ray</div><div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12.5px;color:#15303D;line-height:1.55;">${esc(p.notes)}</div></td></tr>` : ""}
    <tr><td style="padding:26px 32px 0;"><div style="border-top:1px solid #E5E7EB;font-size:0;line-height:0;">&nbsp;</div></td></tr>
    <tr><td style="padding:16px 32px 30px;">
      <div style="font-family:'Outfit',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1B3A5C;letter-spacing:3px;">CIMS</div>
      <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#6B7280;line-height:1.6;margin-top:6px;">Recipients: ${esc(recipientLine)}</div>
      <div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;color:#9CA3AF;line-height:1.6;margin-top:10px;">Generated from the order record at order.cims.work — the single source of truth. Prices are display reference; freight is an estimate, clearance is actuals. Submitted ${esc((p.submittedAt || "").slice(0, 10))}.</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
