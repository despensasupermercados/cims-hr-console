// "He clicks the box to choose the file and is not able to choose the file" (Miguel, 6 Nov 2026, Mark John Bornea,
// Independence). His request (ar_92817f77) received no file and no count. The page, rebuilt in Chromium with his real request,
// opens the chooser on a tap on desktop, iPhone and Android — so the box works where a browser can choose a file, and fails
// where it cannot: a mail or chat app's own browser on Android (it shows the page and never opens a picker) or a desk that
// blocks file dialogs (Darryl Ramos, Constellation, HON, 1 Oct 2026). The page now (1) says so at the top when it opens
// inside an Android app's browser, with the link to copy into Chrome; (2) says so under the box when a tap opened nothing;
// (3) takes the file dropped on the box on a computer, the second way in. The crew page, booted in node:vm on a small fake
// DOM, like test/audit_upload_send.test.js. Correction, the same evening: the "Firefox on Linux" opens of Mark's link were
// Mimecast's protected viewer (Browser Isolation), not the ship's computer — the last tests below.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { auditUploadHtml } from "../src/audit_upload_ui.js";

const UA = {
  outlookAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36",
  messengerAndroid: "Mozilla/5.0 (Linux; Android 12; RMX3263) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.111 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/435.0.0.36.111;]",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  iphoneApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15",
  // what Mimecast's protected viewer (Browser Isolation) calls itself: every Linux open of Mark's link on 6 Nov 2026
  mimecast: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
};
const PICK_MS = 6000;

function el(id, attrs = {}) {
  return { id, innerHTML: "", textContent: "", value: "", className: "", disabled: false, style: {}, attrs, type: attrs.type,
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    closest() { return null; }, focus() {}, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [] };
}
const STATE = { status: "sent", ship: "Independence", crew: "Mark John Bornea", auditor: "Dexter Lawrence", dueAt: "2099-01-01T00:00:00Z", test: false,
  machines: [{ serial: "AC58011021400", label: "Machine # 1", model: "C4070", down: null, p43: null, mgmt: null },
    { serial: "AC58011021252", label: "Machine # 2", model: "C4070", down: null, p43: null, mgmt: null }],
  lines: [{ part_no: "A3VX230 / 99PRD67086", description: "TN619Y YELLOW TONER" }], counted: {}, extras: [], gate: { open: false, missing: ["Pattern 43 for Machine # 1"] } };

function boot(ua) {
  const html = auditUploadHtml({ token: "tok", ship: "Independence", crew: "Mark John Bornea" });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const els = new Map(), $ = (id) => { if (!els.has(id)) els.set(id, el(id)); return els.get(id); };
  const on = {}, won = {}, timers = [], xhr = [], errors = [];
  const add = (bag) => (k, f) => { (bag[k] = bag[k] || []).push(f); };
  const del = (bag) => (k, f) => { bag[k] = (bag[k] || []).filter((x) => x !== f); };
  const fetch = (url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(String(url).split("?")[0] === "/api/audit/u/state" ? JSON.parse(JSON.stringify(STATE)) : { ok: true }) });
  function XMLHttpRequest() { this.upload = {}; this.headers = {}; }
  XMLHttpRequest.prototype.open = function (m, u) { this.url = u; xhr.push(this); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.headers[k] = v; };
  XMLHttpRequest.prototype.send = function (f) { this.body = f; };
  const window = { addEventListener: add(won), removeEventListener: del(won), location: { hash: "", href: "https://audit.cims.work/audit/u/tok" } };
  const bodyCls = new Set();
  const body = { classList: { add: (c) => bodyCls.add(c), remove: (c) => bodyCls.delete(c), contains: (c) => bodyCls.has(c) } };
  const document = { getElementById: $, querySelector: () => null, querySelectorAll: () => [], activeElement: null, visibilityState: "visible", body,
    addEventListener: add(on), removeEventListener: del(on) };
  const ctx = vm.createContext({ window, document, fetch, XMLHttpRequest, navigator: { userAgent: ua, maxTouchPoints: /iPhone|Android/.test(ua) ? 5 : 0 },
    location: window.location, console: { log() {}, error: (e) => errors.push(e) }, JSON, Object, Array, String, Number, Math, Date, Promise, isNaN, encodeURIComponent,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].fn = null; } });
  window.__T = "tok";
  for (const s of scripts) vm.runInContext(s, ctx);
  const tick = () => new Promise((r) => setImmediate(r));
  const fire = (ms) => { for (const t of timers) if (t.fn && t.ms === ms) { const f = t.fn; t.fn = null; f(); } };
  const emit = (bag, k, e) => { for (const f of (bag[k] || []).slice()) f(e); };
  const fileInput = (serial, kind) => el("f", { type: "file", "data-serial": serial, "data-kind": kind });
  // a tap on the box lands on its file input (it covers the row)
  const tap = (serial, kind) => emit(on, "click", { target: Object.assign(fileInput(serial, kind), { closest: () => null }) });
  return { $, on, won, emit, tap, fire, tick, xhr, errors, fileInput, bodyCls };
}
const ready = async (P) => { await P.tick(); await P.tick(); await P.tick(); };

