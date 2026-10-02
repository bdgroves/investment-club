/**
 * Club emails around each meeting (2nd Wednesday)
 * ===============================================
 * Follows Bob's "Trade Journal Club Flow":
 *
 *  1. FRIDAY BEFORE, ~8am — "Ideas for review" email
 *     The submitted Trade Journals (short list + link to the meeting's Google
 *     Doc + the doc attached as a PDF). Asks members to review and comment.
 *
 *  2. MEETING DAY, ~7am — "Meeting-day brief" email
 *     Every member comment from the doc, grouped by stock, plus an AI summary
 *     of suggested discussion points. PDF attached and saved in Drive.
 *
 * Both go To: the script owner, Bcc: everyone in the Members tab whose
 * "Gets Club Emails" column isn't N.
 *
 * Uses MeetingDocs.gs (dates, docs, Members list) and Code.gs (SYNTH_MODEL,
 * ANTHROPIC_API_KEY, logSynthesis).
 *
 * ONE-TIME SETUP (from the editor):
 *   1. Run previewIdeasEmail and previewMeetingBrief → each comes to YOUR inbox only.
 *   2. Run installClubEmails → both go out automatically from then on.
 *      (Safe to run again; never makes duplicates.)
 * No redeploy needed: these run on timers, not from the website.
 *
 * Other handy functions:
 *   sendIdeasEmailNow / sendMeetingBriefNow → send to the whole list right now
 *   removeClubEmails → stop the automatic sends
 */

const SITE_URL = 'https://lakewood-investment-club.netlify.app/';
const IDEAS_HOUR = 8;   // Friday before, local time (Google runs it within that hour)
const BRIEF_HOUR = 7;   // meeting day

/* ---------- setup / control ---------- */
function installClubEmails() {
  removeClubEmails();
  ScriptApp.newTrigger('fridayIdeasCheck')
    .timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(IDEAS_HOUR).create();
  ScriptApp.newTrigger('meetingDayCheck')
    .timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(BRIEF_HOUR).create();
  const next = nextMeetingDate_(new Date());
  Logger.log('Club emails are on. Next meeting ' + formatLong_(next) +
    ': ideas email the Friday before (~' + IDEAS_HOUR + 'am), meeting-day brief that morning (~' + BRIEF_HOUR + 'am).');
}

