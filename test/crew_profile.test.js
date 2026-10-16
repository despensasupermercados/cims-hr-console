// THE CREW PROFILE COLLECTS EVERYTHING, EACH VALUE WITH ITS SOURCE (Miguel, 12 Oct 2026: "lets start by showing the
// right data from the crew .. is where all the data should be collected from the crew .. coz is the crew tab"; then
// "I like A .. but add few things missing from the other 2 versions", mock-up A+). The fixture is James Agbada's real
// rows on 12 Oct 2026: the profile read the Contract Counter and showed "OFF in 39 d · Nov 21" and 163 sea-days four
// weeks after TDG had him off Silhouette on Sep 5 (126 days); Ray's feedback, the intel card and Rita's "Resigned."
// were nowhere on the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCrewProfile, statementContracts, intelParts, whoOf, plusMonths, fmtD, EARLY_DAYS } from "../src/crew_profile.js";

const SC = "SC-0045960";
const JAMES = () => ({
  today: "2026-10-12",
  crew: { agency_id: SC, status: "Inactive", first_name: "James", last_name: "Agbada", ship_crew_id: null },
  override: null,
  snap: { agency_id: SC, status: "Inactive", raw_status: "Inactive", vessel: "MV CELEBRITY SILHOUETTE", run_at: "2026-10-10T13:22:52.031Z", embarked_at: "2026-05-02", debarked_at: "2026-09-05" },
  count: { sc: SC, km: "621164", completed: 1, position: "Junior Printer Specialist", tab: "INACTIVE", as_of: "2026-10-08" },
  countAdded: 0, grade: "Printer Specialist",
  legs: [{ ship: "Silhouette", sc: SC, ours: true, on: "2026-05-02", off: "2026-09-05", is_current: false, source: "registry", offSource: "tdg", offAt: "2026-10-10", fileAt: "2026-10-10", brand: "Celebrity" }],
  counter: [{ seq: 1, ship: "Silhouette", sign_on: "2026-05-02", proj_off: "2026-11-21", act_off: null, imported_at: null }],
  edits: [{ sc: SC, seq: 1, embark: "FORT LAUDERDALE, FLORIDA", disembark: "FORT LAUDERDALE, FLORIDA", sign_on: "2026-05-02", sign_off: "2026-09-05", ship: "Silhouette", eccr: 0, air: 0, hotel: 0, on_conf: 0, off_conf: 0, updated_at: "2026-08-22T14:27:43.570Z", on_key: "2026-05-02" }],
  notes: [{ id: 9, ts: "2026-08-22T14:27:43.906Z", text: "Resigned." }],
  ready: { agency_id: SC, eccr: 0, air: 0, hotel: 0, note: "Resigned.", updated_at: "2026-08-22T14:27:43.906Z" },
  intel: [{ id: "i1", reporter: "Ray Guerra", summary: "• Summary: Corrective Action Notice for recurring inventory failures. • What happened: Urgent orders in May and August. • Impact: Stock-out risk.", confidence: "high", source: "email", ts: "2026-08-04T17:19:23.555Z", contract_no: 1 }],
  fbReqs: [{ role: "ray", status: "answered", requested_at: "2026-06-24T12:23:42.450Z" }],
  fbResp: [{ role: "ray", answers_json: JSON.stringify({ order: "No", ontime: "Mostly", acc: "Minor errors", par: "Some gaps", audit: "No", note: "" }), submitted_at: "2026-06-24T12:23:42.450Z", superseded_at: null }],
  sbmRequests: [], sbm: [], cards: [], deploys: [], dismissals: [],
  statusRows: [
    { field: "status", old_value: "On board", new_value: "On Vacation", resolved: 1, created_at: "2026-09-17T10:40:42.416Z" },
    { field: "status", old_value: "On Vacation", new_value: "Inactive", resolved: 1, created_at: "2026-10-08T16:59:31.868Z" }],
  travel: [{ crew_name: "Agbada, James", year: 2026, month: 5, leg: "on", kind: "crew", air: 1256.63, hotel: 163, medical: 132, visa: 0, food: 0, transport: 0, other: 0, total: 1551.63 }],
  activity: [
    { at: "2026-08-22T14:27:43.964Z", user_id: "rita.berenyi@dg3.com", action: "crew_note", detail: SC },
    { at: "2026-08-22T14:27:43.629Z", user_id: "rita.berenyi@dg3.com", action: "contract_edit", detail: SC + " #1" },
    { at: "2026-08-04T17:19:23.892Z", user_id: "ai", action: "intel_auto", detail: SC + " high" },
    { at: "2026-06-24T12:23:42.552Z", user_id: "miguel.sanmartin@DG3.com", action: "feedback_score", detail: SC + " ray" },
    { at: "2026-06-13T11:52:12.428Z", user_id: "miguel.sanmartin@dg3.com", action: "rotation_assign", detail: SC + " -> pool" }],
  instr: [], links: [],
});

