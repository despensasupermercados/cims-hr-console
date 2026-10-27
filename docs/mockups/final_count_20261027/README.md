# Renders of 27 Oct 2026, for Miguel's sign-off — the count is not in the notes any more

The paper inventory sent to Rolando is replaced by two blind counts in cims-hon (`src/lib/stockCount.js`): a FINAL count by
the outgoing (9:00 ship time two days before the sign-off, to the end of the sign-off day) and an ARRIVAL count by the
incoming (9:00 ship time on the day the shelf becomes his, 24 hours), each with its own email from HON. Four crew emails
here said "sign your count in the handover notes"; each now says what HON does. Rendered at 640, 390 and 320 (scrollWidth =
viewport each, and again with the `<style>` block removed). Names are the test fixtures; phones and emails are samples.

- `t14_final_count_*`: the T-14 sign-off instructions. Step 1c points to the count; step 6 names the day it opens, that it
  is blind, that it must agree with OBP and with the reliever's count, and who receives the result; the responsibility box
  and the bonus box (sign-off on or after 1 Nov 2026) say a gap counts against him.
- `reliever_arrival_count_*`: the incoming printer's pass. Step 3 names the arrival count's day.
- `t7_confirms_*`: the T-7 confirmation no longer asks him to confirm a count that opens five days later.
- `welcome_arrival_count_*`: the welcome email's first step is the arrival count, dated (here 20 OCT, the day Mark signs
  off, two days after Archie joins).
