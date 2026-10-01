/**
 * Meeting Docs — one Google Doc per club meeting
 * ==============================================
 * The club meets on the 2nd Wednesday of each month. Every submission from
 * the website is also written into that meeting's Google Doc, where members
 * read each other's journals and leave comments before the meeting.
 *
 *   - A submission goes into the doc for the NEXT meeting after today
 *     (on meeting day itself, it rolls to the following month).
 *   - The doc is created automatically the first time it's needed, saved in
 *     a Drive folder "LIC Meeting Docs", and shared so anyone with the link
 *     can comment (commenting needs a Google account).
 *   - The "Meeting Docs" tab in the Sheet lists every doc and its link.
 *   - The "Members" tab holds the club email list (used for the Friday
 *     talking-points email).
 *
 * FIRST-TIME SETUP (once, from the Apps Script editor):
 *   1. Select setupMeetingDocs in the function dropdown and click Run.
 *   2. Approve the Google permission prompt (Docs + Drive are new).
 *   3. Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.
 */

const MEETING_WEEKDAY = 3;        // 0=Sun … 3=Wed
const MEETING_WEEK_OF_MONTH = 2;  // 2nd Wednesday
const DOCS_TAB = 'Meeting Docs';
const MEMBERS_TAB = 'Members';
const DOCS_FOLDER_NAME = 'LIC Meeting Docs';
const DOC_FONT = 'Roboto';
const AMBER = '#9a6300';

/* ---------- run this once by hand from the editor ---------- */
function setupMeetingDocs() {
  getMembersSheet_();
  getDocsSheet_();
  getDocsFolder_();
  const info = getOrCreateMeetingDoc_(nextMeetingDate_(new Date()));
  Logger.log('Next meeting doc: ' + info.name + '\n' + info.url);
  return info;
}

/* ---------- called from appendTrade (never blocks a submission) ---------- */
function addTradeToMeetingDoc(t) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const info = getOrCreateMeetingDoc_(nextMeetingDate_(new Date()));
    const doc = DocumentApp.openById(info.id);
    writeTradeSection_(doc.getBody(), t);
    doc.saveAndClose();
    return info;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- website: link to the upcoming meeting's doc (read-only) ---------- */
function currentMeetingDoc() {
  const date = nextMeetingDate_(new Date());
  const found = findMeetingDoc_(date);
  return {
    meetingDate: formatLong_(date),
    name: found ? found.name : '',
    url: found ? found.url : ''
  };
}

/* ---------- dates ---------- */
function nthWeekdayOfMonth_(year, month) {
  const first = new Date(year, month, 1);
  const offset = (MEETING_WEEKDAY - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + 7 * (MEETING_WEEK_OF_MONTH - 1));
}

// First meeting date strictly after today (meeting day itself rolls forward).
function nextMeetingDate_(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let m = nthWeekdayOfMonth_(today.getFullYear(), today.getMonth());
  if (m <= today) m = nthWeekdayOfMonth_(today.getFullYear(), today.getMonth() + 1);
  return m;
}

function tz_() { return Session.getScriptTimeZone() || 'America/Los_Angeles'; }
function dateKey_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function formatLong_(d) { return Utilities.formatDate(d, tz_(), 'EEEE, MMMM d, yyyy'); }

/* ---------- Sheet tabs ---------- */
function styleHeader_(sheet, n) {
  sheet.getRange(1, 1, 1, n).setBackground('#1d2535').setFontColor('#f0b534').setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getMembersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(MEMBERS_TAB);
  if (!sh) {
    sh = ss.insertSheet(MEMBERS_TAB);
    sh.appendRow(['Name', 'Email', 'Role', 'Gets Friday Email (Y/N)', 'Notes']);
    styleHeader_(sh, 5);
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 260); sh.setColumnWidth(4, 170); sh.setColumnWidth(5, 260);
  }
  return sh;
}