test("James Agbada: the contract is TDG's (off Sep 5), the Counter's Nov 21 is history, Rita's typed date agrees; 77 days early, 126 at sea, 37 ashore", () => {
  const p = buildCrewProfile(JAMES());
  assert.equal(p.contracts.length, 1);
  const k = p.contracts[0];
  assert.deepEqual([k.ship, k.on, k.off, k.current, k.offSource, k.src], ["Silhouette", "2026-05-02", "2026-09-05", false, "tdg", "tdg"]);
  assert.deepEqual(k.dates.map((d) => [d.what, d.value, d.src, d.used, !!d.agrees, !!d.history]), [
    ["Sign-on", "2026-05-02", "tdg_embark", true, false, false],
    ["Sign-off", "2026-09-05", "tdg", true, false, false],
    ["Sign-off", "2026-09-05", "rita", false, true, false],
    ["Sign-off", "2026-11-21", "counter", false, false, true],
  ]);
  assert.deepEqual([k.planned, k.earlyDays, k.days, k.plannedDays], ["2026-11-21", 77, 126, 203]);
  assert.deepEqual([k.embark, k.disembark], ["FORT LAUDERDALE, FLORIDA", "FORT LAUDERDALE, FLORIDA"], "Rita's ports ride with the contract");
  assert.deepEqual(k.travel, [{ leg: "on", air: 1256.63, hotel: 163, medical: 132, visa: 0, other: 0, total: 1551.63 }]);
  assert.deepEqual(p.numbers, { seaDays: 126, ashoreDays: 37, aboardDays: null });
  assert.deepEqual(p.file, { at: "2026-10-10", status: "Inactive", ship: "MV CELEBRITY SILHOUETTE", embarked: "2026-05-02", debarked: "2026-09-05", ageDays: 2 });
  assert.equal(p.count.n, 1); assert.equal(p.identity.km, "621164");
});

test("status history: every AdvancedQuery that moved the word, newest first; On board starts at the embark", () => {
  const p = buildCrewProfile(JAMES());
  assert.deepEqual(p.status.history.map((h) => [h.word, h.from, h.to]), [
    ["Inactive", "2026-10-08", null], ["On Vacation", "2026-09-17", "2026-10-08"], ["On board", "2026-05-02", "2026-09-17"]]);
});

test("what people said: the note with its author (the activity row of the same second), the intel in parts, Ray's answer; the four slots", () => {
  const p = buildCrewProfile(JAMES());
  assert.deepEqual(p.people.feed.map((f) => [f.kind, f.who]), [["note", "Rita"], ["intel", "Ray Guerra"], ["feedback", "Ray · Orders"]]);
  assert.equal(p.people.feed.filter((f) => f.text === "Resigned.").length, 1, "the comment copied into the log is drawn once");
  assert.deepEqual(p.people.feed[1].parts.map((x) => x.label), ["Summary", "What happened", "Impact"]);
  assert.deepEqual(p.people.slots.map((s) => [s.role, s.state, s.at]), [["ray", "answered", "2026-06-24"], ["rolando", "never", null], ["dexter", "never", null], ["sbm", "never", null]]);
});

