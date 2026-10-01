/**
 * Friday Talking Points — the pre-meeting brief
 * =============================================
 * The Friday before each meeting (2nd Wednesday), this reads that meeting's
 * Google Doc (every Trade Journal) plus every member comment on it, asks
 * Claude for a neutral discussion brief, and emails it to the Members tab,
 * with the same brief attached as a PDF (also saved in the LIC Meeting Docs
 * folder).
 *
 * Uses: MeetingDocs.gs (dates, doc lookup, Members list), Code.gs (SYNTH_MODEL,
 * ANTHROPIC_API_KEY, logSynthesis).
 *
 * ONE-TIME SETUP (from the editor):
 *   1. Run previewTalkingPoints   → approve the permission prompt; the brief
 *      comes to YOUR inbox only. Read it.
 *   2. Run installFridayBrief     → from then on it sends itself every
 *      Friday-before-a-meeting at about 8am. (Run it again any time; it
 *      never creates duplicates.)
 * No redeploy is needed: this runs on a timer, not from the website.
 *
 * Other handy functions:
 *   sendTalkingPointsNow  → send to the whole Members list right now
 *   removeFridayBrief     → stop the automatic Friday send
 */

const SITE_URL = 'https://lakewood-investment-club.netlify.app/';
const BRIEF_HOUR = 8;  // local time, roughly (Google runs it within that hour)

/* ---------- setup / control ---------- */
function installFridayBrief() {
  removeFridayBrief();
  ScriptApp.newTrigger('fridayBriefCheck')
    .timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(BRIEF_HOUR).create();
  Logger.log('Friday brief is on. Next meeting: ' + formatLong_(nextMeetingDate_(new Date())) +
             ' — the brief goes out the Friday before, around ' + BRIEF_HOUR + 'am.');
}

function removeFridayBrief() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'fridayBriefCheck') ScriptApp.deleteTrigger(t);
  });
}

// Runs every Friday; only sends when the meeting is the coming Wednesday.
function fridayBriefCheck() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((nextMeetingDate_(now) - today) / 86400000);
  if (days < 4 || days > 6) { Logger.log('Not a brief week (' + days + ' days to the meeting).'); return; }
  Logger.log(JSON.stringify(sendTalkingPoints_({ preview: false })));
}

function previewTalkingPoints() { Logger.log(JSON.stringify(sendTalkingPoints_({ preview: true }))); }
function sendTalkingPointsNow() { Logger.log(JSON.stringify(sendTalkingPoints_({ preview: false }))); }

