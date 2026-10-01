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
  { key: 'notes',         header: 'Notes' },
  { key: 'whyPicked',     header: 'How It Landed On Radar' },
  { key: 'dataSource',    header: 'Data Source' }
];

const HEADERS = FIELDS.map(function (f) { return f.header; });

/* ---------- GET: return all submissions (JSONP-aware) ---------- */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'synthesize') {
    return reply(synthesize(), e);
  }

  if (action === 'lookup') {
    return reply(lookupTicker((e.parameter.ticker || '').toUpperCase()), e);
  }

  if (action === 'starter') {
    return reply(starterQuestions((e.parameter.ticker || '').toUpperCase(), e.parameter.name || ''), e);
  }

  if (action === 'digest') {
    return reply(sendDigest(), e);
  }

  if (action === 'meetingdoc') {
    try { return reply(currentMeetingDoc(), e); }
    catch (err) { return reply({ error: String(err) }, e); }
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

  // Also copy it into this month's meeting doc (MeetingDocs.gs).
  // A Docs hiccup must never lose a submission, so failures are only logged.
  try {
    if (typeof addTradeToMeetingDoc === 'function') addTradeToMeetingDoc(t);
  } catch (err) {
    console.error('Meeting doc update failed: ' + err);
  }
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
  } else {
    // Schema may have grown since this sheet was created. Add any missing
    // header cells so existing columns keep their positions and data.
    const width = sheet.getLastColumn();
    if (width < HEADERS.length) {
      const missing = HEADERS.slice(width);
      const rng = sheet.getRange(1, width + 1, 1, missing.length);
      rng.setValues([missing]);
      rng.setBackground('#1d2535').setFontColor('#f0b534').setFontWeight('bold');
    }
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
        'HOW IT LANDED ON THEIR RADAR: ' + (t.whyPicked || 'not given'),
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
      max_tokens: 2500,
      system: 'You are a neutral discussion facilitator for an investment club. Members submit their own trade ideas, and the club decides together. Your job is to help them have a well-informed conversation — NOT to grade, rank, score, or recommend. Never say a submission is weak, strong, best, or worst. Never tell the club what to buy, sell, hold, approve, or pass. Present each idea fairly, surface the questions and considerations worth discussing, and add useful context. Be concise, even-handed, and respectful of the members who did the work. Plain language, clear short sections.',
      messages: [{
        role: 'user',
        content: "Here are this cycle's trade submissions from club members:\n\n" + text +
          '\n\nPrepare a neutral discussion brief for the meeting. Do NOT rank, grade, or recommend anything. Cover:\n' +
          '1) A brief, fair summary of each submission in the members\' own framing.\n' +
          '2) Themes or connections across the submissions (sectors, shared assumptions, how they relate).\n' +
          '3) For each idea, 2-3 open questions or considerations the club may want to discuss (things to verify, weigh, or think through) — framed as questions, not judgments.\n' +
          '4) Any shared risks or context worth the whole club keeping in mind.\n' +
          '5) A short list of discussion prompts to help the meeting get going.\n\n' +
          'Keep it balanced — give every submission fair attention. The club makes all the decisions; you are only helping them prepare.'
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
    logSynthesis(summary, trades);
    return { summary: summary || 'No summary returned.' };
  } catch (err) {
    return { error: String(err) };
  }
}

// Append each synthesis to a "Synthesis Log" tab for a running archive
function logSynthesis(summary, trades) {
  try {
    if (!summary) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let log = ss.getSheetByName('Synthesis Log');
    if (!log) {
      log = ss.insertSheet('Synthesis Log');
      log.appendRow(['Timestamp', 'Submissions', 'Tickers', 'Report']);
      log.setFrozenRows(1);
      log.getRange(1, 1, 1, 4).setBackground('#1d2535').setFontColor('#f0b534').setFontWeight('bold');
      log.setColumnWidth(4, 600);
    }
    const tickers = (trades || []).map(function (t) { return t.ticker; }).filter(String).join(', ');
    log.appendRow([new Date().toISOString(), (trades || []).length, tickers, summary]);
  } catch (e) {
    // logging must never break the synthesis response
  }
}

/* ---------- Ticker lookup: objective fundamentals from a market-data API ---------- */
function lookupTicker(ticker) {
  try {
    if (!ticker) return { error: 'No ticker provided.' };
    const key = PropertiesService.getScriptProperties().getProperty('FINNHUB_API_KEY');
    if (!key) {
      return { error: 'Auto-fill not set up yet (no market-data key). You can fill the numbers by hand.' };
    }

    const base = 'https://finnhub.io/api/v1/';
    function get(path) {
      const res = UrlFetchApp.fetch(base + path + '&token=' + key, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return {};
      try { return JSON.parse(res.getContentText()); } catch (e) { return {}; }
    }

    const quote   = get('quote?symbol=' + encodeURIComponent(ticker));
    const profile = get('stock/profile2?symbol=' + encodeURIComponent(ticker));
    const m       = (get('stock/metric?symbol=' + encodeURIComponent(ticker) + '&metric=all').metric) || {};

    if (!profile.name && !(quote.c > 0)) {
      return { error: 'No data found for "' + ticker + '". Check the symbol, or fill by hand.' };
    }

    function num(v, dp) {
      if (v === undefined || v === null || v === '' || isNaN(v)) return '';
      return Number(v).toFixed(dp === undefined ? 2 : dp);
    }
    // market cap (Finnhub gives millions) -> Large / Mid / Small bucket
    let cap = '';
    const mc = profile.marketCapitalization;
    if (mc) { cap = mc >= 10000 ? 'Large' : (mc >= 2000 ? 'Mid' : 'Small'); }

    const div = m.dividendPerShareTTM;
    const pe  = (m.peTTM !== undefined ? m.peTTM : m.peBasicExclExtraTTM);
    const eps = (m.epsTTM !== undefined ? m.epsTTM : m.epsBasicExclExtraItemsTTM);

    return {
      name: profile.name || '',
      exchange: profile.exchange || '',
      price: num(quote.c),
      high52: num(m['52WeekHigh']),
      low52: num(m['52WeekLow']),
      sector: mapSector(profile.finnhubIndustry || ''),
      marketCap: cap,
      beta: num(m.beta),
      peRatio: num(pe, 1),
      priceRevShare: num(m.psTTM, 1),
      eps: num(eps),
      dividend: div ? num(div) : '0',
      dividendFreq: (div && div > 0) ? 'Quarterly' : 'None',
      source: 'Finnhub market data',
      asOf: new Date().toISOString().slice(0, 10)
    };
  } catch (err) {
    return { error: 'Lookup error: ' + String(err) };
  }
}

/* ---------- "Help me get started": generate questions, never answers ---------- */
function starterQuestions(ticker, name) {
  try {
    if (!ticker) return { error: 'No ticker provided.' };
    const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return { error: 'Question helper is not set up yet — go ahead and write in your own words.' };

    const cache = CacheService.getScriptCache();
    const cacheKey = 'starter_' + ticker;
    const hit = cache.get(cacheKey);
    if (hit) { try { return JSON.parse(hit); } catch (e) {} }

    const who = name ? (name + ' (' + ticker + ')') : ticker;

    const payload = {
      model: SYNTH_MODEL,
      max_tokens: 700,
      system: 'You help members of a volunteer investment club write their own investment thesis. ' +
        'Your job is to ASK QUESTIONS ONLY. You never answer them, never state a view about the company, ' +
        'never say whether it is a good or bad investment, and never suggest buying, selling, or holding. ' +
        'The member does the thinking; you only help them find the right things to think about. ' +
        'Write for a smart adult who is not a finance professional: plain language, no jargon, no acronyms without explanation. ' +
        'Each question must be answerable by someone willing to spend twenty minutes reading about the company.',
      messages: [{
        role: 'user',
        content: 'A club member is writing up ' + who + ' for our trade journal. They need to fill in: ' +
          'Core Thesis (what the company does and why it will do well), Competitive Moat (its edge over rivals), ' +
          'Why Now (the timing), Pros and Cons, and Trade Management (their own plan for when to buy more, hold, or sell).\n\n' +
          'Give me 6 short questions, specific to this company, that would help them fill those sections in their own words. ' +
          'Cover the business itself, its competition, the timing, the main risk, and — for trade management — one question ' +
          'that asks THEM what would make them change their mind or sell.\n\n' +
          'Rules: questions only, no answers, no opinions about the company, no buy/sell language. ' +
          'One sentence each. Return ONLY a JSON array of 6 strings, nothing else — no preamble, no markdown fences.'
      }]
    };

    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) {
      return { error: 'Couldn\u2019t load questions just now — go ahead and write in your own words.' };
    }

    const body = JSON.parse(res.getContentText());
    let text = (body.content || []).map(function (b) { return b.text || ''; }).join('').trim();
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    let questions;
    try {
      questions = JSON.parse(text);
    } catch (e) {
      // fall back: split lines, strip bullets/numbering
      questions = text.split('\n').map(function (l) {
        return l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').replace(/^"|"$/g, '').trim();
      }).filter(function (l) { return l.length > 10; });
    }
    if (!Array.isArray(questions) || !questions.length) {
      return { error: 'Couldn\u2019t load questions just now — go ahead and write in your own words.' };
    }

    const out = { questions: questions.slice(0, 6) };
    cache.put(cacheKey, JSON.stringify(out), 21600); // 6h — same ticker, same questions
    return out;
  } catch (err) {
    return { error: 'Question helper hit a snag — go ahead and write in your own words.' };
  }
}

/* ---------- Pre-meeting digest: email the pending Trade Journals ---------- */
// NOTE: the recipient is NEVER taken from the URL. It comes from the DIGEST_TO
// script property, falling back to the script owner. A public endpoint that
// accepted a "to" parameter would be an open mail relay.
function sendDigest() {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('digest_lock')) {
      return { error: 'A digest just went out — give it a minute before sending another.' };
    }

    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return { error: 'There are no submissions to send yet.' };

    const all = rows.slice(1).map(function (row) {
      const o = {};
      FIELDS.forEach(function (f, i) { o[f.key] = row[i]; });
      return o;
    });
    const trades = all.filter(function (t) {
      return String(t.status || 'pending').toLowerCase() === 'pending' && String(t.ticker || '').trim();
    });
    if (!trades.length) return { error: 'No pending Trade Journals to send right now.' };

    let to = PropertiesService.getScriptProperties().getProperty('DIGEST_TO');
    if (!to) { to = Session.getEffectiveUser().getEmail(); }
    if (!to) return { error: 'No recipient set. Add a DIGEST_TO script property.' };

    const tickers = trades.map(function (t) { return t.ticker; }).join(', ');
    const subject = 'LIC Trade Journals for the next meeting — ' + tickers;

    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: buildDigestHtml(trades),
      name: 'Lakewood Investors Club'
    });

    cache.put('digest_lock', '1', 60);
    return { ok: true, sent: trades.length, to: to };
  } catch (err) {
    return { error: 'Could not send: ' + String(err) };
  }
}