function removeClubEmails() {
  const handlers = ['fridayIdeasCheck', 'meetingDayCheck', 'fridayBriefCheck'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}
// Older names, kept so nothing breaks if they're run.
function installFridayBrief() { installClubEmails(); }
function removeFridayBrief() { removeClubEmails(); }

// Runs every Friday; sends only when the meeting is the coming Wednesday.
function fridayIdeasCheck() {
  const now = new Date();
  const days = Math.round((nextMeetingDate_(now) - startOfDay_(now)) / 86400000);
  if (days < 4 || days > 6) { Logger.log('Not a meeting week (' + days + ' days out).'); return; }
  Logger.log(JSON.stringify(sendIdeasEmail_({ preview: false })));
}
// Old trigger name from the first version; behaves like the new Friday check.
function fridayBriefCheck() { fridayIdeasCheck(); }

// Runs every Wednesday; sends only on the 2nd Wednesday.
function meetingDayCheck() {
  const now = new Date();
  if (!meetingIsToday_(now)) { Logger.log('Not a meeting day.'); return; }
  Logger.log(JSON.stringify(sendMeetingBrief_({ preview: false })));
}

function previewIdeasEmail()   { Logger.log(JSON.stringify(sendIdeasEmail_({ preview: true }))); }
function sendIdeasEmailNow()   { Logger.log(JSON.stringify(sendIdeasEmail_({ preview: false }))); }
function previewMeetingBrief() { Logger.log(JSON.stringify(sendMeetingBrief_({ preview: true }))); }
function sendMeetingBriefNow() { Logger.log(JSON.stringify(sendMeetingBrief_({ preview: false }))); }
// Older names.
function previewTalkingPoints() { previewMeetingBrief(); }
function sendTalkingPointsNow() { sendMeetingBriefNow(); }

/* ---------- which meeting ---------- */
function startOfDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function meetingIsToday_(now) {
  const m = nthWeekdayOfMonth_(now.getFullYear(), now.getMonth());
  return m.getTime() === startOfDay_(now).getTime();
}
// On meeting day, "the meeting" is today's; otherwise the next one.
function targetMeeting_() {
  const now = new Date();
  return meetingIsToday_(now) ? startOfDay_(now) : nextMeetingDate_(now);
}

/* ---------- shared bits ---------- */
function recipients_(preview) {
  const owner = Session.getEffectiveUser().getEmail();
  if (preview) return { owner: owner, bcc: [] };
  return {
    owner: owner,
    bcc: memberEmails_().filter(function (e) { return e.toLowerCase() !== String(owner).toLowerCase(); })
  };
}

// The doc's journals, parsed back out of the doc text: [{title, member, thesis}]
function journalsFromDoc_(docText) {
  const lines = docText.split('\n').map(function (l) { return l.trim(); });
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Submitted by ') !== 0) continue;
    const title = lines[i - 1] || '';
    const member = lines[i].replace(/^Submitted by /, '').replace(/ · .*$/, '');
    let thesis = '';
    for (let j = i + 1; j < Math.min(lines.length, i + 60); j++) {
      if (lines[j] === 'Core thesis') { thesis = lines[j + 1] || ''; break; }
      if (lines[j].indexOf('Submitted by ') === 0) break;
    }
    out.push({ title: title, member: member, thesis: thesis });
  }
  return out;
}

function docPdf_(info, name) {
  return DriveApp.getFileById(info.id).getAs('application/pdf').setName(name);
}

const A_ = '#9a6300', INK_ = '#1b2530', SOFT_ = '#4a5764', LINE_ = '#dde2e8', F_ = 'Roboto,Arial,Helvetica,sans-serif';
function esc2_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function header_(kicker, title) {
  return '<p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + A_ + ';font-weight:bold;margin:0 0 4px;">Lakewood Investors Club · ' + kicker + '</p>' +
    '<h1 style="font-size:24px;margin:0 0 10px;color:' + INK_ + ';">' + title + '</h1>';
}
function footer_(extra) {
  return '<p style="color:' + SOFT_ + ';font-size:12px;border-top:1px solid ' + LINE_ + ';padding-top:12px;margin-top:24px;">' +
    (extra ? extra + ' ' : '') + 'Numbers come from market data on each submission date and may have moved since. ' +
    'Shared for club discussion. Not investment advice: every member does their own research and the club decides together.</p>';
}