/* ---------- the brief ---------- */
function sendTalkingPoints_(opts) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { error: 'No ANTHROPIC_API_KEY script property.' };

  const meeting = nextMeetingDate_(new Date());
  const info = findMeetingDoc_(meeting);
  if (!info) return { error: 'No meeting doc yet for ' + formatLong_(meeting) + '.' };

  const docText = DocumentApp.openById(info.id).getBody().getText();
  const journals = (docText.match(/^Submitted by /gm) || []).length;
  if (!journals && !opts.preview) return { error: 'No journals in the doc yet; nothing sent.' };

  const comments = getDocComments_(info.id);
  const briefHtml = askClaudeForBrief_(key, meeting, docText, comments);

  const meetingLong = formatLong_(meeting);
  const monthName = Utilities.formatDate(meeting, tz_(), 'MMMM yyyy');
  const html = wrapBriefHtml_(briefHtml, meetingLong, info.url, journals, comments.length);

  const pdf = Utilities.newBlob(html, 'text/html', 'brief.html').getAs('application/pdf')
    .setName('LIC Talking Points — ' + monthName + '.pdf');

  const owner = Session.getEffectiveUser().getEmail();
  let bcc = [];
  if (!opts.preview) {
    getDocsFolder_().createFile(pdf.copyBlob().setName(pdf.getName()));
    bcc = memberEmails_().filter(function (e) { return e.toLowerCase() !== String(owner).toLowerCase(); });
  }

  MailApp.sendEmail({
    to: owner,
    bcc: bcc.join(','),
    subject: (opts.preview ? '[PREVIEW] ' : '') + 'LIC talking points for ' + meetingLong,
    htmlBody: html,
    attachments: [pdf],
    name: 'Lakewood Investors Club'
  });

  try { logSynthesis('[Talking points for ' + meetingLong + (opts.preview ? ', preview' : '') + ']\n\n' +
                     briefHtml.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n'), []); } catch (e) {}

  return { ok: true, preview: !!opts.preview, journals: journals, comments: comments.length,
           sentTo: 1 + bcc.length, doc: info.url };
}

/* ---------- read comments (Drive API, using the script's own sign-in) ---------- */
function getDocComments_(fileId) {
  const out = [];
  let token = '';
  do {
    const url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/comments?pageSize=100' +
      '&fields=nextPageToken,comments(author(displayName),content,quotedFileContent(value),resolved,deleted,' +
      'replies(author(displayName),content,deleted))' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Could not read the doc comments (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
    }
    const j = JSON.parse(res.getContentText());
    (j.comments || []).forEach(function (c) {
      if (c.deleted) return;
      out.push({
        who: (c.author && c.author.displayName) || 'A member',
        on: (c.quotedFileContent && c.quotedFileContent.value) || '',
        text: c.content || '',
        replies: (c.replies || []).filter(function (r) { return !r.deleted && r.content; }).map(function (r) {
          return { who: (r.author && r.author.displayName) || 'A member', text: r.content };
        })
      });
    });
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

/* ---------- Claude ---------- */
function askClaudeForBrief_(key, meeting, docText, comments) {
  const commentText = comments.length ? comments.map(function (c, i) {
    let s = (i + 1) + '. ' + c.who + (c.on ? ' (on: "' + c.on.slice(0, 200) + '")' : '') + ': ' + c.text;
    c.replies.forEach(function (r) { s += '\n   ↳ ' + r.who + ': ' + r.text; });
    return s;
  }).join('\n') : '(No comments yet.)';

  const payload = {
    model: SYNTH_MODEL,
    max_tokens: 4000,
    system:
      'You are a neutral discussion facilitator for the Lakewood Investors Club, a volunteer investment club of about ' +
      'twenty members with every level of experience. Members submit their own Trade Journals; the club discusses them ' +
      'at a monthly meeting run under Robert\'s Rules of Order and decides together. Your job is to get everyone on the ' +
      'same page BEFORE the meeting, so the meeting is spent discussing rather than looking up basic facts. ' +
      'Never grade, rank, or score submissions; never call one strong, weak, best, or worst; never tell the club to buy, ' +
      'sell, hold, approve, or pass. Present each journal fairly in its author\'s own framing, credit members by name, ' +
      'and turn disagreements and gaps into open questions. ' +
      'FACTS: for numbers, use only the figures in the journals (they were auto-filled from market data on the submission ' +
      'date). You may add one plain-English sentence of well-known background on what a company does, but do not introduce ' +
      'new statistics, prices, or news. ' +
      'Write in plain language for smart adults who are not finance professionals; explain any term a beginner might not know.',
    messages: [{
      role: 'user',
      content:
        'Meeting: ' + formatLong_(meeting) + '\n\n' +
        '=== THE MEETING DOC (all Trade Journals) ===\n' + docText.slice(0, 60000) + '\n\n' +
        '=== MEMBER COMMENTS ON THE DOC ===\n' + commentText.slice(0, 30000) + '\n\n' +
        'Write the talking-points brief. Output ONLY an HTML fragment using these tags: h2, h3, p, ul, li, strong, em. ' +
        'No other tags, no styles, no markdown, no preamble.\n\n' +
        'Sections, in this order:\n' +
        '<h2>The short version</h2> 3–5 bullets: which companies are up, who brought them, and the biggest open questions.\n' +
        '<h2>The journals</h2> One <h3> per company (group several journals on the same ticker together, naming each member). Under each:\n' +
        '  • <strong>Quick facts:</strong> what the company does in one sentence, then the key numbers from the journal (price, 1-year range, P/E, dividend, growth or income), each with a few words saying what it means.\n' +
        '  • <strong>What members wrote:</strong> a fair summary of each journal in the member\'s framing. If a journal is very brief, say so neutrally (e.g. "Bob\'s journal gives a short thesis; the meeting is a chance to hear more").\n' +
        '  • <strong>From the comments:</strong> points raised in the doc comments, credited by name (omit if none).\n' +
        '  • <strong>Questions for the meeting:</strong> 2–4 open questions.\n' +
        '<h2>Across the journals</h2> Themes, overlaps, and shared risks worth the whole club keeping in mind.\n' +
        '<h2>Suggested running order</h2> A short agenda that fits Robert\'s Rules: for each company, the member presents ' +
        '(about 3 minutes), questions, discussion, then the chair asks whether anyone wishes to make a motion. Give rough ' +
        'minutes so the business portion fits in about an hour. Do not suggest what any motion should be.'
    }]
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Claude API ' + res.getResponseCode() + ': ' + ((body.error && body.error.message) || 'request failed'));
  }
  let html = (body.content || []).map(function (b) { return b.text || ''; }).join('').trim();
  html = html.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
  // keep only the allowed tags
  return html.replace(/<(?!\/?(h2|h3|p|ul|li|strong|em)\b)[^>]*>/gi, '');
}

/* ---------- email / PDF layout (inline styles so Gmail and Outlook keep them) ---------- */
function wrapBriefHtml_(fragment, meetingLong, docUrl, journals, nComments) {
  const A = '#9a6300', INK = '#1b2530', SOFT = '#4a5764', LINE = '#dde2e8', F = 'Roboto,Arial,Helvetica,sans-serif';
  const styled = fragment
    .replace(/<h2>/g, '<h2 style="font-family:' + F + ';font-size:19px;color:' + INK + ';margin:26px 0 8px;padding-top:12px;border-top:1px solid ' + LINE + ';">')
    .replace(/<h3>/g, '<h3 style="font-family:' + F + ';font-size:16px;color:' + A + ';margin:18px 0 6px;">')
    .replace(/<p>/g, '<p style="margin:0 0 10px;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 12px;padding-left:22px;">')
    .replace(/<li>/g, '<li style="margin:0 0 6px;">');

  return '<div style="font-family:' + F + ';color:' + INK + ';max-width:700px;font-size:15px;line-height:1.55;">' +
    '<p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + A + ';font-weight:bold;margin:0 0 4px;">Lakewood Investors Club · Talking points</p>' +
    '<h1 style="font-size:24px;margin:0 0 8px;color:' + INK + ';">For our meeting on ' + meetingLong + '</h1>' +
    '<p style="margin:0 0 6px;">Here\'s a neutral summary of the ' + journals + ' Trade Journal' + (journals === 1 ? '' : 's') +
      ' and ' + nComments + ' comment' + (nComments === 1 ? '' : 's') + ' so far, so we can all arrive on the same page and spend the meeting on the good stuff.</p>' +
    '<p style="margin:0 0 4px;color:' + SOFT + ';font-size:14px;">Read every journal in full, and add your own comments, in <a href="' + docUrl +
      '" style="color:' + A + ';font-weight:bold;">this month\'s meeting doc</a>. New ideas can still be submitted on <a href="' + SITE_URL +
      '" style="color:' + A + ';font-weight:bold;">the club website</a>.</p>' +
    styled +
    '<p style="color:' + SOFT + ';font-size:12px;border-top:1px solid ' + LINE + ';padding-top:12px;margin-top:24px;">' +
      'Prepared by AI from members\' own journals and comments, to help the discussion; it does not recommend anything. ' +
      'Numbers come from market data on each submission date and may have moved since. Not investment advice: every member ' +
      'does their own research and the club decides together.</p>' +
    '</div>';
}
