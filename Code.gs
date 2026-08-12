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

// Model used for the AI synthesis (change if you like)
const SYNTH_MODEL = 'claude-sonnet-5';

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
  const action = e && e.parameter && e.parameter.action;

  if (action === 'synthesize') {
    return reply(synthesize(), e);
  }

  // Writes routed through GET (JSONP) because browser no-cors POST
  // won't follow Apps Script's redirect. Payload arrives as ?data=<json>.
  if (action === 'submit' || action === 'decision') {
    try {
      const payload = JSON.parse(e.parameter.data || '{}');
      if (action === 'submit') {
        appendTrade(payload.trade || payload);
      } else {
        updateDecision(payload.id, payload.status, payload.notes);
      }
      return reply({ ok: true }, e);
    } catch (err) {
      return reply({ error: String(err) }, e);
    }
  }

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

/* ---------- AI synthesis (server-side Claude call) ---------- */
function synthesize() {
  try {
    const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) {
      return { error: 'No API key set. In Apps Script: Project Settings -> Script Properties -> add ANTHROPIC_API_KEY.' };
    }

    // light throttle so the public endpoint can't rapid-fire the API
    const cache = CacheService.getScriptCache();
    if (cache.get('synth_lock')) {
      return { error: 'A synthesis just ran - give it a few seconds and try again.' };
    }
    cache.put('synth_lock', '1', 20);

    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return { summary: 'No submissions yet to synthesize.' };
    }

    const trades = rows.slice(1).map(function (row) {
      const o = {};
      FIELDS.forEach(function (f, i) { o[f.key] = row[i]; });
      return o;
    });

    const text = trades.map(function (t) {
      return [
        'TICKER: ' + t.ticker + (t.stock ? ' (' + t.stock + ')' : ''),
        'MEMBER: ' + t.member + ' | DATE: ' + t.date,
        'SECTOR: ' + t.sector + ' | CAP: ' + t.marketCap + ' | STYLE: ' + t.growthIncome,
        'PRICE: ' + t.shareValue + ' | ENTRY: ' + t.entryTarget + ' | EXIT: ' + t.exit + ' | 52WK: ' + t.low52 + '-' + t.high52,
        'VALUATION: Beta ' + t.beta + ', P/E ' + t.peRatio + ', P/Rev ' + t.priceRevShare + ', EPS ' + t.eps + ', Div ' + t.dividend + ' (' + t.dividendFreq + ')',
        'THESIS: ' + t.thesis,
        'MOAT: ' + t.moat,
        'WHY NOW: ' + t.whyNow,
        'PROS: ' + t.pros,
        'CONS: ' + t.cons,
        'MANAGEMENT: ' + t.management,
        'STATUS: ' + t.status
      ].join('\n');
    }).join('\n\n---\n\n');

    const payload = {
      model: SYNTH_MODEL,
      max_tokens: 1500,
      system: 'You are a senior investment analyst helping an investment club committee review trade submissions from members. Be concise, direct, and insightful. Identify themes, consensus, outliers, and the strongest ideas. Use plain language and clear short sections.',
      messages: [{
        role: 'user',
        content: "Here are this cycle's trade submissions:\n\n" + text +
          '\n\nSynthesize them. Cover: 1) themes/sectors the club is converging on, ' +
          '2) the strongest thesis or two and why, 3) shared risks across submissions, ' +
          '4) notable outliers worth debating, 5) which deserve the most committee time.'
      }]
    };

    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const body = JSON.parse(res.getContentText());
    if (code !== 200) {
      const msg = (body.error && body.error.message) ? body.error.message : 'request failed';
      return { error: 'API ' + code + ': ' + msg };
    }

    const summary = (body.content || []).map(function (b) { return b.text || ''; }).join('');
    return { summary: summary || 'No summary returned.' };
  } catch (err) {
    return { error: String(err) };
  }
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