/* ---------- 1. Friday: ideas for review ---------- */
function sendIdeasEmail_(opts) {
  const meeting = targetMeeting_();
  const info = findMeetingDoc_(meeting);
  if (!info) return { error: 'No meeting doc yet for ' + formatLong_(meeting) + '.' };

  const docText = DocumentApp.openById(info.id).getBody().getText();
  const journals = journalsFromDoc_(docText);
  if (!journals.length && !opts.preview) return { error: 'No journals in the doc yet; nothing sent.' };

  const meetingLong = formatLong_(meeting);
  const monthName = Utilities.formatDate(meeting, tz_(), 'MMMM yyyy');
  const dayBefore = Utilities.formatDate(new Date(meeting.getTime() - 86400000), tz_(), 'EEEE, MMMM d');

  let list = '';
  journals.forEach(function (j) {
    list += '<li style="margin:0 0 10px;"><strong>' + esc2_(j.title) + '</strong> <span style="color:' + SOFT_ + ';">from ' + esc2_(j.member) + '</span>' +
      (j.thesis ? '<br><span style="color:' + SOFT_ + ';font-size:14px;">' + esc2_(j.thesis.length > 220 ? j.thesis.slice(0, 217) + '…' : j.thesis) + '</span>' : '') + '</li>';
  });

  const html = '<div style="font-family:' + F_ + ';color:' + INK_ + ';max-width:680px;font-size:15px;line-height:1.55;">' +
    header_('Ideas for review', 'Trade ideas for our ' + meetingLong + ' meeting') +
    '<p style="margin:0 0 12px;">Here ' + (journals.length === 1 ? 'is the 1 idea' : 'are the ' + journals.length + ' ideas') +
      ' submitted for this month. Please read them, do a little of your own research, and leave your thoughts as comments in ' +
      '<a href="' + info.url + '" style="color:' + A_ + ';font-weight:bold;">the meeting doc</a> by <strong>' + dayBefore + '</strong>.</p>' +
    (journals.length ? '<ul style="margin:0 0 14px;padding-left:22px;">' + list + '</ul>' : '<p><em>(No ideas submitted yet.)</em></p>') +
    '<p style="margin:0 0 10px;">Everyone sees everyone\'s comments as they\'re added; just refresh the doc. ' +
      'The full journals are also attached as a PDF to read offline.</p>' +
    '<p style="margin:0 0 10px;">On the morning of the meeting you\'ll get a second email with all the comments and an AI summary of suggested discussion points.</p>' +
    '<p style="margin:0 0 4px;color:' + SOFT_ + ';font-size:14px;">New to commenting? <a href="' + SITE_URL + 'How-to-Comment-in-the-Meeting-Doc.pdf" style="color:' + A_ + ';">Here\'s a one-page how-to</a>. ' +
      'Have an idea of your own? Submit it on <a href="' + SITE_URL + '" style="color:' + A_ + ';">the club website</a>.</p>' +
    footer_('') + '</div>';

  const r = recipients_(opts.preview);
  MailApp.sendEmail({
    to: r.owner, bcc: r.bcc.join(','),
    subject: (opts.preview ? '[PREVIEW] ' : '') + 'LIC trade ideas for review: ' + meetingLong + ' meeting',
    htmlBody: html,
    attachments: [docPdf_(info, 'LIC Trade Ideas — ' + monthName + '.pdf')],
    name: 'Lakewood Investors Club'
  });
  return { ok: true, email: 'ideas', preview: !!opts.preview, journals: journals.length, sentTo: 1 + r.bcc.length, doc: info.url };
}

