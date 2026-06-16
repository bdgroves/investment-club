/* ── app.js — Investment Club shared logic ──
   Storage: localStorage for demo prototype.
   When wired to Google Sheets backend, replace
   saveTrade / loadTrades / updateTrade with
   fetch() calls to your Apps Script web app URL.
   Set SHEET_URL below once deployed.
*/

const SHEET_URL = ''; // TODO: paste your Apps Script web app URL here

/* ── Local storage helpers (prototype mode) ── */

function loadTrades() {
  try {
    return JSON.parse(localStorage.getItem('ic_trades') || '[]');
  } catch { return []; }
}

function saveTrade(trade) {
  const trades = loadTrades();
  trade.id     = String(Date.now());
  trade.status = 'pending';
  trade.notes  = '';
  trade.open   = false;
  trades.unshift(trade);
  localStorage.setItem('ic_trades', JSON.stringify(trades));

  // When SHEET_URL is set, also POST to Google Sheets
  if (SHEET_URL) {
    fetch(SHEET_URL, {
      method: 'POST',
      mode:   'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', trade })
    }).catch(console.error);
  }
}

function updateTrade(updatedTrade) {
  const trades = loadTrades();
  const idx = trades.findIndex(t => t.id === updatedTrade.id);
  if (idx !== -1) {
    trades[idx] = updatedTrade;
    localStorage.setItem('ic_trades', JSON.stringify(trades));
  }

  // When SHEET_URL is set, also POST decision back to Sheet
  if (SHEET_URL) {
    fetch(SHEET_URL, {
      method: 'POST',
      mode:   'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'decision',
        id:     updatedTrade.id,
        status: updatedTrade.status,
        notes:  updatedTrade.notes
      })
    }).catch(console.error);
  }
}

/* ── Toast ── */
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'toast' + (isError ? ' error' : '');
  // force reflow
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}
