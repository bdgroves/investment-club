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
 * Each member gets their OWN copy ("Hi Ken,"), sent through the owner's Gmail,
 * to everyone in the Members tab whose "Gets Club Emails" column isn't N.
 * (One email per person lands in inboxes far more reliably than a Bcc blast.)
 *
 * COMMENTS WITHOUT GOOGLE (Nov 2026 field notes): members who don't use Google
 * Docs can still have their say, two ways:
 *   - Reply to the Friday email. syncEmailReplies() (daily ~6pm, and again
 *     right before the meeting-day brief) collects replies.
 *   - Comment box on the website (ideas.html → ?action=comment).
 * Both are saved in the "Comments" tab, copied into the meeting doc under the
 * right idea, and included in the meeting-day brief.
 *
 *  3. MORNING AFTER, ~8am — "What did we decide?" email to the officers
 *     (Members tab Role = Secretary or Treasurer; change the Role column each
 *     year). They just hit Reply in plain words. ~5 days after the meeting the
 *     whole club gets a short follow-up of the decisions, and they're recorded
 *     in the Submissions tab (Status + Notes) and a Decisions tab.
 *
 * Uses MeetingDocs.gs (dates, docs, Members list) and Code.gs (SYNTH_MODEL,
 * ANTHROPIC_API_KEY, logSynthesis).
 *
 * ONE-TIME SETUP (from the editor):
 *   1. Run previewIdeasEmail and previewMeetingBrief → each comes to YOUR inbox only.
 *   2. Run installClubEmails → both go out automatically from then on, and email
 *      replies are collected daily. (Safe to run again; never makes duplicates.)
 * The website comment box needs Code.gs's handleClubAction_ hook and a new
 * deployment version (Deploy → Manage deployments → ✏️ → New version).
 *
 * Other handy functions:
 *   sendIdeasEmailNow / sendMeetingBriefNow → send to the whole list right now
 *   removeClubEmails → stop the automatic sends
 *   resendIdeasEmailToComcast → resend this cycle's ideas email to Comcast members
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
  ScriptApp.newTrigger('syncEmailReplies').timeBased().everyDays(1).atHour(18).create();
  ScriptApp.newTrigger('afterMeetingCheck').timeBased().everyDays(1).atHour(8).create();
  // Only replies that arrive from now on count as comments (not earlier "how do I…?" emails).
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('REPLY_SYNC_SINCE')) props.setProperty('REPLY_SYNC_SINCE', String(Date.now()));
  const next = nextMeetingDate_(new Date());
  Logger.log('Club emails are on. Next meeting ' + formatLong_(next) +
    ': ideas email the Friday before (~' + IDEAS_HOUR + 'am), meeting-day brief that morning (~' + BRIEF_HOUR + 'am).');
}

