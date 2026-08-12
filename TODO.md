# Investment Club Trade Journal — TODO

Live at: https://lakewood-investment-club.netlify.app (hosted on Netlify)

## ✅ Done
- [x] Submission form matching the club's paper template (incl. "…and nature of the company")
- [x] Review desk: fundamentals grid, thesis pull-out, pros/cons, Approve/Watch/Pass + notes, filters, stats
- [x] Google Sheets backend — shared reads (JSONP) + writes (JSONP GET)
- [x] AI synthesis running SERVER-SIDE (Apps Script calls Claude; API key in Script Properties)
- [x] Six-name seed loaded (AMD, VRT, SPCX + GLD, PDBA, XLU) with full fundamentals
- [x] Hosted on Netlify (moved off GitHub Pages after path/Jekyll/cache fights)

## 🔨 Polish (before wider club use)
- [ ] Set the committee's real passphrase (replace `clubhouse` in review.html)
- [ ] Raise synthesis max_tokens in Code.gs (1500 → ~2500) so long summaries don't cut off
- [ ] Fill PDBA and XLU price/valuation fields (left blank — ETFs)
- [ ] Mobile polish pass
- [ ] First-run empty state / member onboarding copy
- [ ] One-page "how to use" for the club

## 🚀 Deploy / ops
- [ ] Connect Netlify to the GitHub repo so `git push` auto-deploys (no more folder drag)
- [ ] Keep seed-macro.html as a local/admin tool — not linked from the member-facing site

## 💤 Someday
- [ ] Auto-refresh prices via an Apps Script time trigger
- [ ] Per-trade AI "second opinion"
- [ ] Voting/scoring across the committee
- [ ] Pre-meeting email digest

## Key facts (don't lose these)
- LIVE Apps Script deployment ends in `/AKfycbzZVp5J...` — only ever edit THAT one
  (Apps Script → Deploy → Manage deployments → ✏️ → Version: New version). Never "New deployment".
- Sheet: the script writes to the `Submissions` tab (auto-created).
- Review passphrase: `clubhouse` (change before real use).
- Host: Netlify (drag the folder to deploy, or connect the repo).