test("to check: why it ended, the grade against TDG's position, the feedback never asked, the name-only bridge — the console never picks", () => {
  const p = buildCrewProfile(JAMES());
  assert.deepEqual(p.checks.map((c) => c.key), ["end_reason", "grade", "feedback", "identity"]);
  assert.match(p.checks[0].text, /ended 2 mo 16 d early is not recorded\. The comment says “Resigned”\./);
  assert.match(p.checks[1].text, /Printer Specialist .*TDG’s count file says Junior Printer Specialist/);
  assert.match(p.checks[2].text, /Sep 5, 2026 — never asked: Rolando, Dexter, Shipboard review\./);
  // a recorded end reason on the card for that contract answers the first
  const j = JAMES(); j.cards = [{ id: "a1", vessel_name: "Silhouette", sign_on: "2026-05-02", end_reason: "early_relief" }];
  assert.ok(!buildCrewProfile(j).checks.some((c) => c.key === "end_reason"));
  // the same grade is no row
  const g = JAMES(); g.grade = "Junior Printer Specialist";
  assert.ok(!buildCrewProfile(g).checks.some((c) => c.key === "grade"));
});

test("activity: who did what, newest first, with every TDG file that moved the status", () => {
  const a = buildCrewProfile(JAMES()).activity.map((x) => [x.at.slice(0, 10), x.who, x.text]);
  assert.deepEqual(a, [
    ["2026-10-08", "TDG file", "Status On Vacation → Inactive"],
    ["2026-09-17", "TDG file", "Status On board → On Vacation"],
    ["2026-08-22", "Rita", "Comment saved"],
    ["2026-08-22", "Rita", "Contract edited · contract 1"],
    ["2026-08-04", "AI", "Field intel filed · high match"],
    ["2026-06-24", "Miguel", "Feedback entered · Ray · Orders"],
    ["2026-06-13", "Miguel", "Board placement · → pool"],
    ["2026-05-02", "TDG file", "Embarked Silhouette"],
  ]);
});

test("a running, projected contract: not early, counted to today, the board's readiness, aboard days; a held one says so", () => {
  const j = JAMES();
  j.legs = [{ ship: "Allure", sc: SC, ours: true, on: "2026-07-01", off: "2027-02-01", is_current: true, source: "registry", offSource: "projected", fileAt: "2026-10-10", brand: "Royal" }];
  j.edits = []; j.counter = []; j.ready = { eccr: 1, air: 0, hotel: 1, note: "" }; j.statusRows = [];
  const p = buildCrewProfile(j), k = p.contracts[0];
  assert.deepEqual([k.current, k.earlyDays, k.days, k.planned], [true, 0, 103, "2027-02-01"]);
  assert.deepEqual(k.readiness, { eccr: true, air: false, hotel: true, on: false, off: false, src: "board" });
  assert.deepEqual(p.numbers, { seaDays: 103, ashoreDays: null, aboardDays: 103 });
  assert.ok(!p.checks.some((c) => c.key === "feedback"), "a running contract is not missing its feedback yet");
  j.legs[0] = { ...j.legs[0], off: "2026-10-01", offSource: "rita", heldByFile: true };
  assert.equal(buildCrewProfile(j).contracts[0].dates[1].held, true);
});