function removeClubEmails() {
  const handlers = ['fridayIdeasCheck', 'meetingDayCheck', 'fridayBriefCheck', 'syncEmailReplies', 'afterMeetingCheck'];
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
// Send through Gmail itself (GmailApp), not MailApp. MailApp mail carries a
// "...@maestro.bounces.google.com" return address, which Comcast rejects
// ("530 5.1.0 sender rejected"), so comcast.net members never got it.
function sendClubMail_(m) {
  const plain = String(m.htmlBody).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h1|h2|h3|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  const options = { htmlBody: m.htmlBody, attachments: m.attachments || [], name: m.name || 'Lakewood Investors Club' };
  if (m.bcc) options.bcc = m.bcc;
  GmailApp.sendEmail(m.to, m.subject, plain, options);
}

// One-off: resend this cycle's ideas email straight to the given addresses.
function resendIdeasEmailTo_(addresses) {
  Logger.log(JSON.stringify(sendIdeasEmail_({ preview: false, onlyTo: addresses })));
}
// Resend the ideas email to every Comcast address in the Members tab
// (they bounced on the first send, Nov 6, 2026).
function resendIdeasEmailToComcast() {
  resendIdeasEmailTo_(memberEmails_().filter(function (e) { return /@comcast\.net$/i.test(e); }));
}

// Members who get club emails: [{name, email}]
function memberList_() {
  const rows = getMembersSheet_().getDataRange().getValues().slice(1);
  return rows
    .filter(function (r) { return String(r[1]).indexOf('@') > 0 && String(r[3]).trim().toUpperCase() !== 'N'; })
    .map(function (r) { return { name: String(r[0]).trim(), email: String(r[1]).trim() }; });
}
function memberNameFor_(email) {
  const e = String(email).toLowerCase();
  const m = memberList_().filter(function (x) { return x.email.toLowerCase() === e; })[0];
  return m ? m.name : '';
}

// Send each member their own copy, greeted by first name. htmlTemplate holds
// a {{GREETING}} placeholder. Preview → owner only. onlyEmails → just those.
function sendToMembers_(preview, subject, htmlTemplate, attachments, onlyEmails) {
  const owner = Session.getEffectiveUser().getEmail();
  let list;
  if (preview) {
    list = [{ name: memberNameFor_(owner), email: owner }];
  } else {
    list = memberList_();
    if (onlyEmails) {
      const want = onlyEmails.map(function (e) { return String(e).toLowerCase(); });
      list = list.filter(function (m) { return want.indexOf(m.email.toLowerCase()) !== -1; });
    }
    if (!list.some(function (m) { return m.email.toLowerCase() === String(owner).toLowerCase(); })) {
      list.push({ name: memberNameFor_(owner), email: owner });   // owner always gets a copy
    }
  }
  const quota = MailApp.getRemainingDailyQuota();
  if (quota < list.length) return { error: 'Gmail daily limit: only ' + quota + ' sends left today, need ' + list.length + '.' };
  let sent = 0;
  const failed = [];
  list.forEach(function (m) {
    const first = m.name ? m.name.split(/\s+/)[0] : '';
    const greeting = '<p style="margin:0 0 12px;">' + (first ? 'Hi ' + esc2_(first) + ',' : 'Hi there,') + '</p>';
    try {
      sendClubMail_({ to: m.email, subject: subject, htmlBody: htmlTemplate.replace('{{GREETING}}', greeting), attachments: attachments });
      sent++;
    } catch (e) {
      failed.push(m.email + ': ' + e);
    }
  });
  return { sent: sent, failed: failed };
}

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

  const ideasUrl = SITE_URL + 'ideas.html';
  const html = '<div style="font-family:' + F_ + ';color:' + INK_ + ';max-width:680px;font-size:15px;line-height:1.55;">' +
    header_('Ideas for review', 'Trade ideas for our ' + meetingLong + ' meeting') +
    '{{GREETING}}' +
    '<p style="margin:0 0 12px;">Here ' + (journals.length === 1 ? 'is the 1 idea' : 'are the ' + journals.length + ' ideas') +
      ' submitted for this month. Please take a look and share your thoughts by <strong>' + dayBefore + '</strong>.</p>' +
    (journals.length ? '<ul style="margin:0 0 14px;padding-left:22px;">' + list + '</ul>' : '<p><em>(No ideas submitted yet.)</em></p>') +
    '<table cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr><td align="center" bgcolor="' + A_ + '" style="border-radius:8px;">' +
      '<a href="' + ideasUrl + '" style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Click here to read the ideas and add a comment &rarr;</a>' +
    '</td></tr></table>' +
    '<p style="margin:0 0 6px;"><strong>Three easy ways to share your thoughts</strong> (pick whichever suits you):</p>' +
    '<ol style="margin:0 0 14px;padding-left:22px;">' +
      '<li style="margin:0 0 6px;"><strong>Just hit Reply</strong> and type what you think. Mention which stock you mean. No account needed.</li>' +
      '<li style="margin:0 0 6px;"><strong>The comment box on the club website</strong>: the button above. Type your name and your thoughts. No account needed.</li>' +
      '<li style="margin:0 0 6px;"><strong>The Google Doc</strong>, if you use Google: <a href="' + info.url + '" style="color:' + A_ + ';font-weight:bold;">open the meeting doc</a> and highlight words to comment.</li>' +
    '</ol>' +
    '<p style="margin:0 0 10px;">All three end up in the same place: in the meeting doc next to the idea, and in the meeting-day email. ' +
      'The full journals are also attached as a PDF to read offline.</p>' +
    '<p style="margin:0 0 10px;">On the morning of the meeting you\'ll get a second email with everyone\'s comments and an AI summary of suggested discussion points.</p>' +
    '<p style="margin:0 0 4px;color:' + SOFT_ + ';font-size:14px;">Have an idea of your own? Submit it on <a href="' + SITE_URL + '" style="color:' + A_ + ';">the club website</a>.</p>' +
    footer_('') + '</div>';

  const res = sendToMembers_(!!opts.preview,
    (opts.preview ? '[PREVIEW] ' : '') + 'LIC trade ideas for review: ' + meetingLong + ' meeting',
    html, [docPdf_(info, 'LIC Trade Ideas — ' + monthName + '.pdf')], opts.onlyTo);
  if (res.error) return res;
  return { ok: true, email: 'ideas', preview: !!opts.preview, journals: journals.length, sent: res.sent, failed: res.failed, doc: info.url };
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

  if (!opts.preview) { try { syncEmailReplies(); } catch (e) { console.error('Reply sync failed: ' + e); } }
  const docText2 = DocumentApp.openById(info.id).getBody().getText();   // includes any just-synced replies
  const comments = getDocComments_(info.id).concat(tabCommentsForBrief_(meeting));
  const aiHtml = askClaudeForBrief_(key, meeting, docText2, comments);
  const meetingLong = formatLong_(meeting);
  const monthName = Utilities.formatDate(meeting, tz_(), 'MMMM yyyy');
  const html = wrapBriefHtml_(aiHtml, commentsHtml_(comments, journals, docText2), meetingLong, info.url, journals.length, comments.length);

  const pdf = Utilities.newBlob(html.replace('{{GREETING}}', ''), 'text/html', 'brief.html').getAs('application/pdf')
    .setName('LIC Meeting Brief — ' + monthName + '.pdf');
  if (!opts.preview) getDocsFolder_().createFile(pdf.copyBlob().setName(pdf.getName()));

  const res = sendToMembers_(!!opts.preview,
    (opts.preview ? '[PREVIEW] ' : '') + 'LIC meeting brief: comments and discussion points for ' + meetingLong,
    html, [pdf]);
  if (res.error) return res;

  try { logSynthesis('[Meeting brief for ' + meetingLong + (opts.preview ? ', preview' : '') + ']\n\n' +
                     aiHtml.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n'), []); } catch (e) {}

  return { ok: true, email: 'brief', preview: !!opts.preview, journals: journals.length, comments: comments.length,
           sent: res.sent, failed: res.failed, doc: info.url };
}

// Every comment, verbatim, grouped under the stock it's attached to
// (found by where the commented-on words sit in the doc).
function commentsHtml_(comments, journals, docText) {
  if (!comments.length) return '<p style="color:' + SOFT_ + ';"><em>No comments this month.</em></p>';
  const starts = journals.map(function (j) {
    const at = docText.indexOf(j.title + '\nSubmitted by ' + j.member);
    return { title: j.title, at: at === -1 ? docText.indexOf(j.title) : at };
  });
  const groups = {}, order = [];
  comments.forEach(function (c) {
    let g = 'General comments';
    const pos = c.title ? -1 : (c.on ? docText.indexOf(c.on.slice(0, 80)) : -1);
    if (c.title) g = c.title;
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
        '<div><strong>' + esc2_(c.who) + (c.via ? ' <span style="color:' + SOFT_ + ';font-weight:normal;font-size:13px;">(' + esc2_(c.via) + ')</span>' : '') + ':</strong> ' + esc2_(c.text) + '</div>';
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
    let s = (i + 1) + '. ' + c.who + (c.via ? ' [' + c.via + ']' : '') + (c.title ? ' (about ' + c.title + ')' : '') +
      (c.on ? ' (on: "' + c.on.slice(0, 200) + '")' : '') + ': ' + c.text;
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
      'FAIRNESS: give every journal the same even-handed treatment. Never single out a journal as thin, weak, less ' +
      'researched, or relying on informal reasoning; never correct or contradict a member\'s wording; never suggest club ' +
      'rules or norms prompted by one member\'s journal. If a journal is brief, simply summarize what it says and turn the ' +
      'gaps into friendly, open questions for the member to expand on at the meeting. ' +
      'QUOTES: put words in quotation marks only if they appear verbatim in a journal or comment. ' +
      'Leave out political remarks or asides entirely. Count journals accurately (one per "Submitted by" line). ' +
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
    '{{GREETING}}' +
    '<p style="margin:0 0 6px;">Here are all ' + nComments + ' member comment' + (nComments === 1 ? '' : 's') + ' (from the doc, the website and email replies) on this month\'s ' +
      journals + ' trade idea' + (journals === 1 ? '' : 's') + ', followed by an AI summary of suggested discussion points.</p>' +
    '<p style="margin:0 0 4px;color:' + SOFT_ + ';font-size:14px;">The full journals, with comments in place, are in <a href="' + docUrl +
      '" style="color:' + A_ + ';font-weight:bold;">the meeting doc</a>.</p>' +
    '<h2 style="font-family:' + F_ + ';font-size:19px;color:' + INK_ + ';margin:26px 0 8px;padding-top:12px;border-top:1px solid ' + LINE_ + ';">What members said</h2>' +
    commentsBlock +
    '<p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + A_ + ';font-weight:bold;margin:30px 0 0;padding-top:14px;border-top:2px solid ' + A_ + ';">AI summary · suggested discussion points</p>' +
    styled +
    footer_('The AI summary is prepared from members\' own journals and comments to help the discussion; it does not recommend anything.') +
    '</div>';
}

/* =====================================================================
 * COMMENTS WITHOUT GOOGLE: website comment box + email replies
 * ===================================================================== */
const COMMENTS_TAB = 'Comments';

// Called from Code.gs doGet: ?action=ideas | ?action=comment&data={...}
function handleClubAction_(action, e) {
  try {
    if (action === 'ideas') return ideasForWeb();
    if (action === 'comment') return addWebComment(JSON.parse((e && e.parameter && e.parameter.data) || '{}'));
  } catch (err) {
    return { error: String(err) };
  }
  return null;
}

function getCommentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(COMMENTS_TAB);
  if (!sh) {
    sh = ss.insertSheet(COMMENTS_TAB);
    sh.appendRow(['Timestamp', 'Meeting Date', 'Journal ID', 'Ticker', 'Name', 'Comment', 'Source', 'Email Message ID']);
    styleHeader_(sh, 8);
    sh.setColumnWidth(5, 160); sh.setColumnWidth(6, 420);
  }
  return sh;
}

// This meeting's journals, from the Submissions tab. A submission belongs to
// the first meeting after the day it was sent (same rule as the meeting doc).
function cycleIdeas_(meeting) {
  const key = dateKey_(meeting);
  const rows = getSheet().getDataRange().getValues().slice(1);
  return rows.map(function (row) {
    const t = {};
    FIELDS.forEach(function (f, i) { t[f.key] = row[i]; });
    return t;
  }).filter(function (t) {
    if (!t.ticker || !t.timestamp) return false;
    const ts = new Date(t.timestamp);
    return !isNaN(ts.getTime()) && dateKey_(nextMeetingDate_(ts)) === key;
  });
}
// Exactly as MeetingDocs.gs writes the heading in the doc.
function docTitle_(t) { return String(t.ticker).toUpperCase() + (t.stock ? ' — ' + t.stock : ''); }
function ideaTitle_(t) {
  const tk = String(t.ticker).toUpperCase(), name = String(t.stock || '').trim();
  return tk + (name && name.toUpperCase() !== tk ? ' — ' + name : '');
}

function tabComments_(meeting) {
  const key = dateKey_(meeting);
  return getCommentsSheet_().getDataRange().getValues().slice(1).filter(function (r) {
    const k = r[1] instanceof Date ? dateKey_(r[1]) : String(r[1]);
    return k === key && String(r[5]).trim();
  }).map(function (r) {
    return { when: r[0], id: String(r[2]), ticker: String(r[3]), who: String(r[4]), text: String(r[5]),
             via: String(r[6]) === 'email' ? 'by email' : 'via website', msgId: String(r[7] || '') };
  });
}
// In the shape commentsHtml_ / the AI prompt expect.
function tabCommentsForBrief_(meeting) {
  const ideas = cycleIdeas_(meeting);
  return tabComments_(meeting).map(function (c) {
    const idea = ideas.filter(function (t) { return String(t.id) === c.id; })[0];
    return { who: c.who, text: c.text, on: '', replies: [], via: c.via, title: idea ? ideaTitle_(idea) : '' };
  });
}

/* ---------- the website's "This month's ideas" page ---------- */
function ideasForWeb() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ideas_web');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  const meeting = targetMeeting_();
  const info = findMeetingDoc_(meeting);
  const ideas = cycleIdeas_(meeting).map(function (t) {
    const ts = new Date(t.timestamp);
    return {
      id: String(t.id), ticker: String(t.ticker).toUpperCase(), stock: t.stock || '', member: t.member || '',
      submitted: Utilities.formatDate(ts, tz_(), 'MMM d'),
      price: t.shareValue, low52: t.low52, high52: t.high52, pe: t.peRatio, beta: t.beta,
      dividend: t.dividend, dividendFreq: t.dividendFreq, sector: t.sector, growthIncome: t.growthIncome,
      entryTarget: t.entryTarget, exit: t.exit,
      whyPicked: t.whyPicked || '', thesis: t.thesis || '', moat: t.moat || '', whyNow: t.whyNow || '',
      pros: t.pros || '', cons: t.cons || '', management: t.management || '',
      comments: []
    };
  });
  const byId = {};
  ideas.forEach(function (i) { byId[i.id] = i; });
  const general = [];

  // website + email comments
  tabComments_(meeting).forEach(function (c) {
    const item = { who: c.who, text: c.text, via: c.via };
    if (byId[c.id]) byId[c.id].comments.push(item); else general.push(item);
  });

  // Google Doc comments, matched to an idea by where the commented words sit
  if (info) {
    try {
      const docText = DocumentApp.openById(info.id).getBody().getText();
      const journals = journalsFromDoc_(docText);
      const starts = journals.map(function (j) {
        const at = docText.indexOf(j.title + '\nSubmitted by ' + j.member);
        return { j: j, at: at === -1 ? docText.indexOf(j.title) : at };
      });
      getDocComments_(info.id).forEach(function (c) {
        const pos = c.on ? docText.indexOf(c.on.slice(0, 80)) : -1;
        let j = null;
        if (pos !== -1) starts.forEach(function (s) { if (s.at !== -1 && s.at <= pos) j = s.j; });
        const item = { who: c.who, text: c.text, via: 'in the Google Doc',
                       replies: c.replies.map(function (r) { return { who: r.who, text: r.text }; }) };
        const idea = j ? ideas.filter(function (i) {
          return j.title.indexOf(i.ticker + ' — ') === 0 && (!i.member || i.member === j.member);
        })[0] : null;
        if (idea) idea.comments.push(item); else general.push(item);
      });
    } catch (e) { console.error('Doc comments unavailable: ' + e); }
  }

  const out = { meetingDate: formatLong_(meeting), docUrl: info ? info.url : '', ideas: ideas, general: general };
  try { cache.put('ideas_web', JSON.stringify(out), 90); } catch (e) {}
  return out;
}

/* ---------- comment box on the website ---------- */
function addWebComment(p) {
  const name = String(p.name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  const text = String(p.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 2000);
  if (!name) return { error: 'Please type your name.' };
  if (text.length < 2) return { error: 'Please type a comment.' };

  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('cmt_rate') || 0);
  if (n > 40) return { error: 'Lots of comments just now. Please try again in a few minutes.' };
  cache.put('cmt_rate', String(n + 1), 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const meeting = targetMeeting_();
    const idea = cycleIdeas_(meeting).filter(function (t) { return String(t.id) === String(p.id); })[0] || null;
    getCommentsSheet_().appendRow([new Date(), dateKey_(meeting), idea ? String(idea.id) : '', idea ? String(idea.ticker).toUpperCase() : '',
                                   name, text, 'website', '']);
    const info = findMeetingDoc_(meeting);
    if (info) { try { insertCommentIntoDoc_(info, idea, name, 'via website', text); } catch (e) { console.error('Doc insert failed: ' + e); } }
    cache.remove('ideas_web');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// Put "💬 Name (via website, Nov 9): text" at the end of that idea's section
// in the meeting doc (or at the very end if it isn't about one idea).
function insertCommentIntoDoc_(info, idea, who, via, text) {
  const doc = DocumentApp.openById(info.id);
  const body = doc.getBody();
  const when = Utilities.formatDate(new Date(), tz_(), 'MMM d');
  const label = '💬 ' + who + ' (' + via + ', ' + when + '): ';
  let at = -1;
  if (idea) {
    const title = docTitle_(idea);
    const n = body.getNumChildren();
    for (let i = 0; i < n - 1 && at === -1; i++) {
      const el = body.getChild(i);
      if (el.getType() !== DocumentApp.ElementType.PARAGRAPH || el.asParagraph().getText().trim() !== title) continue;
      const next = body.getChild(i + 1);
      if (next.getType() !== DocumentApp.ElementType.PARAGRAPH ||
          next.asParagraph().getText().indexOf('Submitted by ' + (idea.member || '')) !== 0) continue;
      for (let k = i + 2; k < n; k++) {
        const e2 = body.getChild(k);
        if (e2.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
        const p2 = e2.asParagraph();
        if (p2.findElement(DocumentApp.ElementType.HORIZONTAL_RULE) || p2.getHeading() === DocumentApp.ParagraphHeading.HEADING2) { at = k; break; }
      }
      if (at === -1) at = n;   // last journal, no rule after it
    }
  }
  const para = (at >= 0 && at < body.getNumChildren()) ? body.insertParagraph(at, label + text) : body.appendParagraph(label + text);
  para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  setFont_(para).setFontSize(10.5).setItalic(false).setBold(false).setForegroundColor('#1b2530');
  para.editAsText().setBold(0, label.length - 1, true).setForegroundColor(0, label.length - 1, AMBER);
  doc.saveAndClose();
}

/* ---------- replies to the Friday email ---------- */
function syncEmailReplies() {
  const props = PropertiesService.getScriptProperties();
  let since = Number(props.getProperty('REPLY_SYNC_SINCE') || 0);
  if (!since) { since = Date.now(); props.setProperty('REPLY_SYNC_SINCE', String(since)); }

  const owner = String(Session.getEffectiveUser().getEmail()).toLowerCase();
  const meeting = targetMeeting_();
  const meetingLong = formatLong_(meeting);
  const info = findMeetingDoc_(meeting);
  const ideas = cycleIdeas_(meeting);
  const sheet = getCommentsSheet_();
  const seen = {};
  sheet.getDataRange().getValues().slice(1).forEach(function (r) { if (r[7]) seen[String(r[7])] = true; });

  let added = 0;
  GmailApp.search('subject:"LIC trade ideas for review" newer_than:21d', 0, 50).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      if (m.getDate().getTime() < since || seen[m.getId()]) return;
      if (m.getSubject().indexOf(meetingLong) === -1) return;          // a reply about this month's ideas
      const from = m.getFrom();
      const email = ((from.match(/<([^>]+)>/) || [null, from])[1] || '').trim().toLowerCase();
      if (!email || email === owner) return;
      const text = cleanReply_(m.getPlainBody());
      if (text.length < 2) return;
      const who = memberNameFor_(email) || from.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || email;
      const idea = guessIdea_(text, ideas);
      sheet.appendRow([m.getDate(), dateKey_(meeting), idea ? String(idea.id) : '', idea ? String(idea.ticker).toUpperCase() : '',
                       who, text, 'email', m.getId()]);
      seen[m.getId()] = true;
      if (info) { try { insertCommentIntoDoc_(info, idea, who, 'by email', text); } catch (e) { console.error('Doc insert failed: ' + e); } }
      added++;
    });
  });
  if (added) CacheService.getScriptCache().remove('ideas_web');
  Logger.log('Email replies added: ' + added);
  return { ok: true, added: added };
}

// Keep only what the member typed: drop the quoted original and signatures.
function cleanReply_(body) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const ahead = (l + ' ' + (lines[i + 1] || '') + ' ' + (lines[i + 2] || ''));
    if (/^\s*On .*\d{4}/.test(l) && /wrote:/.test(ahead)) break;          // "On Nov 6, 2026 … wrote:"
    if (/^\s*-{2,}\s*Original Message/i.test(l) || /^\s*_{5,}\s*$/.test(l) || /^\s*From:\s/.test(l)) break;
    if (/^\s*>/.test(l)) continue;
    if (/^\s*Sent from my (iPhone|iPad|Android|Galaxy|phone)/i.test(l) || /^\s*Sent from (Yahoo|Outlook|Mail for)/i.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

// Which idea is a reply about? Only if it clearly names exactly one.
function guessIdea_(text, ideas) {
  const hits = ideas.filter(function (t) {
    const tk = String(t.ticker).toUpperCase();
    if (new RegExp('\\b' + tk.replace(/[^A-Z0-9.]/g, '') + '\\b').test(text)) return true;
    const word = String(t.stock || '').split(/[\s,.]+/)[0];
    return word.length >= 4 && new RegExp('\\b' + word.replace(/[^A-Za-z0-9]/g, '') + '\\b', 'i').test(text);
  });
  return hits.length === 1 ? hits[0] : null;
}

/* =====================================================================
 * AFTER THE MEETING: officers record decisions by reply → club follow-up
 * ===================================================================== */
const DECISIONS_TAB = 'Decisions';
const OFFICER_ROLES = ['secretary', 'treasurer'];

function getDecisionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DECISIONS_TAB);
  if (!sh) {
    sh = ss.insertSheet(DECISIONS_TAB);
    sh.appendRow(['Received', 'Meeting Date', 'From', 'Reply', 'Email Message ID']);
    styleHeader_(sh, 5);
    sh.setColumnWidth(3, 160); sh.setColumnWidth(4, 480);
  }
  return sh;
}