test("inside an Android app's own browser, the page says so first and offers the link for Chrome", async () => {
  for (const ua of [UA.outlookAndroid, UA.messengerAndroid]) {
    const P = boot(ua); await ready(P);
    const top = P.$("appslot").innerHTML;
    assert.match(top, /cannot choose a file/, ua);
    assert.match(top, /Open in Chrome/);
    assert.match(top, /id="copylink"/, "one button copies the link");
  }
  for (const ua of [UA.chromeAndroid, UA.iphoneApp, UA.desktop]) {
    const P = boot(ua); await ready(P);
    assert.equal(P.$("appslot").innerHTML, "", "Chrome, Safari and an iPhone app choose files: no warning (" + ua.slice(0, 40) + ")");
  }
});

test("a tap that opens nothing is said under THAT box; a picker that opened says nothing", async () => {
  const P = boot(UA.desktop); await ready(P);
  P.tap("AC58011021400", "p43");
  P.fire(PICK_MS);
  const main = P.$("main").innerHTML;
  assert.match(main, /Nothing opened\?/);
  assert.equal((main.match(/Nothing opened\?/g) || []).length, 1, "only the box he tapped");
  assert.match(main, /reply to the email with the file/);
  assert.match(main, /Drag the file from your folder onto this box/, "a computer is told it can drop the file");

  const Q = boot(UA.desktop); await ready(Q);
  Q.tap("AC58011021400", "p43");
  Q.emit(Q.won, "blur", {});                       // the file dialog took the focus: it opened
  Q.fire(PICK_MS);
  assert.doesNotMatch(Q.$("main").innerHTML, /Nothing opened\?/);

  const A = boot(UA.chromeAndroid); await ready(A);
  A.tap("AC58011021400", "mgmt");
  A.emit(A.on, "visibilitychange", {});            // Android's picker hides the page
  A.fire(PICK_MS);
  assert.doesNotMatch(A.$("main").innerHTML, /Nothing opened\?/);
  assert.equal(P.errors.length + Q.errors.length + A.errors.length, 0);
});

test("a picker that closed empty (\"cancel\") opened after all: the line under the box goes", async () => {
  const P = boot(UA.chromeAndroid); await ready(P);
  P.tap("AC58011021400", "p43");
  P.fire(PICK_MS);                                 // Chrome's own sheet on Android does not hide the page
  assert.match(P.$("main").innerHTML, /Nothing opened\?/);
  P.emit(P.on, "cancel", { target: P.fileInput("AC58011021400", "p43") });
  assert.doesNotMatch(P.$("main").innerHTML, /Nothing opened\?/);
});

test("on an iPhone the picker is a sheet over the page (no blur), so the page never claims nothing opened", async () => {
  const P = boot(UA.iphoneApp); await ready(P);
  P.tap("AC58011021400", "p43");
  P.fire(PICK_MS);
  assert.doesNotMatch(P.$("main").innerHTML, /Nothing opened\?/);
});

test("a file dropped on a press's box is sent for that press and that document", async () => {
  const P = boot(UA.desktop); await ready(P);
  const input = P.fileInput("AC58011021252", "mgmt");
  const row = { querySelector: (s) => (/type=file/.test(s) ? input : null) };
  const file = { name: "Machine_Management_List.pdf", type: "application/pdf", size: 4 * 1048576 };
  let stopped = false;
  const ev = (type) => ({ type, dataTransfer: { types: ["Files"], files: [file] }, target: { closest: (s) => (s === "label.up" ? row : null) }, preventDefault: () => { stopped = true; } });
  P.emit(P.on, "dragover", ev("dragover"));
  assert.ok(stopped, "the page takes the drop (the browser does not open the PDF instead)");
  P.emit(P.on, "drop", ev("drop"));
  assert.equal(P.xhr.length, 1);
  assert.match(P.xhr[0].url, /\/api\/audit\/u\/upload\?serial=AC58011021252&kind=mgmt&t=tok/);
  assert.equal(P.xhr[0].body, file);
});

test("a file dropped beside the boxes is not sent anywhere, and the page says where to drop it", async () => {
  const P = boot(UA.desktop); await ready(P);
  const file = { name: "x.pdf", type: "application/pdf", size: 100 };
  P.emit(P.on, "drop", { type: "drop", dataTransfer: { types: ["Files"], files: [file] }, target: { closest: () => null }, preventDefault() {} });
  assert.equal(P.xhr.length, 0);
  assert.match(P.$("toast").textContent, /Drop it on the box/);
});

