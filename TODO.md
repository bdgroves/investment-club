# Investment Club Trade Journal — TODO / State

Live at: https://lakewood-investment-club.netlify.app (Netlify) · Review passphrase: `clubhouse`
Last updated: Aug 20, 2026

## ✅ Done & live
- [x] Submission form matching the club's paper template
- [x] Shared Google Sheets backend — writes (JSONP GET) + reads (JSONP)
- [x] Review desk: fundamentals grid, thesis pull-out, pros/cons, Approve/Watch/Pass + notes, filters, stats
- [x] AI synthesis, SERVER-SIDE (Apps Script → Claude; key in Script Properties)
- [x] Synthesis auto-archives to the "Synthesis Log" tab
- [x] Download synthesis as a formatted report + copy button
- [x] **Ticker auto-fill** — type a symbol, click Auto-fill, objective fundamentals populate (Finnhub, server-side key); thesis/discussion stay manual
- [x] Hosted on Netlify; blog post published at brooksgroves.com/blog/investment-club-blog.html
- [x] Club is actively using it (real submissions coming in)

## 🔨 Next up
- [ ] **AI facilitator mode** — shift the synthesis prompt from "grading" submissions to "presenting them with discussion notes" (Bob's request). Prompt change in Code.gs.
- [ ] **Email submissions pre-meeting** — Apps Script compiles pending submissions into a digest + emails the member list a few days out (Bob's distribution question)
- [ ] Set the committee's real passphrase (replace `clubhouse` in review.html)
- [ ] Archive the leftover Apps Script deployment down to a single LIVE (hygiene)

## 🗓️ Design with the group (Zoom)
- [ ] **"Find the funds"** — every buy is paired with a funding decision (annual inflows). New workflow; design live with the club.
- [ ] **Track executed/held positions over time** — portfolio/watchlist layer once trades get decided
- [ ] Capture spontaneous ideas raised during meetings

## 💤 Polish / someday
- [ ] Mobile pass + first-run onboarding copy
- [ ] Connect Netlify to the GitHub repo for auto-deploy on push (no more folder drag)
- [ ] Per-trade AI "second opinion"; committee voting/scoring

## 🔑 Key facts (don't lose these)
- **Live Apps Script deployment URL:** ends in `/AKfycbxSCx…` (V9). This is what `app.js` and the site use.
- **Only ever update the LIVE deployment via New *version*** (Deploy → Manage deployments → ✏️ → Version: New version). Never "New deployment" — it mints a new URL and breaks the link.
- **Two server-side keys, both in Apps Script → Project Settings → Script Properties:**
  - `ANTHROPIC_API_KEY` — powers AI synthesis
  - `FINNHUB_API_KEY` — powers ticker auto-fill
- Submissions land in the **`Submissions`** tab; AI reports archive in **`Synthesis Log`**.
- Repo: `github.com/bdgroves/investment-club` · Local: `…/Documents/ic-clean` · Deploy: drag folder to Netlify.
- `seed.html` / `seed-macro.html` are admin-only demo loaders — not linked from the member site.
