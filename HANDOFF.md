# Investment Club Trade Journal — Handoff & Setup Guide

Everything you need to understand, run, and take ownership of the club's trade journal. Written so a reasonably technical person can pick it up cold.

---

## 1. What it is (the 30-second version)

A web app for the investment club. Members submit a structured trade idea, the submissions land in a shared Google Sheet, a committee dashboard lets you review and stamp each one (Approve / Watch / Pass), and an AI (Claude) reads the whole batch and writes a synthesis of the club's thinking. Every synthesis is auto-saved to the sheet as a running archive.

No servers, no database. Three moving parts: a **static website** (the pages), a **Google Sheet + Apps Script** (the storage and the AI call), and an **Anthropic API key** (powers the AI).

---

## 2. How it works (the data flow)

```
  MEMBER'S BROWSER                 GOOGLE (Apps Script + Sheet)          ANTHROPIC
  ─────────────────                ────────────────────────────         ─────────
  Submit form  ───────────────▶    doGet(action=submit) ──▶ Sheet "Submissions" tab
  Review desk  ◀───────────────    doGet() returns all rows  ◀── reads sheet
  Decision     ───────────────▶    doGet(action=decision) ─▶ updates row
  Auto-fill    ───────────────▶    doGet(action=lookup) ─────────────▶ Finnhub API
                                                                    (key stored in Google)
  Synthesize   ───────────────▶    doGet(action=synthesize) ─────────▶ Claude API
                                        │                          (key stored in Google)
                                        └─▶ Sheet "Synthesis Log" tab   ◀── returns summary
```

**Why it's built this way (important for anyone maintaining it):**

- All browser↔Google calls use **JSONP** (a `<script>` tag), not `fetch()`. This is deliberate. A normal `no-cors` POST to an Apps Script endpoint **silently fails** — Apps Script answers with a redirect the browser won't carry a POST through, so the write vanishes with no error. JSONP (a GET request that follows redirects) is the reliable path. Writes pack their data into the URL; reads and the AI call come back the same way.
- The **API keys never touch the browser or the code repo.** Both the AI call *and* the ticker auto-fill happen *server-side* inside Apps Script, which reads the keys from private settings. That's why they run on Google's side instead of in the page.
- **Auto-fill** lets a member type a ticker and pull the objective fundamentals (price, P/E, beta, EPS, dividend, 52-week range, market cap, sector) automatically. The thesis and discussion fields are deliberately left blank — facts are automated, thinking stays personal.

---

## 3. Where everything lives (current setup)

| Piece | What it is | Where |
|---|---|---|
| **Live website** | The app members use | Netlify — `lakewood-investment-club.netlify.app` |
| **Source code** | The files | GitHub repo `bdgroves/investment-club` |
| **Local copy** | Working folder on the builder's PC | `…/Documents/ic-clean` |
| **Data + backend** | Submissions, decisions, AI call | A Google Sheet with an Apps Script attached |
| **AI key** | Powers the synthesis | Anthropic API key, stored in the Apps Script settings |

The website, the sheet, and the API key are **independent**. You can move the website anywhere (Netlify, GitHub Pages, any static host) without touching the backend, and vice versa.

---

## 4. The files (in the repo)

| File | What it does |
|---|---|
| `index.html` | The member submission form |
| `review.html` | The committee dashboard (passphrase-gated) — review, decide, synthesize, download reports |
| `app.js` | Front-end logic + the one setting that points the site at the backend (`SHEET_URL`) |
| `Code.gs` | The Apps Script backend. **This is not deployed from the repo** — its live copy lives inside Google (see setup). The repo copy is the reference. |
| `style.css` | Shared styling |
| `seed.html` / `seed-macro.html` | Admin tools that load example trades. Not linked from the member site — run them yourself when you want demo data. |
| `README.md`, `PROJECT.md`, `TODO.md`, `HANDOFF.md` | Docs |

---

## 5. What you need to take full ownership

To run this entirely on the club's own accounts, you'll create four things (all free except the AI, which is pay-as-you-go pennies):