// Members whose Role is Secretary or Treasurer: [{name, email, role}]
function officers_() {
  return getMembersSheet_().getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[1]).indexOf('@') > 0 && OFFICER_ROLES.indexOf(String(r[2]).trim().toLowerCase()) !== -1;
  }).map(function (r) { return { name: String(r[0]).trim(), email: String(r[1]).trim(), role: String(r[2]).trim() }; });
}

// Most recent meeting strictly before today.
function lastMeetingBefore_(now) {
  const today = startOfDay_(now);
  let m = nthWeekdayOfMonth_(today.getFullYear(), today.getMonth());
  if (m >= today) m = nthWeekdayOfMonth_(today.getFullYear(), today.getMonth() - 1);
  return m;
}

// Daily ~8am. Day 1 after a meeting: ask the officers. Day 5+ (until day 12):
// send the club follow-up once a reply is in; one reminder if none by day 5.
function afterMeetingCheck() {
  const now = new Date();
  const m = lastMeetingBefore_(now);
  const k = dateKey_(m);
  const days = Math.round((startOfDay_(now) - m) / 86400000);
  const props = PropertiesService.getScriptProperties();
  if (days >= 1 && days <= 3 && !props.getProperty('DEC_REQ_' + k)) {
    Logger.log(JSON.stringify(sendDecisionsRequest_({ meeting: m })));
    return;
  }
  if (days >= 5 && days <= 12 && props.getProperty('DEC_REQ_' + k) && !props.getProperty('DEC_SUM_' + k)) {
    const r = sendDecisionsSummary_({ meeting: m });
    if (r.waiting && !props.getProperty('DEC_NUDGE_' + k)) {
      Logger.log(JSON.stringify(sendDecisionsRequest_({ meeting: m, reminder: true })));
      props.setProperty('DEC_NUDGE_' + k, '1');
    }
    Logger.log(JSON.stringify(r));
  }
}