test("several contracts, newest first; the Counter's own history legs are labelled counter; an end within three weeks of the plan is the rota, not early", () => {
  const j = JAMES();
  j.legs = j.legs.concat([{ ship: "Edge", sc: SC, ours: true, on: "2025-06-01", off: "2025-12-20", is_current: false, source: "keyman_roster" }]);
  j.counter = j.counter.concat([{ seq: 0, ship: "Edge", sign_on: "2025-06-01", proj_off: "2026-01-01", act_off: "2025-12-20" }]);
  const p = buildCrewProfile(j);
  assert.deepEqual(p.contracts.map((c) => [c.n, c.ship, c.src, c.offSource, c.earlyDays]), [[2, "Silhouette", "tdg", "tdg", 77], [1, "Edge", "counter", "counter", 0]]);
  assert.equal(p.numbers.seaDays, 126 + 202);
  assert.equal(EARLY_DAYS, 21);
});

test("manual entries over TDG are listed, a manual status is a row to check, and a file/record disagreement without one is too", () => {
  const j = JAMES(); j.override = { agency_id: SC, email: "x@y.z", retired: 1 };
  const p = buildCrewProfile(j);
  assert.deepEqual(p.identity.manual.map((m) => m.field), ["email", "retired"]);
  assert.ok(p.checks.some((c) => c.key === "manual_status"));
  const k = JAMES(); k.crew.status = "On Vacation";
  assert.ok(buildCrewProfile(k).checks.some((c) => c.key === "status"));
});

test("feedback kept, not carried: a superseded answer is drawn as earlier; a request not answered is pending; a shipboard review answered fills its slot", () => {
  const j = JAMES();
  j.fbResp = j.fbResp.concat([{ role: "ray", answers_json: "{}", submitted_at: "2026-06-01T00:00:00Z", superseded_at: "2026-06-24T12:23:42.450Z" }]);
  j.fbReqs = j.fbReqs.concat([{ role: "dexter", status: "pending", requested_at: "2026-09-01T00:00:00Z" }]);
  j.sbm = [{ ship: "Silhouette", rating: 4, q_final: "Good", submitted_at: "2026-09-10T00:00:00Z" }];
  const p = buildCrewProfile(j);
  assert.equal(p.people.feed.filter((f) => f.kind === "feedback" && f.superseded).length, 1);
  assert.deepEqual(p.people.slots.map((s) => s.state), ["answered", "never", "pending", "answered"]);
});

test("rotation: earmarks still to come (with the day Joy was told), TDG earmarks removed, emails to Joy", () => {
  const j = JAMES();
  j.cards = [{ id: "a2", vessel_name: "Apex", sign_on: "2026-12-01", planned_sign_off: "2027-07-01", deployed_at: "2026-10-11T09:00:00Z" }, { id: "a3", vessel_name: "Edge", sign_on: "2026-01-01", actual_sign_off: "2026-03-01" }];
  j.dismissals = [{ ship_key: "Allure", dismissed_at: "2026-10-09T10:00:00Z", dismissed_by: "rita.berenyi@dg3.com" }];
  j.deploys = [{ ship: "Apex", sign_on: "2026-12-01", sign_off: "2027-07-01", sent_at: "2026-10-11T09:00:00Z", sent_by: "rita.berenyi@dg3.com" }];
  const r = buildCrewProfile(j).rotation;
  assert.deepEqual(r.earmarks, [{ id: "a2", ship: "Apex", on: "2026-12-01", off: "2027-07-01", told: "2026-10-11" }]);
  assert.deepEqual(r.dismissed, [{ ship: "Allure", at: "2026-10-09", by: "Rita" }]);
  assert.deepEqual(r.joy, [{ ship: "Apex", on: "2026-12-01", off: "2027-07-01", at: "2026-10-11", by: "Rita" }]);
});