1. A **Google account** (for the Sheet + Apps Script)
2. An **Anthropic account + API key** (for the AI synthesis)
2b. A **Finnhub account + API key** (free — for ticker auto-fill)
3. A **Netlify account** (free — to host the website), *or* keep hosting wherever you like
4. Optionally a **GitHub account** (to hold the code / make edits)

Then follow Section 6.

---

## 6. Setup from scratch (full handoff)

### A. The Google Sheet + backend (~10 min)

1. Create a new Google Sheet. Name it something like *Investment Club — Trade Journal*. Don't add any columns; the script builds them.
2. In the sheet: **Extensions → Apps Script**.
3. Delete the default code, paste in the entire contents of `Code.gs` from the repo, and **Save** (💾).
4. **Deploy → New deployment** → gear icon → **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy**, authorize when prompted (you'll see a "Google hasn't verified this app" warning — that's normal for your own script; Advanced → Go to project → Allow). The synthesis step also needs the "connect to an external service" permission — allow it.
6. Copy the **Web app URL** (ends in `/exec`). You'll need it in step D.

The script auto-creates a **`Submissions`** tab (where trades land) and a **`Synthesis Log`** tab (where AI reports archive) on first use.

> **The one rule that will save you hours:** after any change to `Code.gs`, redeploy via **Deploy → Manage deployments → ✏️ (edit the existing one) → Version: New version → Deploy**. This keeps the same URL. **Never** click "New deployment" for an update — it mints a *new* URL and breaks the site's link to the backend.

### B. The Claude (Anthropic) API key (~5 min) — this powers the AI

1. Go to the **Anthropic Console** at `console.anthropic.com` and create an account (or sign in).
2. Add billing / buy credits. The API is **pay-as-you-go** — there's no subscription; you pre-load credits and spend against them. (This is separate from any Claude.ai chat subscription; a Pro plan does **not** include API access.)
3. Create an **API key** (it starts with `sk-ant-…`). Copy it — you only see it once.
4. Put the key into the backend, **not the code**:
   - Open the Apps Script editor (from your sheet: Extensions → Apps Script)
   - Click **⚙️ Project Settings** (left sidebar)
   - Under **Script Properties**, click **Add script property**
   - Property name: `ANTHROPIC_API_KEY`  ·  Value: your `sk-ant-…` key  ·  **Save**
5. Redeploy a **New version** (Section A rule) so the running app picks up the key.

**Why here?** Storing it as a Script Property keeps it server-side in Google — it never appears in the website, the repo, or anyone's browser. To rotate the key later, just replace that property's value and redeploy a new version.

**Which model / cost:** the code calls `claude-sonnet-5` (set by the `SYNTH_MODEL` constant near the top of `Code.gs`). As of 2026 that's roughly **$2 per million input tokens / $10 per million output tokens** — a single synthesis of a handful of trades runs a few cents. A club doing a few syntheses a week spends on the order of a dollar or two a *month*. To spend even less, change `SYNTH_MODEL` to `claude-haiku-4-5-20251001` (cheaper, still sharp). Always check current rates at Anthropic's pricing page, since they change.

### B2. The Finnhub API key (~3 min) — this powers ticker auto-fill

1. Go to `finnhub.io` and create a free account. The free tier (60 calls/min) is plenty for a club.
2. Copy your **API key** from the dashboard.
3. In the Apps Script editor: **⚙️ Project Settings → Script Properties → Add script property**
   - Name: `FINNHUB_API_KEY`  ·  Value: your key  ·  **Save**
4. Redeploy a **New version** (Section A rule).

If this key is missing, auto-fill simply tells the member "you can fill the numbers by hand" and nothing breaks.

### C. Host the website (~2 min)

Easiest is Netlify's free tier:

1. Sign in at `app.netlify.com` → **Add new site → Deploy manually**.
2. Drag the project folder (the one containing `index.html`) onto the drop zone. Make sure `index.html` sits at the **top level** of what you drop.
3. It gives you a URL like `something.netlify.app`. Rename it in the site settings to something clean.

(You can also host these static files on GitHub Pages, Cloudflare Pages, or any static host — the app doesn't care.)

### D. Point the website at your backend (1 line)

1. Open `app.js`. Near the top, set `SHEET_URL` to **your** `/exec` URL from step A6:
   ```js
   const SHEET_URL = 'https://script.google.com/macros/s/…/exec';
   ```
2. If you use the `seed-macro.html` demo loader, update the `SHEET_URL` near the top of that file too.
3. Re-deploy the site (re-drag to Netlify, or push if you've connected a repo).

### E. Set the review passphrase

Open `review.html`, find `const PASS = 'clubhouse'`, and change `'clubhouse'` to whatever the committee picks. Re-deploy.

---

## 7. Running it day to day

- **Members** open the site, fill out the form, submit. Their trade appears in the sheet and on the review desk.
- **The committee** opens `review.html`, enters the passphrase, and reviews. Each card gets **Approve / Watch / Pass** plus a notes box. Hit **↻ Refresh** to pull the latest.
- **Synthesis:** click **Synthesize**. After a few seconds you get a committee-style briefing. Use **⭳ Download report** for a clean formatted copy, or **⧉ Copy** for the raw text. Every run also auto-saves to the **Synthesis Log** tab.
- **Starting a fresh cycle:** delete the old rows in the `Submissions` tab (keep the header). The `Synthesis Log` is your history — leave it alone.

---

## 8. Costs

| Item | Cost |
|---|---|
| Website hosting (Netlify free tier) | $0 |
| Google Sheet + Apps Script | $0 |
| Anthropic API (the AI) | Pay-as-you-go; ~a few cents per synthesis, roughly $1–2/month for typical club use |

No monthly minimums, no servers. The only metered cost is the AI, and it's tiny at this scale.

---

## 9. Maintenance rules & gotchas (learned the hard way)

- **"New version," never "new deployment."** Editing `Code.gs`? Redeploy by editing the existing deployment and choosing *New version*. Making a new deployment changes the URL and silently breaks the site.
- **Data lives in the `Submissions` tab**, not `Sheet1`. If the sheet "looks empty," check the tabs at the bottom.
- **Both keys live in Script Properties**, never in the code: `ANTHROPIC_API_KEY` (synthesis) and `FINNHUB_API_KEY` (auto-fill). If a feature says it's "not set up," the property name is wrong or you didn't redeploy after adding it.
- **Writes use JSONP GET on purpose.** If you ever refactor to `fetch()` POST, expect writes to vanish silently — Apps Script's redirect eats them. Keep the JSONP pattern.
- **Static hosting caches hard.** If a change doesn't show up live, it's usually a stale cache, not a broken deploy — confirm the committed file is correct first (e.g. view it on GitHub), then bust the cache. (Netlify is far less prone to this than GitHub Pages, which is why the app lives on Netlify.)
- **The seed loaders write real rows.** `seed.html` / `seed-macro.html` push example trades into the live sheet. Handy for demos; just delete the rows afterward, and don't link them from the member-facing site.

---

## 10. Transfer checklist

Handing this to the club? Two levels:

**Light transfer (club owns the data + AI, builder keeps hosting):**
- [ ] Transfer ownership of the Google Sheet to the club's account
- [ ] Club creates its own Anthropic API key and swaps it into Script Properties → redeploy new version

**Full transfer (club owns everything):**
- [ ] Club forks/copies the repo under its own GitHub
- [ ] Club creates its own Google Sheet + Apps Script (Section 6A)
- [ ] Club creates its own Anthropic API key (Section 6B) and Finnhub API key (Section 6B2)
- [ ] Club hosts the site (Section 6C) and sets its own `SHEET_URL` (6D)
- [ ] Club sets its own passphrase (6E)
- [ ] Confirm the loop end-to-end: submit a test trade → it lands in the sheet → shows on the review desk → synthesis returns and logs

Once the last box is checked, the builder can walk away and nothing breaks. That's the whole point.
