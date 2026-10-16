// THE TRAVEL TAB'S FILTERS (Miguel, 16 Oct 2026: "I dont think this filter is working correctly .. review this and all the
// filters and fix the bugs"). Static guards on the page code in src/worker.js: the background refresh keeps every filter
// (it used to re-run renderTravel, resetting Year / Month / Category / cruise line / kind and the search box to the
// defaults), and every selector reaches every section — the period (year + month) drives the tiles, the STLY table, the
// top spenders, the anomalies, the bill-vs-workbook table and the search; a category narrows every amount and drops the
// budget pacing (the $15,000 is for all travel together); All years says it shows the latest year.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const fn = (name) => { const i = W.indexOf("function " + name + "("); assert.ok(i >= 0, name + " exists"); const j = W.indexOf("\nfunction ", i + 10); return W.slice(i, j < 0 ? undefined : j); };

test("the background refresh keeps the filters: both reads revalidate into travelRefresh, which repaints under the same TF", () => {
  assert.match(W, /cachedJson\('\/api\/travel',travelRefresh\)/);
  assert.match(W, /cachedJson\('\/api\/sga',travelRefresh\)/);
  assert.doesNotMatch(W, /cachedJson\('\/api\/(travel|sga)',renderTravel\)/, "renderTravel resets TF — never the revalidation target");
  const r = fn("travelRefresh");
  assert.match(r, /if\(!e\|\|!e\.data\|\|e\.data\.error\|\|!document\.getElementById\('tyear'\)\)\{renderTravel\(\);return;\}/, "no header on the page → a full render");
  assert.match(r, /keep=sel\.value;sel\.innerHTML=tYearOptions\(tYears\(\)\);sel\.value=keep;/, "the year list is refreshed with the selection kept");
  assert.match(r, /\n  paintTravel\(\);\n\}/, "the body repaints; TF is not touched");
  assert.doesNotMatch(r, /TF=\{/, "the refresh never resets the filters");
});