/* ---------- 2. Meeting day: comments + AI discussion points ---------- */
function sendMeetingBrief_(opts) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { error: 'No ANTHROPIC_API_KEY script property.' };

  const meeting = targetMeeting_();
  const info = findMeetingDoc_(meeting);
  if (!info) return { error: 'No meeting doc for ' + formatLong_(meeting) + '.' };

  const docText = DocumentApp.openById(info.id).getBody().getText();
  const journals = journalsFromDoc_(docText);
  if (!journals.length && !opts.preview) return { error: 'No journals in the doc; nothing sent.' };

  const comments = getDocComments_(info.id);
  const aiHtml = askClaudeForBrief_(key, meeting, docText, comments);
  const meetingLong = formatLong_(meeting);
  const monthName = Utilities.formatDate(meeting, tz_(), 'MMMM yyyy');
  const html = wrapBriefHtml_(aiHtml, commentsHtml_(comments, journals, docText), meetingLong, info.url, journals.length, comments.length);

  const pdf = Utilities.newBlob(html, 'text/html', 'brief.html').getAs('application/pdf')
    .setName('LIC Meeting Brief — ' + monthName + '.pdf');
  if (!opts.preview) getDocsFolder_().createFile(pdf.copyBlob().setName(pdf.getName()));

  const r = recipients_(opts.preview);
  MailApp.sendEmail({
    to: r.owner, bcc: r.bcc.join(','),
    subject: (opts.preview ? '[PREVIEW] ' : '') + 'LIC meeting brief: comments and discussion points for ' + meetingLong,
    htmlBody: html,
    attachments: [pdf],
    name: 'Lakewood Investors Club'
  });

  try { logSynthesis('[Meeting brief for ' + meetingLong + (opts.preview ? ', preview' : '') + ']\n\n' +
                     aiHtml.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n'), []); } catch (e) {}

  return { ok: true, email: 'brief', preview: !!opts.preview, journals: journals.length, comments: comments.length,
           sentTo: 1 + r.bcc.length, doc: info.url };
}

// Every comment, verbatim, grouped under the stock it's attached to
// (found by where the commented-on words sit in the doc).
function commentsHtml_(comments, journals, docText) {
  if (!comments.length) return '<p style="color:' + SOFT_ + ';"><em>No comments were left in the doc this month.</em></p>';
  const starts = journals.map(function (j) {
    const at = docText.indexOf(j.title + '\nSubmitted by ' + j.member);
    return { title: j.title, at: at === -1 ? docText.indexOf(j.title) : at };
  });
  const groups = {}, order = [];
  comments.forEach(function (c) {
    let g = 'General comments';
    const pos = c.on ? docText.indexOf(c.on.slice(0, 80)) : -1;
    if (pos !== -1) {
      starts.forEach(function (s) { if (s.at !== -1 && s.at <= pos) g = s.title; });
    }
    if (!groups[g]) { groups[g] = []; order.push(g); }
    groups[g].push(c);
  });
  let h = '';
  order.forEach(function (g) {
    h += '<h3 style="font-family:' + F_ + ';font-size:16px;color:' + A_ + ';margin:16px 0 6px;">' + esc2_(g) + '</h3>';
    groups[g].forEach(function (c) {
      h += '<div style="border-left:3px solid ' + LINE_ + ';padding:2px 0 2px 12px;margin:0 0 12px;">' +
        (c.on ? '<div style="color:' + SOFT_ + ';font-size:13px;font-style:italic;margin-bottom:3px;">On: "' + esc2_(c.on.length > 160 ? c.on.slice(0, 157) + '…' : c.on) + '"</div>' : '') +
        '<div><strong>' + esc2_(c.who) + ':</strong> ' + esc2_(c.text) + '</div>';
      c.replies.forEach(function (rp) {
        h += '<div style="margin:4px 0 0 16px;"><strong>' + esc2_(rp.who) + ':</strong> ' + esc2_(rp.text) + '</div>';
      });
      h += '</div>';
    });
  });
  return h;
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
  }).join('\n') : '(No comments.)';

  const payload = {
    model: SYNTH_MODEL,
    max_tokens: 4000,
    system:
      'You are a neutral discussion facilitator for the Lakewood Investors Club, a volunteer investment club of about ' +
      'twenty members with every level of experience. Members submit Trade Journals, review and comment on each other\'s ' +
      'ideas before the meeting, and the club discusses and decides together under Robert\'s Rules of Order. ' +
      'Your job is to make the meeting productive: get everyone on the same page so the time goes to discussion, not to ' +
      'looking up basic facts. Never grade, rank, or score submissions; never call one strong, weak, best, or worst; never ' +
      'tell the club to buy, sell, hold, approve, or pass. Present each journal fairly in its author\'s own framing, credit ' +
      'members by name, and turn disagreements and gaps into open questions. ' +
      'FACTS: for numbers, use only the figures in the journals (auto-filled from market data on the submission date). ' +
      'You may add one plain-English sentence of well-known background on what a company does, but do not introduce new ' +
      'statistics, prices, or news. Plain language for smart adults who are not finance professionals; explain any term a ' +
      'beginner might not know.',
    messages: [{
      role: 'user',
      content:
        'Meeting: ' + formatLong_(meeting) + ' (today)\n\n' +
        '=== THE MEETING DOC (all Trade Journals) ===\n' + docText.slice(0, 60000) + '\n\n' +
        '=== MEMBER COMMENTS ON THE DOC ===\n' + commentText.slice(0, 30000) + '\n\n' +
        'Write the AI discussion points for today\'s meeting. Members will also see every comment verbatim in the same ' +
        'email, so summarize and connect rather than repeat them. Output ONLY an HTML fragment using these tags: h2, h3, ' +
        'p, ul, li, strong, em. No other tags, no styles, no markdown, no preamble.\n\n' +
        'Sections, in this order:\n' +
        '<h2>The short version</h2> 3–5 bullets: which ideas are up, who brought them, where members agree, and the biggest open questions.\n' +
        '<h2>Suggested discussion points</h2> One <h3> per company (group several journals on the same ticker together, naming each member). Under each:\n' +
        '  • <strong>Quick facts:</strong> what the company does in one sentence, then the key numbers from the journal (price, 1-year range, P/E, dividend, growth or income), each with a few words saying what it means.\n' +
        '  • <strong>What members wrote and said:</strong> a fair summary of the journal(s) and of the comment discussion, credited by name. If a journal is very brief, say so neutrally.\n' +
        '  • <strong>Points to discuss:</strong> 2–4 open questions, drawing especially on unresolved points from the comments.\n' +
        '<h2>Across the ideas</h2> Themes, overlaps, and shared risks worth the whole club keeping in mind.\n' +
        '<h2>Possible running order</h2> A short suggested order with rough minutes so the business portion fits in about ' +
        'an hour: for each idea, the member presents (about 3 minutes), questions, discussion, then the chair asks whether ' +
        'anyone wishes to make a motion. Note that the President, Treasurer and Secretary set the final priorities if time ' +
        'is short. Do not suggest what any motion should be.'
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
  return html.replace(/<(?!\/?(h2|h3|p|ul|li|strong|em)\b)[^>]*>/gi, '');  // allowed tags only
}

/* ---------- meeting-day email / PDF layout (inline styles for Gmail and Outlook) ---------- */
function wrapBriefHtml_(aiFragment, commentsBlock, meetingLong, docUrl, journals, nComments) {
  const styled = aiFragment
    .replace(/<h2>/g, '<h2 style="font-family:' + F_ + ';font-size:19px;color:' + INK_ + ';margin:26px 0 8px;padding-top:12px;border-top:1px solid ' + LINE_ + ';">')
    .replace(/<h3>/g, '<h3 style="font-family:' + F_ + ';font-size:16px;color:' + A_ + ';margin:18px 0 6px;">')
    .replace(/<p>/g, '<p style="margin:0 0 10px;">')
    .replace(/<ul>/g, '<ul style="margin:0 0 12px;padding-left:22px;">')
    .replace(/<li>/g, '<li style="margin:0 0 6px;">');

  return '<div style="font-family:' + F_ + ';color:' + INK_ + ';max-width:700px;font-size:15px;line-height:1.55;">' +
    header_('Meeting-day brief', 'For tonight\'s meeting: ' + meetingLong) +
    '<p style="margin:0 0 6px;">Here are all ' + nComments + ' member comment' + (nComments === 1 ? '' : 's') + ' on this month\'s ' +
      journals + ' trade idea' + (journals === 1 ? '' : 's') + ', followed by an AI summary of suggested discussion points.</p>' +
    '<p style="margin:0 0 4px;color:' + SOFT_ + ';font-size:14px;">The full journals, with comments in place, are in <a href="' + docUrl +
      '" style="color:' + A_ + ';font-weight:bold;">the meeting doc</a>.</p>' +
    '<h2 style="font-family:' + F_ + ';font-size:19px;color:' + INK_ + ';margin:26px 0 8px;padding-top:12px;border-top:1px solid ' + LINE_ + ';">What members said in the doc</h2>' +
    commentsBlock +
    '<p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + A_ + ';font-weight:bold;margin:30px 0 0;padding-top:14px;border-top:2px solid ' + A_ + ';">AI summary · suggested discussion points</p>' +
    styled +
    footer_('The AI summary is prepared from members\' own journals and comments to help the discussion; it does not recommend anything.') +
    '</div>';
}