// Manual buttons (they act on the most recent meeting).
function previewDecisionsRequest()  { Logger.log(JSON.stringify(sendDecisionsRequest_({ meeting: lastMeetingBefore_(new Date()), preview: true }))); }
function sendDecisionsRequestNow()  { Logger.log(JSON.stringify(sendDecisionsRequest_({ meeting: lastMeetingBefore_(new Date()) }))); }
function previewDecisionsSummary()  { Logger.log(JSON.stringify(sendDecisionsSummary_({ meeting: lastMeetingBefore_(new Date()), preview: true }))); }
function sendDecisionsSummaryNow()  { Logger.log(JSON.stringify(sendDecisionsSummary_({ meeting: lastMeetingBefore_(new Date()) }))); }

function decisionsSubject_(meeting) { return 'LIC decisions for ' + formatLong_(meeting); }

function sendDecisionsRequest_(opts) {
  const meeting = opts.meeting;
  const meetingLong = formatLong_(meeting);
  const ideas = cycleIdeas_(meeting);
  const offs = officers_();
  if (!offs.length && !opts.preview) return { error: 'No Secretary or Treasurer in the Members tab Role column.' };

  const list = ideas.map(function (t) {
    return '<li style="margin:0 0 6px;"><strong>' + esc2_(ideaTitle_(t)) + '</strong> <span style="color:' + SOFT_ + ';">from ' + esc2_(t.member || 'a member') + '</span></li>';
  }).join('');
  const html = '<div style="font-family:' + F_ + ';color:' + INK_ + ';max-width:640px;font-size:15px;line-height:1.55;">' +
    header_('Meeting record', (opts.reminder ? 'Reminder: ' : '') + 'What did we decide on ' + meetingLong + '?') +
    '{{GREETING}}' +
    '<p style="margin:0 0 10px;">Thanks for keeping the club\'s record. Here are the ideas from the ' + meetingLong + ' meeting. ' +
      '<strong>Just hit Reply</strong> and tell us, in plain words, what the club decided on each.</p>' +
    (list ? '<ul style="margin:0 0 12px;padding-left:22px;">' + list + '</ul>' : '<p><em>(No ideas were submitted for this meeting.)</em></p>') +
    '<p style="margin:0 0 6px;">For example:</p>' +
    '<p style="margin:0 0 12px;padding:10px 14px;background:#f6f1e6;border-radius:6px;font-style:italic;">Bought 5 shares of Acme Co. at about $50. Passed on Example Inc. Sample Corp: watch, revisit next month.</p>' +
    '<p style="margin:0 0 10px;">Shares, prices and any reasons are welcome but optional. Either of you can reply; one reply is enough, and corrections from the other are fine too.</p>' +
    '<p style="margin:0 0 4px;color:' + SOFT_ + ';font-size:14px;">A few days after the meeting, the whole club gets a short "here\'s what we decided" email built from your reply, and the decisions are saved in the club\'s records.</p>' +
    '</div>';

  const subject = (opts.preview ? '[PREVIEW] ' : '') + decisionsSubject_(meeting);
  const owner = Session.getEffectiveUser().getEmail();
  const to = opts.preview ? [{ name: memberNameFor_(owner), email: owner }] : offs.concat([{ name: memberNameFor_(owner), email: owner }]);
  let sent = 0;
  to.forEach(function (m) {
    const first = m.name ? m.name.split(/\s+/)[0] : '';
    sendClubMail_({ to: m.email, subject: subject, htmlBody: html.replace('{{GREETING}}', '<p style="margin:0 0 12px;">' + (first ? 'Hi ' + esc2_(first) + ',' : 'Hi there,') + '</p>') });
    sent++;
  });
  if (!opts.preview) PropertiesService.getScriptProperties().setProperty('DEC_REQ_' + dateKey_(meeting), String(Date.now()));
  return { ok: true, email: 'decisions-request', reminder: !!opts.reminder, preview: !!opts.preview, ideas: ideas.length, sent: sent };
}

