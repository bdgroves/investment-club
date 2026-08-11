/* app.js - Investment Club shared logic. SHARED mode via Google Apps Script. */

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwxivmeZrARKTvao5_cJejqqPgxE76A6ELvdt4A-HOB9Uz48Z1iFoX-A-70D74g2-NWVA/exec';

function loadTrades() {
  try { return JSON.parse(localStorage.getItem('ic_trades') || '[]'); } catch (e) { return []; }
}
function cacheTrades(trades) {
  try { localStorage.setItem('ic_trades', JSON.stringify(trades)); } catch (e) {}
}

function sheetWrite(paramObj) {
  if (!SHEET_URL) return;
  var cbName = '__icW_' + Math.random().toString(36).slice(2);
  var script;
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }
  window[cbName] = function () { cleanup(); };
  var qs = Object.keys(paramObj).map(function (k) {
    return k + '=' + encodeURIComponent(paramObj[k]);
  }).join('&');
  script = document.createElement('script');
  script.src = SHEET_URL + '?' + qs + '&callback=' + cbName + '&t=' + Date.now();
  script.onerror = cleanup;
  document.head.appendChild(script);
  setTimeout(cleanup, 15000);
}

function saveTrade(trade) {
  trade.id = String(Date.now());
  trade.status = 'pending';
  trade.notes = '';
  trade.open = false;
  var trades = loadTrades();
  trades.unshift(trade);
  cacheTrades(trades);
  sheetWrite({ action: 'submit', data: JSON.stringify({ trade: trade }) });
}

function updateTrade(updatedTrade) {
  var trades = loadTrades();
  var idx = trades.findIndex(function (t) { return t.id === updatedTrade.id; });
  if (idx !== -1) { trades[idx] = updatedTrade; cacheTrades(trades); }
  sheetWrite({
    action: 'decision',
    data: JSON.stringify({ id: updatedTrade.id, status: updatedTrade.status, notes: updatedTrade.notes })
  });
}

function loadTradesFromSheet(callback) {
  if (!SHEET_URL) { callback(loadTrades()); return; }
  var cbName = '__icCb_' + Date.now();
  var script;
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }
  var timeout = setTimeout(function () { cleanup(); callback(loadTrades()); }, 9000);
  window[cbName] = function (data) {
    clearTimeout(timeout); cleanup();
    var trades = (data && data.trades) ? data.trades : [];
    cacheTrades(trades); callback(trades);
  };
  script = document.createElement('script');
  script.src = SHEET_URL + '?callback=' + cbName + '&t=' + Date.now();
  script.onerror = function () { clearTimeout(timeout); cleanup(); callback(loadTrades()); };
  document.head.appendChild(script);
}

function requestSynthesis(callback) {
  if (!SHEET_URL) { callback({ error: 'No backend configured.' }); return; }
  var cbName = '__icSyn_' + Date.now();
  var script;
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (script && script.parentNode) script.parentNode.removeChild(script);
  }
  var timeout = setTimeout(function () { cleanup(); callback({ error: 'Timed out reaching the synthesis service.' }); }, 60000);
  window[cbName] = function (data) { clearTimeout(timeout); cleanup(); callback(data || {}); };
  script = document.createElement('script');
  script.src = SHEET_URL + '?action=synthesize&callback=' + cbName + '&t=' + Date.now();
  script.onerror = function () { clearTimeout(timeout); cleanup(); callback({ error: 'Could not reach the synthesis service.' }); };
  document.head.appendChild(script);
}

function showToast(msg, isError) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 3200);
}
