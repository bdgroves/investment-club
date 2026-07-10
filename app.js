/* ── app.js — Investment Club shared logic ──
   PROTOTYPE mode: data lives in localStorage.
   SHARED mode:    set SHEET_URL below to your deployed Apps Script
                   web-app URL (ends in /exec) and submissions +
                   decisions read/write to your Google Sheet.
*/

// ▼▼▼ APPS SCRIPT WEB APP URL (ends in /exec) — set = shared/sheet mode ▼▼▼
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbziVWrGBxWNLz-BRaPJVbstKu3KGXVw6p8ATzV_wp86Tot-z3WA8qoo-3s3ILtxn7EM3w/exec';
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

  // shared sheet (fire-and-forget; response is opaque in no-cors)
  if (SHEET_URL) {
    fetch(SHEET_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submit', trade: trade })
    }).catch(function (err) { console.error('submit failed', err); });
  }
}

/* ── Write: committee decision (status + notes) ── */
function updateTrade(updatedTrade) {
  const trades = loadTrades();
  const idx = trades.findIndex(function (t) { return t.id === updatedTrade.id; });
  if (idx !== -1) { trades[idx] = updatedTrade; cacheTrades(trades); }

  if (SHEET_URL) {
    fetch(SHEET_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'decision',
        id:     updatedTrade.id,
        status: updatedTrade.status,
        notes:  updatedTrade.notes
      })
    }).catch(function (err) { console.error('decision failed', err); });
  }
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