// Pull the officers' replies into the Decisions tab; return all for this meeting.
function collectDecisionReplies_(meeting) {
  const owner = String(Session.getEffectiveUser().getEmail()).toLowerCase();
  const sheet = getDecisionsSheet_();
  const key = dateKey_(meeting);
  const seen = {};
  sheet.getDataRange().getValues().slice(1).forEach(function (r) { if (r[4]) seen[String(r[4])] = true; });
  GmailApp.search('subject:"' + decisionsSubject_(meeting) + '" newer_than:30d', 0, 20).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      if (seen[m.getId()] || m.getSubject().indexOf('[PREVIEW]') !== -1) return;
      const from = m.getFrom();
      const email = ((from.match(/<([^>]+)>/) || [null, from])[1] || '').trim().toLowerCase();
      if (!email || email === owner) return;
      const text = cleanReply_(m.getPlainBody());
      if (text.length < 2) return;
      sheet.appendRow([m.getDate(), key, memberNameFor_(email) || from.replace(/<[^>]*>/, '').replace(/"/g, '').trim(), text, m.getId()]);
      seen[m.getId()] = true;
    });
  });
  return sheet.getDataRange().getValues().slice(1).filter(function (r) {
    const k = r[1] instanceof Date ? dateKey_(r[1]) : String(r[1]);
    return k === key && String(r[3]).trim();
  }).map(function (r) { return { when: r[0], who: String(r[2]), text: String(r[3]) }; });
}

