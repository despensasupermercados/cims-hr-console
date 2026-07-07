// ============================================================
// CIMS brand kit — canonical copy.
// Apps COPY this file into their repo (src/emails/cims-brand.js).
// Coupling by convention, not by import: a brand change here is
// a deliberate, per-app rollout — never a surprise deploy.
// ============================================================

// Palette (from the live parts + HR templates)
export const NAVY = "#1B3A5C";
export const GREEN = "#5FB946";
export const GREEN_BRIGHT = "#6CC24A";
export const DGREEN = "#3E7C24";
export const INK = "#15303D";
export const GRAY = "#6B7280";
export const LGRAY = "#9CA3AF";
export const PANEL = "#F3F4F6";
export const GREENBG = "#EAF4E6";
export const AMBER = "#9B3414";
export const AMBERBG = "#FBEDE7";
export const RED = "#C9461F";
export const LINE = "#E5E7EB";
export const BODY_BG = "#CBD5E1";

// Font stacks (email-safe)
export const FF = "font-family:'DM Sans',Arial,Helvetica,sans-serif;";
export const FH = "font-family:'Outfit',Arial,Helvetica,sans-serif;";
export const FM = "font-family:'Courier New',monospace;";

// Standard header band. `tagRight` = small green label top-right
// (e.g. "Parts Request", "HR Console"), `subRight` = line under it.
export const header = (tagRight = "", subRight = "") => `
<tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="60%" height="4" style="background:${NAVY};font-size:0;line-height:0;">&nbsp;</td><td width="40%" height="4" style="background:${GREEN};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="background:${NAVY};padding:24px 30px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="left" valign="middle">
      <div style="${FH}font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:5px;line-height:1;">CIMS</div>
      <div style="width:50px;height:2px;background:${GREEN};margin:8px 0 6px;font-size:0;line-height:0;">&nbsp;</div>
      <div style="${FF}font-size:8px;font-weight:600;color:rgba(255,255,255,.55);letter-spacing:2.4px;text-transform:uppercase;">Cruise Industry Managed Services</div>
    </td>
    ${tagRight ? `<td align="right" valign="top">
      <div style="${FF}font-size:8.5px;font-weight:600;color:${GREEN};letter-spacing:2.4px;text-transform:uppercase;">${tagRight}</div>
      ${subRight ? `<div style="${FM}font-size:12px;color:rgba(255,255,255,.85);margin-top:6px;">${subRight}</div>` : ""}
    </td>` : ""}
  </tr></table>
</td></tr>`;

// Standard footer block.
export const footer = (lines = []) => `
<tr><td style="padding:18px 30px 28px;">
  <div style="${FH}font-size:13px;font-weight:700;color:${NAVY};letter-spacing:3px;">CIMS</div>
  ${lines.map((l) => `<div style="${FF}font-size:10px;color:${LGRAY};line-height:1.6;margin-top:7px;">${l}</div>`).join("")}
</td></tr>`;

// HTML escape — every template must run user data through this.
export const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
