// STAGING NEVER EMAILS ANYONE BUT THE PEOPLE NAMED (14 Oct 2026, Printshop Audit build).
//
// Why this exists. `[env.staging]` used to declare no MAILER at all, so the staging Worker could not send a single
// email (not even a magic link). The audit needs staging to send its request, reminder and assessment emails before
// any of them reaches a ship. But wrangler INHERITS `[triggers]` into a named environment, so staging runs the same
// hourly cron as production against a COPY of the production database: the sign-off instructions to crew, the doc
// radar, the weekly movements email. Handing that Worker a mailer as-is would let a staging cron email real
// seafarers and Onboard Support from copied data.
//
// So the MAILER binding itself is wrapped, once, at every entry point (fetch, scheduled, email). With
// `MAIL_ONLY_TO` unset (production) the binding is returned untouched — the same object, nothing changes. With it set
// (staging), every envelope's to / cc / bcc is cut to the addresses on that list; an envelope with nobody left in
// `to` is NOT sent and answers { ok:false, error:"mail_guard" } like any refused send; the subject says [STAGING].
// Every direct `env.MAILER.fetch` in the code base goes through the wrapper, because the wrapper IS env.MAILER.
// Pinned by test/mail_guard.test.js.

export function addrOf(s) {
  const t = String(s == null ? "" : s).trim();
  const m = t.match(/<([^>]+)>/);
  return (m ? m[1] : t).trim().toLowerCase();
}

export function allowList(onlyTo) {
  return String(onlyTo || "").split(/[,;\s]+/).map(addrOf).filter((a) => a.includes("@"));
}

const listOf = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

// Pure: the envelope as the guard would send it, and who was dropped.
export function guardEnvelope(envelope, onlyTo) {
  const allow = new Set(allowList(onlyTo));
  const out = Object.assign({}, envelope || {});
  const dropped = [];
  for (const k of ["to", "cc", "bcc"]) {
    if (!(k in out)) continue;
    const keep = [];
    for (const a of listOf(out[k])) (allow.has(addrOf(a)) ? keep : dropped).push(a);
    out[k] = keep;
  }
  const send = listOf(out.to).length > 0;
  if (send && out.subject != null && !/^\[STAGING\]/.test(String(out.subject))) out.subject = "[STAGING] " + out.subject;
  return { envelope: out, dropped, send };
}

export function guardMailer(binding, onlyTo) {
  if (!binding || !allowList(onlyTo).length) return binding;
  return {
    async fetch(input, init) {
      let body = init && init.body;
      let env0 = null;
      try { env0 = JSON.parse(typeof body === "string" ? body : ""); } catch (e) { env0 = null; }
      if (!env0 || typeof env0 !== "object") {
        return new Response(JSON.stringify({ ok: false, error: "mail_guard", detail: "unreadable envelope on a guarded mailer" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const g = guardEnvelope(env0, onlyTo);
      if (!g.send) {
        return new Response(JSON.stringify({ ok: false, error: "mail_guard", detail: "no allowed recipient", dropped: g.dropped.length }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return binding.fetch(input, Object.assign({}, init, { body: JSON.stringify(g.envelope) }));
    },
  };
}
