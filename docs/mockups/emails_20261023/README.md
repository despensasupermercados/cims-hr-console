# Renders of 23 Oct 2026, for Miguel's sign-off

Nothing here is wired to send (CIMS email standard §5).

- `t7_email_640.png`, `t7_email_375.png`, `t7_landing_390.png`: the T-7 sign-off link email **as the code would send it
  today** (`src/signoff_ack.js`), and the page its button opens. It is July's design, not the CIMS standard.
- `joy_fixes_*`: "Email Joy · all four", the dashboard's *To correct in TDG* list (`src/emails/hr.keyman.tdg_fixes.v1.js`).
  The rows come from TDG's AdvancedQuery applied 23 Oct 2026.
- `reliever_overlap_*`, `reliever_nomeet_*`: the incoming printer's copy of the sign-off pass, with the outgoing printer's
  contact (`src/emails/hr.signoff.reliever.v1.js`). Phone numbers and emails are made-up samples.
- `hub_ordering_ncl_*`: the Crew Hub's ordering section with the new Norwegian tab (this one is live with the PR).
