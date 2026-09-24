import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocRadarEmail } from '../src/doc_radar.js';

const TODAY = '2026-09-24';

// --- Daylight layout (cims-email-standard §9, Brain recuwEz3HB4HHKZ4R, 24 Sep 2026) ----------
test('buildDocRadarEmail: Daylight — canonical mast, headline answer, centred stat strip, CIMS tokens only', () => {
  const rows = [{ agency_id:'SC-1', name:'Ben Cruz', status:'Earmarked', deployable:true,
    docs:{ pp_exp:'2027-05-01', sirb_exp:null, med_exp:'2026-09-01', usv_exp:'2026-11-01', sch_exp:null },
    cells:{ pp_exp:'valid', sirb_exp:'missing', med_exp:'expired', usv_exp:'expiring', sch_exp:'na' } }];
  const html = buildDocRadarEmail({ runDate: TODAY, rows, counts:{ crew:1, expired:1, expiring:1, missing:1, suspect:0, deployable:1 },
    urgent:{ name:'Ben Cruz', status:'Earmarked', deployable:true, label:'MED', date:'2026-09-01' } });
  assert.match(html, /CRUISE INDUSTRY MANAGED SERVICES/, 'the one letterhead');
  assert.doesNotMatch(html, /A division of/, 'nothing on the right of the mast (§1)');
  assert.match(html, /1 crew need a document fixed\./);
  assert.match(html, /1 already expired\./);
  assert.match(html, /align="center" style="text-align:center;padding:14px 0 0;border-top:3px solid #96281B/, 'stat strip centred under the red rule');
  assert.doesNotMatch(html, /rgba\(|linear-gradient/);
  assert.doesNotMatch(html, /#DC2626|#8B5CF6|#EDE9FE|#E0A64B/i, 'retired off-token colours are gone');
  assert.match(html, /Fleet document radar · 1 crew need a document fixed\. Most urgent: Ben Cruz\./, 'inbox preview line');
});
