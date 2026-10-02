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
| `Code.gs` | Google Apps Script backend: submissions, decisions, auto-fill, synthesis, digest |
| `MeetingDocs.gs` | Apps Script: one Google Doc per meeting, each submission appended |
| `Brief.gs` | Apps Script: the two club emails: Friday ideas-for-review, and the meeting-day brief (comments + AI discussion points) |
| `guide.html` | Plain-English guide to every form field |
| `How-to-*.pdf` | Member how-to PDFs (submitting, commenting), linked on the home page |

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

## Hosting

Live on **Netlify**, linked to this repo: every push to `main` publishes automatically (no build step; `_headers` / `netlify.toml` turn off caching).

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

## The monthly meeting cycle

The club meets on the **2nd Wednesday** of each month. Around that meeting the app runs a loop so members arrive having already read and discussed the ideas, and the meeting is spent on the good stuff.

| When | What happens | Code |
|---|---|---|
| Any time | Member submits a Trade Journal on the website (autosaved as a draft on their device until they press Submit) | `index.html` → `Code.gs` |
| Instantly | The journal is copied into **that meeting's Google Doc** ("LIC Meeting — November 2026") | `MeetingDocs.gs` |
| **Friday before, ~8am** | **Ideas-for-review email** to the Members tab: list of ideas, link to the doc, doc attached as PDF | `Brief.gs` |
| Fri → Tue night | Members read the doc and leave **comments**; everyone sees them live | (Google Docs) |
| **Meeting day, ~7am** | **Meeting-day brief**: every comment, grouped by stock, plus Claude's neutral summary of suggested discussion points (HTML email + PDF) | `Brief.gs` |
| Meeting | Discussion under Robert's Rules, prioritized by the President, Treasurer and Secretary if time is short; decisions recorded on the **Review Desk** | `review.html` |
| After | AI synthesis → follow-up report *(not built yet)* | — |

### Meeting Docs (`MeetingDocs.gs`)
- A submission goes into the doc for the **next** meeting (on meeting day it rolls to the following month).
- Docs are created automatically in the Drive folder **LIC Meeting Docs**, shared as *anyone with the link can comment* (commenting needs a Google account). Written in Roboto.
- The **Meeting Docs** tab in the Sheet lists every doc. The home page shows a card linking the upcoming one (`?action=meetingdoc`).
- If Docs ever fails, the submission is still saved to the Sheet (the doc step only logs the error).
- A trashed doc is ignored and a fresh one is made.
- `copyRecentSubmissionsToDoc()` (run by hand) copies everything since the last meeting into the doc; safe to re-run, it skips journals already there.

### Club emails (`Brief.gs`), following Bob's "Trade Journal Club Flow"
- `fridayIdeasCheck` runs every Friday ~8am; sends only when the meeting is the coming Wednesday. No AI: it lists each idea (stock, member, one line of thesis), links the doc, attaches the doc as a PDF, and asks for comments by the evening before.
- `meetingDayCheck` runs every Wednesday ~7am; sends only on the 2nd Wednesday. It reads every comment through the Drive API (the script's own sign-in, no Advanced Service), lists them **verbatim, grouped by stock** (matched by where the commented words sit in the doc), then adds Claude's discussion points.
- Claude prompt is facilitator-only: never ranks or recommends, credits members by name, uses only the journals' numbers, ends with a possible running order and notes the President, Treasurer and Secretary set final priorities.
- Both go **To:** the script owner, **Bcc:** everyone in the Members tab whose "Gets Club Emails" isn't `N`. The meeting-day PDF is saved to the LIC Meeting Docs folder and its text logged in **Synthesis Log**.
- Comments only: Google's comment API doesn't include *suggested edits*, so members should use comments for anything they want in the brief.

### Drafts (`index.html`)
- The form autosaves to the browser (`localStorage`, key `ic_draft_v1`) as the member types, after Auto-fill, and when the page closes. Coming back on the same device restores it with a "Welcome back" banner and a **Start over** button. **Save draft** saves on demand. The draft is cleared on Submit.
- Drafts are per device and browser (not shared between a computer and an iPad), and private browsing may not keep them.

### Member guides (linked on the home page)
- `How-to-Submit-a-Trade-Journal.pdf`: 9 steps with screenshots
- `How-to-Comment-in-the-Meeting-Doc.pdf`: commenting on a computer, iPad or phone
- `guide.html`: what each form field means

### One-time setup in Apps Script
The project must contain **Code.gs, MeetingDocs.gs and Brief.gs** (paste each from this repo, Ctrl+S).
1. Run `setupMeetingDocs` → approve the Docs/Drive prompt. Creates the Members and Meeting Docs tabs, the Drive folder, and the next meeting's doc.
2. **Deploy → Manage deployments → ✏️ → New version → Deploy** (the website needs this for the meeting-doc link and auto-copy).
3. Run `previewIdeasEmail` and `previewMeetingBrief` → approve the prompt → each arrives in **your** inbox only.
4. Run `installClubEmails` → both sends are on. (`removeClubEmails` turns them off; `sendIdeasEmailNow` / `sendMeetingBriefNow` send to everyone immediately. The old names `installFridayBrief`, `previewTalkingPoints`, `sendTalkingPointsNow` still work.)

Brief.gs runs on a timer, so changes to it don't need a redeploy. Changes to Code.gs or MeetingDocs.gs do.

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