// Active member emails, for the Friday talking-points send.
function memberEmails_() {
  const rows = getMembersSheet_().getDataRange().getValues().slice(1);
  return rows
    .filter(function (r) { return String(r[1]).indexOf('@') > 0 && String(r[3]).trim().toUpperCase() !== 'N'; })
    .map(function (r) { return String(r[1]).trim(); });
}

function getDocsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DOCS_TAB);
  if (!sh) {
    sh = ss.insertSheet(DOCS_TAB);
    sh.appendRow(['Meeting Date', 'Doc Name', 'Doc Link', 'Doc ID', 'Created']);
    styleHeader_(sh, 5);
    sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 380);
  }
  return sh;
}

function findMeetingDoc_(date) {
  const key = dateKey_(date);
  const rows = getDocsSheet_().getDataRange().getValues().slice(1);
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][0];
    const k = cell instanceof Date ? dateKey_(cell) : String(cell);
    if (k === key && rows[i][3]) return { name: rows[i][1], url: rows[i][2], id: rows[i][3] };
  }
  return null;
}

/* ---------- Drive ---------- */
function getDocsFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('MEETING_DOCS_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted — make a new one */ }
  }
  const folder = DriveApp.createFolder(DOCS_FOLDER_NAME);
  props.setProperty('MEETING_DOCS_FOLDER_ID', folder.getId());
  return folder;
}

function getOrCreateMeetingDoc_(date) {
  const existing = findMeetingDoc_(date);
  if (existing) return existing;

  const name = 'LIC Meeting — ' + Utilities.formatDate(date, tz_(), 'MMMM yyyy');
  const doc = DocumentApp.create(name);
  buildDocHeader_(doc.getBody(), date);
  doc.saveAndClose();

  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(getDocsFolder_());
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.COMMENT);
  } catch (e) {
    Logger.log('Could not set link sharing: ' + e);  // share by hand if the account blocks it
  }

  const info = { name: name, url: doc.getUrl(), id: doc.getId() };
  getDocsSheet_().appendRow([dateKey_(date), name, info.url, info.id, new Date()]);
  return info;
}

/* ---------- Doc content ---------- */
function setFont_(el) { el.setFontFamily(DOC_FONT); return el; }

function buildDocHeader_(body, date) {
  body.clear();
  body.setMarginTop(54).setMarginBottom(54).setMarginLeft(60).setMarginRight(60);

  const kicker = body.getParagraphs()[0];   // setText returns nothing, so style it separately
  kicker.setText('LAKEWOOD INVESTORS CLUB · MEETING DISCUSSION DOC');
  setFont_(kicker);
  kicker.setFontSize(9).setBold(true).setForegroundColor(AMBER);

  setFont_(body.appendParagraph(formatLong_(date)).setHeading(DocumentApp.ParagraphHeading.TITLE))
    .setFontSize(24).setBold(true).setForegroundColor('#1b2530');

  const how = body.appendTable([[
    'How this works\n' +
    'Every Trade Journal submitted on the club website lands in this doc automatically. ' +
    'Read through them before the meeting and leave your thoughts as comments.\n\n' +
    'To comment: highlight some words, then click the speech-bubble "+" button that appears on the right ' +
    '(or right-click → Comment). Type your thought and click Comment. ' +
    'You can reply to someone else\'s comment the same way.\n\n' +
    'Please comment rather than editing the text, so each member\'s journal stays in their own words. ' +
    'The Friday before the meeting, everyone gets a talking-points brief built from these journals and your comments.'
  ]]);
  how.setBorderWidth(0);
  const cell = how.getCell(0, 0).setBackgroundColor('#f6f1e6').setPaddingTop(10).setPaddingBottom(10).setPaddingLeft(14).setPaddingRight(14);
  for (let i = 0; i < cell.getNumChildren(); i++) {
    const p = cell.getChild(i);
    if (p.getType() === DocumentApp.ElementType.PARAGRAPH) {
      setFont_(p.asParagraph()).setFontSize(10.5).setForegroundColor('#1b2530');
    }
  }
  const first = cell.getChild(0).asParagraph();
  const firstText = first.editAsText();
  firstText.setBold(0, 'How this works'.length - 1, true).setForegroundColor(0, 'How this works'.length - 1, AMBER);

  setFont_(body.appendParagraph('Submissions').setHeading(DocumentApp.ParagraphHeading.HEADING1))
    .setFontSize(16).setForegroundColor('#1b2530');
  setFont_(body.appendParagraph('(None yet. They appear here as members submit on the website.)'))
    .setItalic(true).setForegroundColor('#4a5764').setFontSize(10.5);
}