test("the statement PDF reads the same schedule: actual once TDG/Rita gave it, projected stays projected, sea-days to today", () => {
  const legs = [
    { ship: "Silhouette", sc: SC, ours: true, on: "2026-05-02", off: "2026-09-05", is_current: false, source: "registry", offSource: "tdg" },
    { ship: "Edge", sc: SC, ours: true, on: "2025-06-01", off: "2025-12-20", is_current: false, source: "keyman_roster" },
    { ship: "Other", sc: "SC-1", ours: true, on: "2026-01-01", off: "2026-08-01", source: "registry", offSource: "tdg" },
  ];
  assert.deepEqual(statementContracts(legs, SC, "2026-10-12"), { contracts: [
    { seq: 1, ship: "Edge", on: "2025-06-01", act: "2025-12-20", proj: null },
    { seq: 2, ship: "Silhouette", on: "2026-05-02", act: "2026-09-05", proj: null }], seaDays: 202 + 126 });
  const cur = [{ ship: "Allure", sc: SC, ours: true, on: "2026-07-01", off: "2027-02-01", is_current: true, source: "registry", offSource: "projected" }];
  assert.deepEqual(statementContracts(cur, SC, "2026-10-12"), { contracts: [{ seq: 1, ship: "Allure", on: "2026-07-01", act: null, proj: "2027-02-01" }], seaDays: 103 });
});

