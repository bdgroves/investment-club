# Investment Club — Trade Journal

A lightweight trade submission and review system for investment clubs.

**Members** submit their trade homework → **Bob reviews** on the dashboard → **Claude synthesizes** patterns across submissions.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Member submission form (public) |
| `review.html` | Bob's review dashboard (password-gated) |
| `style.css` | Shared styles |
| `app.js` | Shared logic + storage layer |
| `Code.gs` | Google Apps Script backend (optional, for persistence) |

---

## Prototype Setup (GitHub Pages, no backend)

1. Create a new GitHub repo named `investment-club`
2. Drop all files in — `index.html`, `review.html`, `style.css`, `app.js`
3. Go to **Settings → Pages → Source: main branch → / (root)**
4. Site is live at `https://bdgroves.github.io/investment-club/`

In prototype mode, trades persist in `localStorage` — they survive page refreshes but reset if the browser is cleared. Good enough to show Bob.

**Review desk password:** `clubhouse`

---

## Production Setup (with Google Sheets backend)

### Step 1 — Create the Sheet

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it `Investment Club — Trade Journal`

### Step 2 — Deploy the Apps Script

1. In the Sheet: **Extensions → Apps Script**
2. Delete the default `Code.gs` content and paste in the contents of `Code.gs` from this repo
3. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize the permissions when prompted
5. Copy the **Web App URL**

### Step 3 — Wire it up

Open `app.js` and paste your URL:

```js
const SHEET_URL = 'https://script.google.com/macros/s/YOUR_ID_HERE/exec';
```

Commit and push. Submissions now write directly to your Google Sheet, and Bob's decisions (Approve / Watch / Pass + notes) write back as columns.

---

## AI Synthesis

The **Synthesize Submissions** button on the Review Desk sends all submissions to Claude and returns a summary covering:

- Themes and sectors the club is converging on
- The strongest theses and why
- Shared risks across submissions
- Contrarian outliers worth discussing
- Which trades deserve the most committee time

This uses the Anthropic API directly from the browser. The prototype runs on the demo account's API key. When Bob is ready to take ownership, he gets his own [Anthropic API key](https://console.anthropic.com) and it slots right in.

---

## Handoff to Bob

When Bob is ready to run this himself:

1. Bob forks or duplicates the repo under his own GitHub account
2. He sets up his own Google Sheet + Apps Script (5 minutes with these instructions)
3. He gets an Anthropic API key and drops it in — or uses whatever AI service he prefers
4. He changes the review password in `review.html` (search for `const PASS`)

Everything else just works.