// Written to be forwarded as-is — it reads as a note to members, not to the sender.
function buildDigestHtml(trades) {
  const A = '#b8860b', INK = '#1f2733', SOFT = '#5b6674', LINE = '#e2ddd4';
  let h = '<div style="font-family:Georgia,serif;color:' + INK + ';max-width:680px;line-height:1.55;">';
  h += '<p style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + A + ';font-weight:bold;margin:0 0 4px;">Lakewood Investors Club</p>';
  h += '<h2 style="font-family:Arial,sans-serif;margin:0 0 10px;font-size:20px;">Trade Journals for the next meeting</h2>';
  h += '<p style="margin:0 0 6px;">Here ' + (trades.length === 1 ? 'is the Trade Journal' : 'are the ' + trades.length + ' Trade Journals') +
       ' submitted so far. Please have a read before we meet and come with your thoughts \u2014 the point of the meeting is to flesh these out together.</p>';
  h += '<p style="margin:0 0 18px;color:' + SOFT + ';font-size:14px;">You can also view them, and add one of your own, at <a href="https://lakewood-investment-club.netlify.app/" style="color:' + A + ';">lakewood-investment-club.netlify.app</a>.</p>';

  trades.forEach(function (t) {
    h += '<div style="border:1px solid ' + LINE + ';border-radius:8px;padding:16px 18px;margin:0 0 18px;">';
    h += '<div style="font-family:Arial,sans-serif;font-size:17px;font-weight:bold;margin-bottom:2px;">' +
         esc_(t.ticker) + (t.stock ? ' \u2014 ' + esc_(t.stock) : '') + '</div>';
    h += '<div style="color:' + SOFT + ';font-size:13px;margin-bottom:12px;">Submitted by ' + esc_(t.member || 'a member') +
         (t.date ? ' \u00b7 ' + esc_(fmtDate_(t.date)) : '') + '</div>';

    const nums = [];
    if (t.shareValue) nums.push('Price ' + esc_(t.shareValue));
    if (t.entryTarget) nums.push('Entry ' + esc_(t.entryTarget));
    if (t.exit) nums.push('Exit ' + esc_(t.exit));
    if (t.peRatio) nums.push('P/E ' + esc_(t.peRatio));
    if (t.beta) nums.push('Beta ' + esc_(t.beta));
    if (t.eps) nums.push('EPS ' + esc_(t.eps));
    if (t.dividend) nums.push('Div ' + esc_(t.dividend));
    if (t.sector) nums.push(esc_(t.sector));
    if (nums.length) {
      h += '<div style="background:#f7f5f0;border-radius:5px;padding:9px 12px;font-family:Arial,sans-serif;font-size:12px;color:' +
           SOFT + ';margin-bottom:14px;">' + nums.join(' &nbsp;\u00b7&nbsp; ') + '</div>';
    }

    h += section_('How it landed on their radar', t.whyPicked, A, SOFT);
    h += section_('Core thesis', t.thesis, A, SOFT);
    h += section_('Competitive moat', t.moat, A, SOFT);
    h += section_('Why now', t.whyNow, A, SOFT);
    h += section_('Pros', t.pros, A, SOFT);
    h += section_('Cons', t.cons, A, SOFT);
    h += section_('Trade management', t.management, A, SOFT);
    h += '</div>';
  });

  h += '<p style="color:' + SOFT + ';font-size:12px;border-top:1px solid ' + LINE + ';padding-top:12px;margin-top:20px;">' +
       'Numbers were auto-filled from market data at the time of submission and may have moved since. Shared for club discussion. Not investment advice \u2014 every member does their own research and the club decides together.</p>';
  h += '</div>';
  return h;
}

