# Investment Club Trade Journal — Project Reference

One-page reference for the trade journal built for Bob Zawilski's Lakewood investment club (~20 members).

## Status: LIVE (backend working), pre-launch polish

- **Live at:** https://brooksgroves.com/investment-club/
- **Review desk:** https://brooksgroves.com/investment-club/review.html — passphrase `clubhouse`
- **Backend:** Google Sheet + Apps Script web app — shared reads/writes confirmed working
- **Target:** ready for a club meeting (no fixed date; polish first)

## What it does

Replaces the club's current workflow — a member fills a Word "Trade Journal" template and emails it to all members before the meeting — with a shared web app: one member submits a structured trade case, it lands in a Google Sheet, and the whole committee reviews it on a dashboard (Approve / Watch / Pass + notes). Matches Bob's paper template field-for-field, including the "captures the investment opportunity and nature of the company" thesis wording.

## Architecture

```
Member browser ──(POST, no-cors)──▶ Apps Script web app ──▶ Google Sheet "Submissions" tab
Review desk    ──(GET, JSONP)─────▶ Apps Script web app ──▶ reads all rows back
Committee decision (Approve/Watch/Pass + notes) ──(POST)──▶ writes status/notes to the row
```

- **Front end:** static HTML/CSS/JS, served from the `investment-club/` folder of the `bdgroves.github.io` repo.
- **Backend:** Google Apps Script bound to the sheet. Writes use `no-cors` POST (`text/plain`, no preflight); reads use JSONP (`?callback=`) to get around browser cross-origin rules. The front end only needs the `/exec` URL — no sheet ID.
- **Sheet:** script auto-creates a `Submissions` tab with 29 columns on first write.

## Files (in `investment-club/`)

| File | Purpose |
|------|---------|
| `index.html` | Member submission form |
| `review.html` | Committee review dashboard (passphrase-gated) |
| `seed.html` | One-time loader for starter trades |
| `style.css` | Shared styles (slate + amber theme) |
| `app.js` | Storage layer — `SHEET_URL` at top switches local vs shared mode |
| `Code.gs` | The Apps Script backend (reference copy; the live copy lives in Google) |

## Known gaps / gotchas

- **AI Synthesis is not live in production.** The button calls the Anthropic API directly from the browser with no key — works in previews only. Production fix: route the call through Apps Script with the club's API key stored in Script Properties (see TODO). Until then, treat synthesis as disabled.
- **Public endpoint.** The Apps Script is deployed "Anyone," so the `/exec` URL is effectively public. Fine for a club trade journal; the passphrase still gates the human-facing review desk.
- **Two copies of `Code.gs`.** The one that matters is deployed inside Google Apps Script. The repo copy is reference only — editing it does nothing until pasted into Apps Script AND redeployed as a **New version**.
- **Redeploy = new version.** After editing `Code.gs`, Deploy → Manage deployments → edit → Version: New version. Editing the existing deployment keeps the same `/exec` URL.
- **Hosting lesson (resolved):** the old standalone `bdgroves/investment-club` repo had grabbed `brooksgroves.com` as a custom domain, which hijacked the path. Cleared it; domain lives only on `bdgroves.github.io` now. Don't set a custom domain on the standalone repo.

## Handoff to the club (when ready)

1. Fork/duplicate under the club's GitHub, or keep hosting here "for now."
2. Club creates its own Google Sheet + Apps Script (paste `Code.gs`, deploy).
3. Club adds its own Anthropic API key (for synthesis, once that's server-side).
4. Change the passphrase in `review.html` (`const PASS`).
