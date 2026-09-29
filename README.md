# Investment Club — Trade Journal

A lightweight trade submission and review system for investment clubs.

**Members** submit their trade homework → the **committee** reviews on the dashboard → **Claude** synthesizes patterns across submissions.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Member submission form (public) |
| `review.html` | Committee review dashboard (passphrase-gated) |
| `seed.html` | One-time loader for starter trades |
| `style.css` | Shared styles |
| `app.js` | Shared logic + storage layer |
| `Code.gs` | Google Apps Script backend (optional, for shared persistence) |

---

## What the form captures

Members fill out a structured trade case, matching the committee's paper form:

- **Identification** — stock/company, symbol, exchange, date, submitting member
- **Price levels** — share value today, entry target, exit, 1-year high/low
- **Company fundamentals** — sector, market cap, growth/income, beta, P/E, price/rev per share, EPS, dividend + frequency
- **Thesis** — core thesis (2–3 sentences), competitive moat, why now
- **Pros & cons** — the bull and bear case
- **Trade management** — how the member will handle every outcome

On the review desk each submission becomes a card with the fundamentals laid out in a grid, the thesis pulled out, pros in green / cons in red, and a decision bar (Approve / Watch / Pass) plus committee notes.

---

## Prototype Setup (GitHub Pages, no backend)

1. Files live in the repo root
2. **Settings → Pages → Source: main branch → / (root)**
3. Live at `https://bdgroves.github.io/investment-club/`

In prototype mode, trades persist in `localStorage` — per browser, survive refreshes, reset if the browser is cleared. Good enough to demo.

**Review desk passphrase:** `clubhouse`

**Load starter trades:** open `/seed.html` once and click "Load Starter Trades" to populate three example submissions (AMD, VRT, SPCX).

---

## Production Setup (with Google Sheets backend)

### Step 1 — Create the Sheet
Create a Google Sheet named `Investment Club — Trade Journal`.

### Step 2 — Deploy the Apps Script
1. In the Sheet: **Extensions → Apps Script**
2. Paste in the contents of `Code.gs`
3. **Deploy → New deployment** → Type: **Web app** → Execute as: **Me** → Who has access: **Anyone**
4. Authorize, then copy the **Web App URL**

The script auto-creates a `Submissions` sheet with 29 columns (all form fields + status + notes) on first run.

### Step 3 — Wire it up
In `app.js`:
```js
const SHEET_URL = 'https://script.google.com/macros/s/YOUR_ID_HERE/exec';
```
Commit and push. Submissions write to the Sheet; committee decisions write back.

---

## ⚠️ Don't revoke the backend's Google access

The Apps Script runs as **Execute as: Me**. Every auto-fill, Review Desk load, synthesis and digest runs under the permission the owner granted it. That permission lives in the owner's Google account under **Security → Third-party apps & services**, listed by the Apps Script project's name.

**If that access is removed, the whole site stops working for everyone.** The pages still load from Netlify, but every call to the backend is refused. Nothing is lost: the data stays in the Sheet.

**Symptoms:** the site loads, but **Auto-fill** fails ("Could not reach the lookup service") and the **Review Desk** shows no submissions, even though the Sheet has them.

**Fix:** open the Apps Script editor, run any function (e.g. `doGet`), and approve the Google permission prompt. The site recovers immediately. No redeploy and no code change needed.

**Prevention:** give the Apps Script project a clear name (click the title in the editor, e.g. **"LIC Trade Journal backend"**) so it isn't mistaken for a stray app during an account cleanup. An "Untitled project" in that list looks exactly like something safe to delete.

Same symptoms, different cause: if the permission is fine, check that the web app deployment `app.js` points at is still **Active** (Apps Script → Deploy → Manage deployments). An archived deployment breaks the site the same way.

---

## AI Synthesis

The **Synthesize Submissions** button on the review desk sends all submissions (including the fundamentals) to Claude and returns a summary: themes the club is converging on, the strongest theses, shared risks, contrarian outliers, and which trades deserve the most committee time.

Prototype runs on the demo API key. When the club takes ownership, it uses its own Anthropic API key.

---

## Handoff to the club

1. Fork/duplicate the repo under the club's GitHub account
2. Set up its own Google Sheet + Apps Script (5 min)
3. Add its own Anthropic API key
4. Change the passphrase in `review.html` (search `const PASS`)

Everything else just works.
