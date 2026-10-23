# Renders of 23 Oct 2026, for Miguel's sign-off

Nothing here is wired to send (CIMS email standard §5).

- `t7_email_640.png`, `t7_email_375.png`, `t7_landing_390.png`: the T-7 sign-off link email **as the code would send it
  today** (`src/signoff_ack.js`), and the page its button opens. It is July's design, not the CIMS standard.
- `joy_fixes_*`: "Email Joy · all four", the dashboard's *To correct in TDG* list (`src/emails/hr.keyman.tdg_fixes.v1.js`).
  The rows come from TDG's AdvancedQuery applied 23 Oct 2026.
- `reliever_overlap_*`, `reliever_nomeet_*`: the incoming printer's copy of the sign-off pass, with the outgoing printer's
  contact (`src/emails/hr.signoff.reliever.v1.js`). Phone numbers and emails are made-up samples.
- `hub_ordering_ncl_*`: the Crew Hub's ordering section with the new Norwegian tab (this one is live with the PR).

## Round 2, 23 Oct 2026 — phone first
Miguel on the first renders: "the mobile version needs work". Rendered at 640, 375 and 320 (scrollWidth = viewport each).
- Joy: headline "2 to correct in TDG. / The next file closes them." (two lines at 375), stat labels of two words, the pill
  ABOVE the name, the note in two short lines ("TDG: On board, no debark date. …"), the card's left rule in the status colour.
- Reliever: headline "Over to you, A.J. / Kevin signs off 31 Oct.", IN TDG in the pass's band, WhatsApp its own row, two
  dates side by side (never three abreast), the overlap a line of its own ("Together aboard 16 Oct–31 Oct · 15 days").
- Crew Hub, Norwegian: the linen keeper raises the MXP order; the printer keeps OBP up to date every day (Miguel, same day).