test("helpers: calendar months clamp, dates read 'Sep 5, 2026', who from an email, plain intel stays whole", () => {
  assert.equal(plusMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(plusMonths("2026-05-02", 7), "2026-12-02");
  assert.equal(fmtD("2026-09-05"), "Sep 5, 2026");
  assert.deepEqual([whoOf("rita.berenyi@dg3.com"), whoOf("ai"), whoOf("")], ["Rita", "AI", "—"]);
  assert.deepEqual(intelParts("plain words"), [{ label: null, text: "plain words" }]);
  assert.deepEqual(buildCrewProfile({ today: "2026-10-12", crew: { agency_id: "X" } }).contracts, [], "an empty crew never throws");
});

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const body = (name) => { const i = W.indexOf(name); assert.notEqual(i, -1, name); const r = W.slice(i + name.length); const j = r.search(/\n(?:async )?function \w+\(/); return r.slice(0, j); };

test("static: apiCrewOne reads every source in ONE wave and returns the profile; status is the crew list's word; the contracts are the schedule", () => {
  const b = body("async function apiCrewOne(");
  for (const t of ["registry_snapshot", "contract_edit", "contract_count", "crew_note_log", "crew_ready", "crew_intel", "feedback_request2", "feedback_response2", "sbm_review_request", "sbm_review_response", "FROM assignment", "deploy_log", "earmark_dismiss", "sync_conflict", "travel_expense", "activity_log", "instr_ack", "ack_request"])
    assert.ok(b.includes(t), "the wave reads " + t);
  assert.match(b, /boardLegs\(env\), \/\/ the ONE schedule/);
  assert.equal((b.match(/await Promise\.all\(\[/g) || []).length, 2, "the guards, then ONE read wave");
  assert.match(b, /crew\.status = crewStatus\(row, ov, scheduleBySc\(HIST\)\[id\], today\);/);
  assert.match(b, /legs: HIST\.filter\(\(h\) => h && h\.sc === id\)/);
  assert.match(b, /return json\(\{ crew, contracts: ct, daysWorked: profile\.numbers\.seaDays, deployment: crewDeployment\(crew, VESSEL_REF, DRY_DOCK, today\), profile, tdg, override: ov \|\| null, canMoney: isMoneyUser\(session && session\.email\) \}\);/);
});

test("static: the page draws A+ — header with TDG's row, the band, the numbers with sources, the career line, the contract's dates, people, status history, documents, rotation, checks, activity", () => {
  const p = body("async function openCrew(");
  for (const s of ["class=pf2band", "pfNum(cnN,'Completed contracts',cnSrc)", "'Time at sea'", "pfSeaTime(K,todayS)", "pfContract(last,cur===last,todayS,K,PE.feed||[])", "pfPeople(PE,c.agency_id)", "Status history", "pfDocs(c,cur,todayS)", "Next &amp; rotation", "To check <span>", "Activity <span>"])
    assert.ok(p.includes(s), "the profile draws " + s);
  assert.doesNotMatch(p, /Next rung if clean/, "a $0 rung for a Junior said nothing");
  // 13 Oct 2026 (Miguel: "u repeat it in the crew tab few times .. 1 is enough"; "u can merge these 2 into 1"): time at
  // sea is said once, in months and days; the Aboard / Ashore tile and the separate Career box are gone — the career line
  // is drawn inside the contract card, under who handed over and who takes over.
  assert.doesNotMatch(p, /'Aboard',pfSrc|'Days at sea'|h\+=pfCareer\(/);
  assert.match(W, /return '<div class=pf3relay2><div class=pf3ppl>'\+L\+R\+'<\/div>'\+pfCareer\(K&&K\.length\?K:\[x\],feed\|\|\[\],todayS,x\.on,isCur&&a&&\(a\.on\?a\.on>=x\.on:a\.src==='tdg_earmark'\)\?a:null\)\+'<\/div>';/);
  // 13 Oct 2026 ("if u have a replacement .. projected .. so we are consistent"): the running contract's line ends in its
  // reliever, drawn like the board — the earmark yellow, firm once TDG has it.
  assert.match(W, /class="pf2nx/);
  assert.doesNotMatch(p, /class=pf2file/, "the TDG file box beside the name is gone (Miguel, 12 Oct 2026: \"dont think is needed\")");
  assert.doesNotMatch(p, /loadSbmCards\(/, "shipboard reviews ride in the profile's feed");
  // sign-off sends only while a contract runs
  assert.match(p, /\+\(cur\?\('<button class="btn ghost" onclick="sendSignoffInstructions/);
  assert.match(p, /<button class="btn ghost" disabled>Send instructions<\/button>/);
  assert.match(W, /var PF_SRC=\{tdg:\['#2E9E5B','TDG file'\]/);
});

test("the page's documents block reads a contract: expired by the sign-on red, lapsing before the sign-off amber, Schengen optional", () => {
  const i = W.indexOf("function pfDocs("), j = W.indexOf("\n}\n", i) + 2;
  const pfAdd = W.slice(W.indexOf("function pfAddMo("), W.indexOf("\n", W.indexOf("function pfAddMo(")));
  const pfDocs = new Function("escHtml", "fmtDateS", pfAdd + "\n" + W.slice(i, j) + "; return pfDocs;")((s) => String(s), (s) => String(s));
  const c = { med_exp: "2027-01-10", sirb_exp: "2026-10-01", pp_exp: "2033-11-21", usv_exp: null, sch_exp: null, pp_no: "P1", pp_place: "DFA" };
  const h = pfDocs(c, null, "2026-10-12");
  assert.match(h, /pfdoc amber"><i><\/i><span class=l>Medical<\/span><b>Lapses 2027-01-10/);
  assert.match(h, /pfdoc red"><i><\/i><span class=l>Seaman book<\/span><b>Expired 2026-10-01/);
  assert.match(h, /pfdoc red"><i><\/i><span class=l>US visa<\/span><b>Missing/);
  assert.match(h, /pfdoc na"><i><\/i><span class=l>Schengen<\/span><b>Not held · optional/);
  assert.match(h, /1 of 4 required valid/);
  assert.match(h, /Read against a 7-month contract from today, to 2027-05-12/);
  assert.match(h, /P1 · DFA/);
});

test("the Crew tab opens on the active crew: On board selected by default, on open and after Clear filters (Miguel, 12 Oct 2026)", () => {
  assert.match(W, /var CREW_DEFAULT_STATUS=\['On board'\];\nvar CF=\{q:'',status:CREW_DEFAULT_STATUS\.slice\(\),/);
  assert.match(body("async function renderCrew("), /CF\.status=CREW_DEFAULT_STATUS\.slice\(\);/);
  assert.match(W, /function clearCrewFilters\(\)\{CF\.q='';CF\.status=CREW_DEFAULT_STATUS\.slice\(\);/);
  assert.doesNotMatch(W, /CF\.status=\[\];CF\.comp=''/, "no path resets the Crew tab to All crew on open");
});

test("the contract's bar names who he relieved and who relieves him: same hull, nearest sign-off before, first start after; a TDG earmark only when nothing dated follows (Miguel, 12 Oct 2026)", async () => {
  const { handovers, HANDOVER_DAYS } = await import("../src/crew_profile.js");
  const c = { ship: "Symphony", on: "2026-09-12", off: "2027-04-10" };
  const legs = [
    { sc: "SC-A", ship: "Symphony", on: "2026-02-10", off: "2026-09-14", source: "registry", name: "Ana A" },  // relieved by him (2-day handover)
    { sc: "SC-Z", ship: "Symphony", on: "2025-07-01", off: "2026-02-10", source: "registry" },                 // the one before that
    { sc: "SC-B", ship: "Allure", on: "2026-02-10", off: "2026-09-12", source: "registry" },                   // another hull
    { sc: "SC-ME", ship: "Symphony", on: "2026-09-12", off: "2027-04-10", source: "registry" },                // himself
  ];
  const cards = [{ sc: "SC-C", ship: "Symphony", sign_on: "2027-04-08", crew_name: "Carl C", deployed_at: null }, { sc: "SC-D", ship: "Symphony", sign_on: "2027-11-01", crew_name: "Dan D" }];
  const h = handovers(c, { legs, cards, names: { "SC-A": "Ana Alonzo", "SC-C": "Carl Cruz" }, sc: "SC-ME" });
  assert.deepEqual(h.before, { sc: "SC-A", name: "Ana Alonzo", off: "2026-09-14", src: "tdg" });
  // 13 Oct 2026: the next one carries its sign-off too, so the timeline draws the replacement as the board does.
  assert.deepEqual(h.after, { sc: "SC-C", name: "Carl Cruz", on: "2027-04-08", off: null, src: "earmark", told: false, tdg: false });
  // TDG's file earmarks the same crew for this hull: the card is in TDG (the board's "EARMARK · TDG"), not "console only"
  const h2 = handovers(c, { legs, cards, tdgEarmarks: [{ agency_id: "SC-C", vessel: "MV SYMPHONY OF THE SEAS" }], names: {}, sc: "SC-ME" });
  assert.equal(h2.after.tdg, true);
  // nothing dated after: TDG's Earmarked row names the next one, without dates
  const t = handovers(c, { legs, cards: [], tdgEarmarks: [{ agency_id: "SC-E", name: "Eve E", vessel: "MV SYMPHONY OF THE SEAS" }], sc: "SC-ME" });
  assert.deepEqual(t.after, { sc: "SC-E", name: "Eve E", on: null, src: "tdg_earmark" });
  // a sign-off far from his sign-on is not a handover
  assert.equal(handovers({ ship: "Symphony", on: "2026-12-01" }, { legs: [legs[0]], sc: "SC-ME" }).before, null);
  assert.equal(HANDOVER_DAYS, 45);
  // the page draws both ends and links each name to that profile — since 13 Oct 2026 as the card's relay (pfRelay:
  // the one who handed over, this contract's track, the one who takes over), re-pinned from the 12 Oct bar line
  assert.match(W, /function pfRelay\(x,isCur,todayS,K,feed\)\{/);
  assert.match(W, /h\+=pfRelay\(x,isCur,todayS,K,feed\);/);
  assert.match(W, /who\(b\)\+'<small>Handed over '\+fmtDateS\(b\.off\)\+'<\/small>/);
  assert.match(W, /<span>No reliever yet<\/span><small>Earmark one on the Keyman board<\/small>/);
  assert.match(W, /onclick="openCrew\(this\.dataset\.sc\);return false"/);
});