// 6 Nov 2026, the same afternoon: Mark's page was opened seven times from Firefox on a Linux ship computer
// (audit_page_open), and still no file. Miguel: "can u make it drag and drop thise rectangles .. besides clicking".
// The drop worked since #378, but nothing on the page said so. On a computer every empty box now reads
// "Drag here or click", and every box lights up the moment a file is dragged over the page.
test("on a computer each empty box says it takes a dragged file; on a phone it says Choose file", async () => {
  const P = boot(UA.desktop); await ready(P);
  const main = P.$("main").innerHTML;
  assert.equal((main.match(/Drag here or click/g) || []).length, 4, "two presses x two documents");
  assert.doesNotMatch(main, />Choose file</);
  const L = boot(UA.mimecast); await ready(L);
  assert.doesNotMatch(L.$("main").innerHTML, /Drag here/, "Mimecast's viewer takes no dragged file: never offered there");
  assert.equal((L.$("main").innerHTML.match(/Open in Chrome first/g) || []).length, 4, "each box sends them to Chrome first");
  const M = boot(UA.mac); await ready(M);
  assert.equal((M.$("main").innerHTML.match(/Drag here or click/g) || []).length, 4, "a Mac is a computer like any other");
  for (const ua of [UA.chromeAndroid, UA.iphoneApp]) {
    const Q = boot(ua); await ready(Q);
    assert.doesNotMatch(Q.$("main").innerHTML, /Drag here/, "a phone has nothing to drag from");
    assert.match(Q.$("main").innerHTML, /Choose file/);
  }
});

test("a file dragged over the page lights every box; leaving or dropping puts them back", async () => {
  const P = boot(UA.desktop); await ready(P);
  const files = (type) => ({ type, dataTransfer: { types: ["Files"], files: [] }, target: { closest: () => null }, preventDefault() {} });
  P.emit(P.on, "dragenter", files("dragenter"));
  assert.ok(P.bodyCls.has("dragfiles"), "every empty box shows where to drop");
  P.emit(P.on, "dragenter", files("dragenter"));   // into a child: still over the page
  P.emit(P.on, "dragleave", files("dragleave"));
  assert.ok(P.bodyCls.has("dragfiles"), "leaving a child is not leaving the page");
  P.emit(P.on, "dragleave", files("dragleave"));
  assert.ok(!P.bodyCls.has("dragfiles"), "out of the window: back to normal");
  P.emit(P.on, "dragenter", files("dragenter"));
  P.emit(P.on, "drop", files("drop"));
  assert.ok(!P.bodyCls.has("dragfiles"), "a drop puts them back");
  P.emit(P.on, "dragenter", { type: "dragenter", dataTransfer: { types: ["text/plain"] }, target: { closest: () => null }, preventDefault() {} });
  assert.ok(!P.bodyCls.has("dragfiles"), "dragging text is not a file");
});

test("on a computer, a tap that opened nothing says to drag the file first", async () => {
  const P = boot(UA.desktop); await ready(P);
  P.tap("AC58011021400", "p43");
  P.fire(PICK_MS);
  assert.match(P.$("main").innerHTML, /Nothing opened\? Drag the file from your folder onto this box/);
});

// 6 Nov 2026, Miguel's screenshot of Mark's link: "the links open on a sub page under mimecast .. figure it out and ensure
// this comes off". The email's link opened the page in Mimecast Browser Isolation: a browser on Mimecast's side (it calls
// itself Firefox on Linux) drawn in a window that takes no file from the computer, so neither the box nor a drop could work.
// The page says so at the top, gives the address to open in Chrome or Edge, and no box offers a drag that cannot work.
test("inside Mimecast's protected viewer the page says so at the top, with the address to open in Chrome or Edge", async () => {
  const V = boot(UA.mimecast); await ready(V);
  const top = V.$("appslot").innerHTML;
  assert.match(top, /Open this page in Chrome or Edge/);
  assert.match(top, /Mimecast&#8217;s protected viewer/);
  assert.match(top, /takes no file from your computer/);
  assert.match(top, /<span class="addr" id="addr">https:\/\/audit\.cims\.work\/audit\/u\/tok<\/span>/, "the whole address, to select and copy");
  assert.match(top, /id="copylink">Copy the address</);
  assert.match(top, /reply to the email with the files/, "the way out that needs no browser at all");
  // a tap that opens nothing says where to go, not "drag the file"
  V.tap("AC58011021400", "p43"); V.fire(PICK_MS); await V.tick();
  const box = V.$("main").innerHTML;
  assert.match(box, /Mimecast's viewer takes no file from this computer/);
  assert.doesNotMatch(box, /Drag the file from your folder/);
  // the copy fails inside the viewer (no clipboard): it says to select the address on the page
  let toast = "";
  V.$("toast").textContent = "";
  V.emit(V.on, "click", { target: { type: "button", closest: () => ({ id: "copylink", hasAttribute: () => false, getAttribute: () => null }) } });
  await V.tick(); toast = V.$("toast").textContent;
  assert.match(toast, /Select the address below/);
  // nowhere else: Windows, a Mac, a Chromebook, Android, an iPhone
  for (const ua of [UA.desktop, UA.mac, UA.chromebook, UA.chromeAndroid, UA.iphoneApp]) {
    const Q = boot(ua); await ready(Q);
    assert.doesNotMatch(Q.$("appslot").innerHTML, /protected viewer/, "no viewer note on " + ua.slice(13, 40));
  }
});

test("once everything is in, the viewer note goes: nothing is left to send", async () => {
  const keep = STATE.status; STATE.status = "complete";
  try { const V = boot(UA.mimecast); await ready(V); assert.equal(V.$("appslot").innerHTML, ""); }
  finally { STATE.status = keep; }
});
