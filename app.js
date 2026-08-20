/* ── app.js — Investment Club shared logic ──
   PROTOTYPE mode: data lives in localStorage.
   SHARED mode:    set SHEET_URL below to your deployed Apps Script
                   web-app URL (ends in /exec) and submissions +
                   decisions read/write to your Google Sheet.
*/

// ▼▼▼ APPS SCRIPT WEB APP URL (ends in /exec) — set = shared/sheet mode ▼▼▼
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxSCx_1YRrF4vLw9INbUUte7Utsxn5S-sXNpvxpnr6wScYF5ug1aocIqwl9ljYeNK-d9Q/exec';
// ▲▲▲ set to '' to fall back to local prototype mode ▲▲▲

/* ── Local cache (also the store when SHEET_URL is blank) ── */
function loadTrades() {
  try {
    return JSON.parse(localStorage.getItem('ic_trades') || '[]');
  } catch (e) { return []; }
}

function cacheTrades(trades) {
  try { localStorage.setItem('ic_trades', JSON.stringify(trades)); } catch (e) {}
}

/* ── Fire a write through JSONP (GET) — survives Apps Script's redirect,
      which a no-cors POST does not. Fire-and-forget; we don't need the reply. ── */
function sheetWrite(paramObj) {
  if (!SHEET_URL) return;
  const cbName = '__icW_' + Math.random().toString(36).slice(2);
  let script;
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }
  window[cbName] = function () { cleanup(); };
  const qs = Object.keys(paramObj).map(function (k) {
    return k + '=' + encodeURIComponent(paramObj[k]);
  }).join('&');
  script = document.createElement('script');
  script.src = SHEET_URL + '?' + qs + '&callback=' + cbName + '&t=' + Date.now();
  script.onerror = cleanup;
  document.head.appendChild(script);
  // safety cleanup in case callback never fires
  setTimeout(cleanup, 15000);
}

/* ── Write: new submission ── */
function saveTrade(trade) {
  trade.id     = String(Date.now());
  trade.status = 'pending';
  trade.notes  = '';
  trade.open   = false;

  // local cache (immediate)
  const trades = loadTrades();
  trades.unshift(trade);
  cacheTrades(trades);

  // shared sheet (via JSONP GET)
  sheetWrite({ action: 'submit', data: JSON.stringify({ trade: trade }) });
}

/* ── Write: committee decision (status + notes) ── */
function updateTrade(updatedTrade) {
  const trades = loadTrades();
  const idx = trades.findIndex(function (t) { return t.id === updatedTrade.id; });
  if (idx !== -1) { trades[idx] = updatedTrade; cacheTrades(trades); }

  sheetWrite({
    action: 'decision',
    data: JSON.stringify({
      id:     updatedTrade.id,
      status: updatedTrade.status,
      notes:  updatedTrade.notes
    })
  });
}

/* ── Read: pull all submissions from the sheet (JSONP) ──
   Falls back to the local cache if SHEET_URL is blank or the call fails. */
function loadTradesFromSheet(callback) {
  if (!SHEET_URL) { callback(loadTrades()); return; }

  const cbName = '__icCb_' + Date.now();
  let script;

  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }

  const timeout = setTimeout(function () {
    cleanup();
    callback(loadTrades()); // fallback to cache
  }, 9000);

  window[cbName] = function (data) {
    clearTimeout(timeout);
    cleanup();
    const trades = (data && data.trades) ? data.trades : [];
    cacheTrades(trades);
    callback(trades);
  };

  script = document.createElement('script');
  script.src = SHEET_URL + '?callback=' + cbName + '&t=' + Date.now();
  script.onerror = function () {
    clearTimeout(timeout);
    cleanup();
    callback(loadTrades());
  };
  document.head.appendChild(script);
}

/* ── Ask the backend for an AI synthesis (JSONP; Claude runs server-side) ── */
function requestSynthesis(callback) {
  if (!SHEET_URL) { callback({ error: 'No backend configured.' }); return; }

  const cbName = '__icSyn_' + Date.now();
  let script;

  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }

  const timeout = setTimeout(function () {
    cleanup();
    callback({ error: 'Timed out reaching the synthesis service.' });
  }, 60000);

  window[cbName] = function (data) {
    clearTimeout(timeout);
    cleanup();
    callback(data || {});
  };

  script = document.createElement('script');
  script.src = SHEET_URL + '?action=synthesize&callback=' + cbName + '&t=' + Date.now();
  script.onerror = function () {
    clearTimeout(timeout);
    cleanup();
    callback({ error: 'Could not reach the synthesis service.' });
  };
  document.head.appendChild(script);
}

/* ── Look up objective fundamentals for a ticker (JSONP; data API runs server-side) ── */
function lookupTicker(ticker, callback) {
  if (!SHEET_URL) { callback({ error: 'No backend configured.' }); return; }
  const cbName = '__icLk_' + Date.now();
  let script;
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }
  const timeout = setTimeout(function () { cleanup(); callback({ error: 'Lookup timed out.' }); }, 15000);
  window[cbName] = function (data) { clearTimeout(timeout); cleanup(); callback(data || {}); };
  script = document.createElement('script');
  script.src = SHEET_URL + '?action=lookup&ticker=' + encodeURIComponent(ticker) + '&callback=' + cbName + '&t=' + Date.now();
  script.onerror = function () { clearTimeout(timeout); cleanup(); callback({ error: 'Could not reach the lookup service.' }); };
  document.head.appendChild(script);
}

/* ── Toast ── */
function showToast(msg, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 3200);
}
