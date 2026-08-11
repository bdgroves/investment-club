# Investment Club Trade Journal — TODO

Target: ready for a club meeting. No fixed date — polish first.

## ✅ Done

- [x] Form matches Bob's paper template field-for-field (incl. "…and nature of the company")
- [x] Price + fundamentals blocks (share value, entry/exit, 52-wk, sector, cap, beta, P/E, EPS, dividend…)
- [x] Review desk: fundamentals grid, thesis pull-out, pros/cons, Approve/Watch/Pass + notes, filters, stats
- [x] "Committee" language throughout (not "chairman")
- [x] Google Sheets backend live — shared reads (JSONP) + writes (POST) confirmed
- [x] Hosted at brooksgroves.com/investment-club
- [x] Three starter trades drafted (AMD / VRT / SPCX) from the July 8 discussion

## 🔨 Polish (before launch)

**P1 — blockers for a real launch**
- [ ] **Fix AI Synthesis for production.** Route the Claude call through Apps Script (API key in Script Properties), return via JSONP. Currently calls the API from the browser with no key → fails on the live site.
- [ ] **Seed the 3 starter trades into the shared sheet** so the review desk isn't empty when the club logs in (wire `seed.html` to POST, or just enter via the form).
- [ ] **Set the committee's real passphrase** (replace `clubhouse` in `review.html`).

**P2 — makes it feel finished**
- [ ] Fundamentals pass: fill current P/E, beta, market cap for AMD / VRT / SPCX
- [ ] Mobile polish pass (form + review desk on a phone)
- [ ] First-run empty-state / one-line "how this works" for members
- [ ] Update README + any docs still pointing at `bdgroves.github.io` → `brooksgroves.com`
- [ ] One-page "How to use" for the club (adapt the existing project brief)

**P3 — nice to have**
- [ ] Auto-refresh prices via an Apps Script time trigger (the "do we need Actions?" answer — do it Google-side, not GitHub Actions)
- [ ] Decide + document: custom form vs. Google Form for member intake
- [ ] Retire or repurpose the standalone `bdgroves/investment-club` repo (Bob's fork target)

## 🚀 Launch

- [ ] Seed a couple of real trades so it's not empty
- [ ] Share URL + passphrase with the club
- [ ] Brief Bob on the review desk (submit → review → decide → synthesize)
- [ ] Collect feedback after the first meeting; fold into a v2 list

## 💤 Parked / someday

- [ ] Per-trade AI "second opinion" button
- [ ] Track record over time (which theses aged well)
- [ ] Voting/scoring so the whole committee weighs in, not just notes
- [ ] Email/text digest to members before each meeting
