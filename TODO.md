# Investment Club Trade Journal — TODO / State

Live at: https://lakewood-investment-club.netlify.app (Netlify, auto-deploys from GitHub `main`) · Review passphrase: `clubhouse`
Last updated: Oct 1, 2026

## The monthly cycle (agreed with Bob and members, Oct 1 2026)

Club meets the **2nd Wednesday** of each month.

1. Members submit Trade Journals on the website (how-to PDF on the home page).
2. Each submission is copied into **that meeting's Google Doc** ("LIC Meeting — October 2026"), shared so anyone with the link can comment.
3. Members read and comment in the doc (how-to-comment PDF on the home page). Comments due Thursday evening.
4. **Friday before the meeting, ~8am:** Claude reads the doc + all comments → neutral talking-points brief, emailed (HTML + PDF) to the **Members** tab.
5. Meeting runs under Robert's Rules; Secretary / Bob / Chuck record Approve / Watch / Pass on the Review Desk.
6. AI synthesis afterwards → follow-up report (email/PDF). **Not built yet.**

## ✅ Done & live
- [x] Submission form matching the club's paper template; Auto-fill (Finnhub), "Help me get started" questions, "how did this land on your radar"
- [x] Google Sheet backend (JSONP reads + writes); Review Desk with Approve/Watch/Pass + notes
- [x] AI synthesis in facilitator mode (never grades or recommends); archives to **Synthesis Log**
- [x] Pre-meeting digest email button (DIGEST_TO / owner)
- [x] Light theme by default, Dark toggle, 18px base text, contrast checked
- [x] Netlify linked to GitHub — push to `main` = live
- [x] How-to-submit PDF (`How-to-Submit-a-Trade-Journal.pdf`) linked on home page
- [x] **Meeting docs** (`MeetingDocs.gs`) — one Google Doc per meeting, auto-created, every submission appended; home page card links the upcoming doc (Oct 1, backend V20)
- [x] **Members** tab in the Sheet (Name, Email, Role, Gets Friday Email Y/N, Notes)
- [x] How-to-comment PDF (`How-to-Comment-in-the-Meeting-Doc.pdf`) linked on home page
- [x] **Friday talking-points brief** code (`Brief.gs`) — written, needs one-time setup (below)

## 🔨 Next up
- [ ] **Set up Brief.gs**: paste into Apps Script → run `previewTalkingPoints` (approve prompt, read the preview in your inbox) → run `installFridayBrief`. First real send: **Fri Oct 9, 2026**.
- [ ] Fill in the **Members** tab with Bob's email list (Bob's email is blank)
- [ ] **Post-meeting follow-up**: after decisions are recorded on the Review Desk, synthesis → follow-up email/PDF to Members
- [ ] Update `guide.html` + quick-guide PDF for: Help me get started, "how did this land", Dark button, meeting doc
- [ ] Set the committee's real passphrase (replace `clubhouse` in review.html)

## 🧹 Housekeeping (Brooks, in Apps Script)
- [x] Rename the project from "Untitled project" to **LIC Trade Journal backend** (Oct 1)
- [x] Delete `Tester.gs` (Oct 1)
- [x] Clear practice data: Submissions, Synthesis Log, October doc, test brief PDF (Oct 1)
- [ ] Optionally move the meeting docs / Sheet to a club account later (currently owned by bdgroves1970@gmail.com)

## 🗓️ Design with the group
- [ ] "Find the funds" — pair each buy with a funding decision
- [ ] Track executed/held positions over time (Holdings Tracker sheet exists in Drive)
- [ ] Capture spontaneous ideas raised during meetings

## 🔑 Key facts (don't lose these)
- **Live Apps Script deployment:** `AKfycbw2rDPXhk1DpvrvihaEZQW-…` (V20 as of Oct 1, 2026). This is `SHEET_URL` in `app.js`. Older `AKfycbxSCx…` is dead.
- **Only update via New *version*** (Deploy → Manage deployments → ✏️ → Version: New version → Deploy). Never "New deployment".
- **Code.gs, MeetingDocs.gs, Brief.gs** must all exist in the Apps Script project. The repo copies are the source of truth; paste them in, Ctrl+S, then redeploy (Brief.gs alone doesn't need a redeploy — it runs on a timer).
- **Script Properties:** `ANTHROPIC_API_KEY`, `FINNHUB_API_KEY`, optional `DIGEST_TO`, and `MEETING_DOCS_FOLDER_ID` (set automatically).
- **Sheet tabs:** Submissions · Synthesis Log · Members · Meeting Docs.
- **Drive:** folder "LIC Meeting Docs" holds each month's doc and each Friday brief PDF.
- **Don't revoke** the project's access in Google Account → Third-party apps; the whole site stops working (see README).
- Repo: `github.com/bdgroves/investment-club`. `seed.html` / `seed-macro.html` are admin-only demo loaders.