function sendDecisionsSummary_(opts) {
  const meeting = opts.meeting;
  const meetingLong = formatLong_(meeting);
  const replies = collectDecisionReplies_(meeting);
  if (!replies.length) return { waiting: true, note: 'No decision replies yet for ' + meetingLong + '.' };
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { error: 'No ANTHROPIC_API_KEY script property.' };
  const ideas = cycleIdeas_(meeting);

  const payload = {
    model: SYNTH_MODEL,
    max_tokens: 2000,
    system: 'You record the decisions of the Lakewood Investors Club, a volunteer investment club. The Secretary and/or ' +
      'Treasurer replied by email with what the club decided. Report ONLY what they wrote: never invent shares, prices, ' +
      'reasons or decisions, and never add opinions, advice or predictions. If two replies differ, prefer the later one ' +
      'and say "per <name>" in the notes. Warm, plain, short.',
    messages: [{ role: 'user', content:
      'Meeting: ' + meetingLong + '\n\nIdeas on the agenda:\n' +
      ideas.map(function (t) { return '- id ' + t.id + ': ' + ideaTitle_(t) + ' (brought by ' + (t.member || 'a member') + ')'; }).join('\n') +
      '\n\nOfficer replies (oldest first):\n' +
      replies.map(function (r) { return '--- ' + r.who + ':\n' + r.text; }).join('\n') +
      '\n\nReturn ONLY JSON, no markdown, in this shape:\n' +
      '{"decisions":[{"id":"<idea id or empty>","ticker":"","decision":"Bought|Sold|Approved|Watch|Pass|Not discussed|Other",' +
      '"details":"shares/price/notes exactly as given, or empty"}],' +
      '"summary_html":"2-3 short <p> paragraphs: what the club decided, crediting the member who brought each idea, and a ' +
      'thank-you to everyone who submitted and commented. Allowed tags: p, strong, em."}\n' +
      'Include one entry per agenda idea (use "Not discussed" if the replies don\'t mention it), plus entries for any other ' +
      'stocks the replies mention (empty id).'
    }]
  };
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) return { error: 'Claude API ' + res.getResponseCode() + ': ' + ((body.error && body.error.message) || 'request failed') };
  const raw = (body.content || []).map(function (b) { return b.text || ''; }).join('');
  let out;
  try { out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); }
  catch (e) { return { error: 'Could not read the decisions: ' + raw.slice(0, 300) }; }
  const decisions = out.decisions || [];
  const summary = String(out.summary_html || '').replace(/<(?!\/?(p|strong|em)\b)[^>]*>/gi, '');

  // Record in the Submissions tab (Status + Notes), unless previewing.
  if (!opts.preview) {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const statusCol = HEADERS.indexOf('Status') + 1, notesCol = HEADERS.indexOf('Notes') + 1;
    const when = Utilities.formatDate(meeting, tz_(), 'MMM d, yyyy');
    decisions.forEach(function (d) {
      if (!d.id) return;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) !== String(d.id)) continue;
        const dec = String(d.decision || '');
        const status = /bought|approved/i.test(dec) ? 'approved' : /watch/i.test(dec) ? 'watch' : /pass/i.test(dec) ? 'pass' : data[i][statusCol - 1];
        sheet.getRange(i + 1, statusCol).setValue(status);
        sheet.getRange(i + 1, notesCol).setValue(when + ' meeting: ' + dec + (d.details ? ' (' + d.details + ')' : ''));
      }
    });
  }

  const titleFor = function (d) {
    const t = ideas.filter(function (x) { return String(x.id) === String(d.id); })[0];
    return t ? { title: ideaTitle_(t), by: t.member || '' } : { title: String(d.ticker || ''), by: '' };
  };
  const rows = decisions.map(function (d) {
    const t = titleFor(d);
    return '<tr><td style="padding:8px 10px;border-bottom:1px solid ' + LINE_ + ';"><strong>' + esc2_(t.title) + '</strong>' +
      (t.by ? '<br><span style="color:' + SOFT_ + ';font-size:13px;">from ' + esc2_(t.by) + '</span>' : '') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid ' + LINE_ + ';font-weight:bold;color:' + A_ + ';">' + esc2_(d.decision || '') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid ' + LINE_ + ';color:' + INK_ + ';">' + esc2_(d.details || '') + '</td></tr>';
  }).join('');
  const recorders = replies.map(function (r) { return r.who; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' and ');
  const html = '<div style="font-family:' + F_ + ';color:' + INK_ + ';max-width:680px;font-size:15px;line-height:1.55;">' +
    header_('Meeting follow-up', 'What we decided: ' + meetingLong) +
    '{{GREETING}}' +
    summary.replace(/<p>/g, '<p style="margin:0 0 10px;">') +
    (rows ? '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:10px 0 16px;font-size:14px;">' +
      '<tr><th align="left" style="padding:6px 10px;border-bottom:2px solid ' + A_ + ';">Idea</th><th align="left" style="padding:6px 10px;border-bottom:2px solid ' + A_ + ';">Decision</th><th align="left" style="padding:6px 10px;border-bottom:2px solid ' + A_ + ';">Details</th></tr>' +
      rows + '</table>' : '') +
    '<p style="margin:0 0 10px;color:' + SOFT_ + ';font-size:14px;">Recorded by ' + esc2_(recorders || 'the club officers') + '. ' +
      'Next month\'s ideas are already welcome on <a href="' + SITE_URL + '" style="color:' + A_ + ';">the club website</a>.</p>' +
    footer_('Summary prepared by AI from the officers\' notes.') + '</div>';

  const r = sendToMembers_(!!opts.preview, (opts.preview ? '[PREVIEW] ' : '') + 'LIC follow-up: what we decided on ' + meetingLong, html, []);
  if (r.error) return r;
  if (!opts.preview) {
    PropertiesService.getScriptProperties().setProperty('DEC_SUM_' + dateKey_(meeting), String(Date.now()));
    try { logSynthesis('[Decisions for ' + meetingLong + ']\n\n' + summary.replace(/<[^>]+>/g, ' '), []); } catch (e) {}
  }
  return { ok: true, email: 'decisions-summary', preview: !!opts.preview, decisions: decisions.length, sent: r.sent, failed: r.failed };
}