test("the period is year + month, and every section reads it", () => {
  const p = fn("tPeriod");
  assert.match(p, /var mo=TF\.month\?\+TF\.month:0;/);
  assert.match(p, /if\(mo\)months\.push\(mo\);else for\(var mm=1;mm<=lastMo;mm\+\+\)months\.push\(mm\);/, "one month, else the closed months of the year");
  assert.match(p, /budgetMonths=mo\?\(\(inProgress\|\|ahead\)\?0:1\):lastMo/, "a month in progress or ahead has no budget pacing");
  assert.match(p, /\(TF\.year\?'':' · latest year'\)/, "All years says the overview shows the latest year");
  const t = fn("paintTravel");
  assert.match(t, /var ytdA=tSum\(sc,LY,months,cat\), ytdB=TBUD\*P\.budgetMonths, ytdP=hasPY\?tSum\(sc,PY,months,cat\):null;/, "the tiles read the period and the category");
  assert.match(t, /var hasPY=!!PY&&sc\.some\(function\(r\)\{return r\.year===PY;\}\);/, "a previous year with no rows reads '—', never '$0'");
  assert.match(t, /var budgeted=!TF\.client&&TF\.kind==='crew'&&!cat;/, "one category has no budget of its own");
  assert.match(t, /r\.year===LY&&months\.indexOf\(r\.month\)>=0;\}\)\.forEach\(function\(r\)\{var v=cat\?\(r\[cat\]\|\|0\):r\.total;/, "the top spenders are the period's");
  assert.match(t, /\(cat\?\[cat\]:TCATS\)\.forEach/, "the STLY table narrows to the category");
  assert.match(t, /sgaCompareHTML\(sc,LY,P\.mo\?\[P\.mo\]:null,cat\)/, "the bill-vs-workbook table takes the month and the category");
  assert.match(t, /var yrRows=sc\.filter\(function\(r\)\{return r\.year===LY&&months\.indexOf\(r\.month\)>=0&&val\(r\)>0;\}\);/, "anomalies inside the period");
  assert.match(t, /Line items'\+\(TF\.year\?'':' · all years'\)/, "the line items say when they span every year");
  const c = fn("sgaCompareHTML");
  assert.match(c, /function sgaCompareHTML\(sc,LY,monthsSel,cat\)/);
  assert.match(c, /l\.year===LY&&inSel\(l\.month\)/);
});

test("the search lists people inside the same period; the Training centre view greys out the selectors it does not use", () => {
  const s = fn("paintTravelSearch");
  assert.match(s, /tScope\(\)\.filter\(function\(r\)\{if\(TF\.year&&r\.year!==\+TF\.year\)return false;if\(TF\.month&&r\.month!==\+TF\.month\)return false;if\(cat&&!\(r\[cat\]>0\)\)return false;return true;\}\)/);
  const ch = fn("tFilterChrome");
  assert.match(ch, /var off=TF\.kind==='training';/);
  assert.match(ch, /\['tmonth','tcat','tclient','tq'\]\.forEach/);
  assert.match(fn("paintTravel"), /^function paintTravel\(\)\{\n  tFilterChrome\(\);/);
  // the year list is the workbook's AND the bill's years, with a value on every option
  assert.match(fn("tYears"), /\[SGA\.lines,SGA\.summary,SGA\.training\]/);
  assert.match(W, /function tYearOptions\(years\)\{return '<option value="">All years<\/option>'\+years\.map\(function\(y\)\{return '<option value="'\+y\+'">'\+y\+'<\/option>';\}\)/);
  assert.match(fn("paintTraining"), /No training-centre costs on file for '\+LY\+'/);
  // a negative amount reads -$655, never $-655 (the pacing table's variance, the bill-vs-workbook gap)
  assert.match(W, /function usd0\(n\)\{var v=Number\(n\|\|0\);return \(v<0\?'-':''\)\+'\$'\+Math\.abs\(v\)/);
});

// A quiet year-over-year on every monthly chart (Miguel, 16 Oct 2026: "a very settle YOY comparison when filtered"): last
// year's same month as a pale bar beside each month, a muted percentage under the month, one legend line; the plain bar
// when no previous year exists. One helper for the Training centre chart and both Travel tab charts.
test("every monthly chart draws last year beside this year through one helper", () => {
  const b = fn("tBars");
  assert.match(b, /hasPrev=!!prev&&prev\.some\(function\(v\)\{return v>0;\}\)/, "no previous year → the plain bar");
  assert.match(b, /if\(hasPrev&&\(prev\[i\]\|\|0\)>maxv\)maxv=prev\[i\];/, "both years share one scale");
  assert.match(b, /background:'\+PALE\+'/, "last year is the pale bar");
  assert.match(b, /\(d>0\?'\+':''\)\+d\+'%'/, "the small percentage is this year vs last");
  assert.match(b, /d=\(hasPrev&&pv0>0&&m<=upto\)/, "no percentage for a month still running or not started");
  assert.match(b, /same month · the small figure is '\+o\.ly\+' vs '\+o\.py/, "one legend line");
  assert.match(fn("paintTraining"), /h\+=tBars\(curT,\{prev:prevT,ly:LY,py:PY,upto:lastMo,color:/);
  const t = fn("paintTravel");
  assert.match(t, /h\+=tBars\(cur0,\{prev:hasPY\?prev0:null,ly:LY,py:PY,upto:lastMo,dim:dim\}\);/, "the non-budgeted chart");
  assert.match(t, /h\+=tBars\(curB,\{prev:hasPY\?prevB:null,ly:LY,py:PY,budget:TBUD,upto:lastMo,dim:dim,color:/, "the budget pacing chart keeps its dashed line and red months");
  assert.doesNotMatch(t, /gap:8px;height:150px/, "no hand-rolled bar loop left in paintTravel");
});