function section_(label, value, A, SOFT) {
  const v = String(value === undefined || value === null ? '' : value).trim();
  if (!v) return '';
  return '<div style="margin-bottom:11px;">' +
    '<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:' + A + ';font-weight:bold;margin-bottom:2px;">' + label + '</div>' +
    '<div style="font-size:14px;">' + esc_(v).replace(/\n/g, '<br>') + '</div></div>';
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate_(d) {
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'MMM d, yyyy');
  } catch (e) { return String(d); }
}

// Map a market-data industry string to the form's Sector dropdown options
function mapSector(ind) {
  if (!ind) return '';
  const s = ind.toLowerCase();
  const has = function () {
    for (var i = 0; i < arguments.length; i++) { if (s.indexOf(arguments[i]) !== -1) return true; }
    return false;
  };
  if (has('semiconductor', 'software', 'hardware', 'technology', 'it services', 'electronic')) return 'Technology';
  if (has('bank', 'insurance', 'financial', 'capital markets', 'asset management')) return 'Financial';
  if (has('oil', 'gas', 'energy', 'coal', 'petroleum')) return 'Energy';
  if (has('pharma', 'biotech', 'health', 'medical', 'life science', 'drug')) return 'Healthcare';
  if (has('utilit')) return 'Utilities';
  if (has('real estate', 'reit')) return 'Real Estate';
  if (has('telecom', 'media', 'communication', 'entertainment', 'interactive')) return 'Communication Services';
  if (has('chemical', 'metal', 'mining', 'materials', 'steel', 'paper', 'forestry')) return 'Materials';
  if (has('aerospace', 'defense', 'machinery', 'industrial', 'construction', 'transportation', 'airlines', 'logistics', 'engineering')) return 'Industrials';
  if (has('food', 'beverage', 'tobacco', 'household', 'staple', 'grocery')) return 'Consumer Staples';
  if (has('retail', 'auto', 'apparel', 'hotel', 'restaurant', 'leisure', 'consumer', 'travel', 'luxury')) return 'Consumer Discretionary';
  return ''; // no confident match — let the member pick
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
