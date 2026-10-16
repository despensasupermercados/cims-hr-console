// THE SUITE WITH THE CLOCK PUSHED AHEAD — a dated fixture is a time bomb (HON's lesson of 6 Oct 2026, paid for here on
// 16 Oct 2026: sbm.test.js S4 hard-coded "06:00Z = 08:00 Budapest" and would have gone red on main on 25 Oct, when CET
// returns; three earmark / import tests had a "future" sign-on that passes on 29 Nov 2026, 10 Jan and 1 Feb 2027; the board
// test's TODAY tick leaves its timeline on 1 Dec 2027). A red main deploys nothing, so run this before the dates do:
//
//   SHIFT_DAYS=30 node --import ./scripts/clock_shift.mjs --test
//   SHIFT_DAYS=120 node --import ./scripts/clock_shift.mjs --test
//   SHIFT_DAYS=400 node --import ./scripts/clock_shift.mjs --test
//
// A page test that runs the inline script in a vm sees the vm realm's own Date unless the harness hands it the host's
// (test/board_cards.test.js does): a shifted run cannot reach a vm that was not given `Date`.
// Fix a failure by pinning THAT test's clock (`mock.timers.enable({ apis: ["Date"], now })`) or deriving the fixture from
// today — never by moving the date in the fixture one more year.
const days = +(process.env.SHIFT_DAYS || 0), ms = days * 864e5;
const RealDate = Date;
class ShiftedDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + ms); else super(...a); }
  static now() { return RealDate.now() + ms; }
}
Object.setPrototypeOf(ShiftedDate, RealDate);
globalThis.Date = ShiftedDate;
