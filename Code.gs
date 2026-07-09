/**
 * Investment Club — Google Apps Script Backend
 * =============================================
 * Deploy as a Web App from your Google account:
 *   Extensions → Apps Script → Deploy → New deployment
 *   Type: Web app | Execute as: Me | Who has access: Anyone
 *
 * After deploying, copy the Web App URL into app.js → SHEET_URL
 *
 * The script auto-creates a "Submissions" sheet with headers on first run.
 */

const SHEET_NAME = 'Submissions';

const HEADERS = [
  'ID', 'Timestamp', 'Date', 'Stock', 'Ticker', 'Exchange', 'Member',
  'Share Value', 'Entry Target', 'Exit', '52wk High', '52wk Low',
  'Sector', 'Market Cap', 'Growth/Income', 'Beta', 'P/E',
  'Price/Rev per Share', 'EPS', 'Dividend', 'Dividend Freq',
  'Thesis', 'Moat', 'Why Now', 'Pros', 'Cons',
  'Management', 'Status', 'Notes'
];

/* ── GET: fetch all submissions for the review dashboard ── */
function doGet(e) {
  const sheet = getSheet();
  const rows  = sheet.getDataRange().getValues();

  if (rows.length <= 1) {
    return jsonResponse({ trades: [] });
  }

  const headers = rows[0];
  const trades  = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h.toLowerCase().replace(/ /g,'_')] = row[i]);
    return obj;
  });

  return jsonResponse({ trades });
}

/* ── POST: handle submit and decision actions ── */
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'submit') {
      appendTrade(body.trade);
      return jsonResponse({ ok: true });
    }

    if (action === 'decision') {
      updateDecision(body.id, body.status, body.notes);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown action' });
  } catch(err) {
    return jsonResponse({ error: err.message });
  }
}

/* ── Append a new trade row ── */
function appendTrade(t) {
  const sheet = getSheet();
  const now   = new Date().toISOString();
  sheet.appendRow([
    t.id || now,
    now,
    t.date          || '',
    t.stock         || '',
    (t.ticker || '').toUpperCase(),
    t.exchange      || '',
    t.member        || '',
    t.shareValue    || '',
    t.entryTarget   || '',
    t.exit          || '',
    t.high52        || '',
    t.low52         || '',
    t.sector        || '',
    t.marketCap     || '',
    t.growthIncome  || '',
    t.beta          || '',
    t.peRatio       || '',
    t.priceRevShare || '',
    t.eps           || '',
    t.dividend      || '',
    t.dividendFreq  || '',
    t.thesis        || '',
    t.moat          || '',
    t.whyNow        || '',
    t.pros          || '',
    t.cons          || '',
    t.management    || '',
    'pending',
    ''
  ]);
}

/* ── Update status and notes for an existing row ── */
function updateDecision(id, status, notes) {
  const sheet  = getSheet();
  const data   = sheet.getDataRange().getValues();
  const idCol  = 0;   // Column A = ID
  const statCol = HEADERS.indexOf('Status');
  const noteCol = HEADERS.indexOf('Notes');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.getRange(i + 1, statCol + 1).setValue(status);
      sheet.getRange(i + 1, noteCol + 1).setValue(notes || '');
      return;
    }
  }
}

/* ── Get or create the sheet ── */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    // Light formatting
    const header = sheet.getRange(1, 1, 1, HEADERS.length);
    header.setBackground('#1d2535');
    header.setFontColor('#f0b534');
    header.setFontWeight('bold');
    sheet.setColumnWidth(1, 160);   // ID
    sheet.setColumnWidth(HEADERS.indexOf('Thesis') + 1, 320);
    sheet.setColumnWidth(HEADERS.indexOf('Management') + 1, 320);
  }

  return sheet;
}

/* ── JSON helper ── */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