function writeTradeSection_(body, t) {
  // Drop the "None yet" placeholder on the first submission.
  const paras = body.getParagraphs();
  for (let i = 0; i < paras.length; i++) {
    if (paras[i].getText().indexOf('(None yet.') === 0) { paras[i].removeFromParent(); break; }
  }

  const ticker = String(t.ticker || '').toUpperCase();
  const title = ticker + (t.stock ? ' — ' + t.stock : '');
  setFont_(body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING2))
    .setFontSize(15).setBold(true).setForegroundColor(AMBER);

  const when = Utilities.formatDate(new Date(), tz_(), 'MMM d, yyyy');
  setFont_(body.appendParagraph('Submitted by ' + (t.member || 'a member') + ' · ' + when))
    .setFontSize(10).setItalic(true).setForegroundColor('#4a5764');

  const facts = [
    ['Price today', money_(t.shareValue)],
    ['Entry target', money_(t.entryTarget)],
    ['Exit', money_(t.exit)],
    ['1-year range', (t.low52 || t.high52) ? money_(t.low52) + ' – ' + money_(t.high52) : ''],
    ['Sector', t.sector],
    ['Market cap', t.marketCap],
    ['Growth / Income', t.growthIncome],
    ['P/E', t.peRatio],
    ['Beta', t.beta],
    ['EPS', t.eps],
    ['Dividend', [t.dividend, t.dividendFreq].filter(Boolean).join(' · ')],
    ['Exchange', t.exchange]
  ].filter(function (r) { return String(r[1] || '').trim() !== ''; })
   .map(function (r) { return [r[0], String(r[1])]; });

  if (facts.length) {
    // two label/value pairs per row keeps it compact
    const rows = [];
    for (let i = 0; i < facts.length; i += 2) {
      const a = facts[i], b = facts[i + 1] || ['', ''];
      rows.push([a[0], a[1], b[0], b[1]]);
    }
    const tbl = body.appendTable(rows);
    tbl.setBorderColor('#dde2e8');
    for (let r = 0; r < tbl.getNumRows(); r++) {
      for (let c = 0; c < 4; c++) {
        const cell = tbl.getCell(r, c).setPaddingTop(3).setPaddingBottom(3);
        const p = setFont_(cell.getChild(0).asParagraph()).setFontSize(10);
        if (c % 2 === 0) { cell.setBackgroundColor('#f4f6f9'); p.setForegroundColor('#4a5764'); }
        else { p.setBold(true).setForegroundColor('#1b2530'); }
      }
    }
    if (t.dataSource) {
      setFont_(body.appendParagraph('Numbers: ' + t.dataSource)).setFontSize(9).setForegroundColor('#4a5764');
    }
  }

  [
    ['How it landed on the radar', t.whyPicked],
    ['Core thesis', t.thesis],
    ['Competitive moat', t.moat],
    ['Why now', t.whyNow],
    ['Pros', t.pros],
    ['Cons', t.cons],
    ['Trade management', t.management]
  ].forEach(function (s) {
    const text = String(s[1] || '').trim();
    if (!text) return;
    setFont_(body.appendParagraph(s[0]).setHeading(DocumentApp.ParagraphHeading.HEADING3))
      .setFontSize(11.5).setBold(true).setForegroundColor('#1b2530');
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      setFont_(body.appendParagraph(line.trim())).setFontSize(11).setBold(false).setForegroundColor('#1b2530');
    });
  });

  body.appendHorizontalRule();
}

function money_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^[\d.,]+$/.test(s) ? '$' + s : s;
}
