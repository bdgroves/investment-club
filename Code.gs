/**
 * Investment Club — Google Apps Script Backend
 * ============================================
 * Deploy from your Google account:
 *   Extensions → Apps Script → paste this in → Deploy → New deployment
 *   Type: Web app | Execute as: Me | Who has access: Anyone
 * Then copy the Web App URL (ends in /exec) into app.js → SHEET_URL
 *
 * Auto-creates a "Submissions" sheet with headers on first run.
 */

const SHEET_NAME = 'Submissions';

// Single source of truth: app field key  <->  sheet column header
const FIELDS = [
  { key: 'id',            header: 'ID' },
  { key: 'timestamp',     header: 'Timestamp' },
  { key: 'date',          header: 'Date' },
  { key: 'stock',         header: 'Stock' },
  { key: 'ticker',        header: 'Ticker' },
  { key: 'exchange',      header: 'Exchange' },
  { key: 'member',        header: 'Member' },
  { key: 'shareValue',    header: 'Share Value' },
  { key: 'entryTarget',   header: 'Entry Target' },
  { key: 'exit',          header: 'Exit' },
  { key: 'high52',        header: '52wk High' },
  { key: 'low52',         header: '52wk Low' },
  { key: 'sector',        header: 'Sector' },
  { key: 'marketCap',     header: 'Market Cap' },
  { key: 'growthIncome',  header: 'Growth/Income' },
  { key: 'beta',          header: 'Beta' },
  { key: 'peRatio',       header: 'P/E' },
  { key: 'priceRevShare', header: 'Price/Rev per Share' },
  { key: 'eps',           header: 'EPS' },
  { key: 'dividend',      header: 'Dividend' },
  { key: 'dividendFreq',  header: 'Dividend Freq' },
  { key: 'thesis',        header: 'Thesis' },
  { key: 'moat',          header: 'Moat' },
  { key: 'whyNow',        header: 'Why Now' },
  { key: 'pros',          header: 'Pros' },
  { key: 'cons',          header: 'Cons' },
  { key: 'management',    header: 'Management' },
  { key: 'status',        header: 'Status' },
  { key: 'notes',         header: 'Notes' }
];

const HEADERS = FIELDS.map(function (f) { return f.header; });

/* ---------- GET: return all submissions (JSONP-aware) ---------- */
function doGet(e) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  let trades = [];
  if (rows.length > 1) {
    trades = rows.slice(1).map(function (row) {
      const obj = {};
      FIELDS.forEach(function (f, i) { obj[f.key] = row[i]; });
      obj.open = false;
      return obj;
    });
  }
  return reply({ trades: trades }, e);
}

/* ---------- POST: submit a trade, or record a decision ---------- */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'submit') {
      appendTrade(body.trade);
      return reply({ ok: true }, e);
    }
    if (body.action === 'decision') {
      updateDecision(body.id, body.status, body.notes);
      return reply({ ok: true }, e);
    }
    return reply({ error: 'Unknown action' }, e);
  } catch (err) {
    return reply({ error: String(err) }, e);
  }
}

/* ---------- helpers ---------- */
function appendTrade(t) {
  const sheet = getSheet();
  const now = new Date().toISOString();
  const row = FIELDS.map(function (f) {
    if (f.key === 'id')        return t.id || now;
    if (f.key === 'timestamp') return now;
    if (f.key === 'ticker')    return String(t.ticker || '').toUpperCase();
    if (f.key === 'status')    return t.status || 'pending';
    if (f.key === 'notes')     return t.notes || '';
    return t[f.key] || '';
  });
  sheet.appendRow(row);
}

function updateDecision(id, status, notes) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const statusCol = HEADERS.indexOf('Status') + 1;
  const notesCol  = HEADERS.indexOf('Notes') + 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {   // column A = ID
      sheet.getRange(i + 1, statusCol).setValue(status);
      sheet.getRange(i + 1, notesCol).setValue(notes || '');
      return;
    }
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    const hdr = sheet.getRange(1, 1, 1, HEADERS.length);
    hdr.setBackground('#1d2535').setFontColor('#f0b534').setFontWeight('bold');
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(HEADERS.indexOf('Thesis') + 1, 320);
    sheet.setColumnWidth(HEADERS.indexOf('Management') + 1, 320);
  }
  return sheet;
}

// Return JSON, or JSONP if ?callback= is present (lets a browser read cross-origin)
function reply(obj, e) {
  const json = JSON.stringify(obj);
  const cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
