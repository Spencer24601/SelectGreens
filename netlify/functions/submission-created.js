// Runs on every Netlify Forms submission. For the estimate form, when the customer ticked
// "email me a copy", sends them their estimate through Resend. The lead is already saved by
// Netlify Forms, so a failure here is logged and never shown to the customer.
//
// Environment variables (Netlify site settings):
//   RESEND_API_KEY  required
//   RESEND_FROM     optional, default "Select Greens <estimates@selectgreensutah.com>"
//                   (the domain must be verified in Resend)
//   REPLY_TO        optional, default selectgreensutah@gmail.com

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (err) {
    console.log('Could not read the submission payload');
    return { statusCode: 200, body: 'ignored' };
  }
  if (!payload || payload.form_name !== 'estimate-request') return { statusCode: 200, body: 'ignored' };

  const d = payload.data || {};
  if (!d.email_me_copy) return { statusCode: 200, body: 'no copy requested' };
  if (!d.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) {
    console.log('Copy requested but the email address was missing or invalid');
    return { statusCode: 200, body: 'bad email' };
  }
  if (!process.env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY is not set; no email sent');
    return { statusCode: 200, body: 'not configured' };
  }

  const rows = String(d.estimate_summary || '').split('\n').filter(Boolean).map((line) => {
    const i = line.indexOf(': ');
    return i < 0 ? '' :
      '<tr><td style="padding:4px 16px 4px 0;color:#555">' + esc(line.slice(0, i)) +
      '</td><td style="padding:4px 0">' + esc(line.slice(i + 2)) + '</td></tr>';
  }).join('');

  const name = String(d.name || '').trim().split(/\s+/)[0];
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;color:#111">' +
    '<h2 style="margin:0 0 8px">Your Select Greens estimate</h2>' +
    '<p>' + (name ? 'Hi ' + esc(name) + ', here' : 'Here') + ' is the estimate you requested.</p>' +
    '<p style="font-size:28px;margin:16px 0"><strong>' + esc(d.estimated_range) + '</strong></p>' +
    '<table style="border-collapse:collapse;font-size:14px">' + rows + '</table>' +
    '<p style="margin-top:20px">This is a rough estimate. We lock the final price after we measure your site, ' +
    'and we will follow up within one business day.</p>' +
    '<p style="color:#555;font-size:13px">Select Greens &middot; selectgreensutah.com</p></div>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Select Greens <estimates@selectgreensutah.com>',
        to: [d.email],
        reply_to: process.env.REPLY_TO || 'selectgreensutah@gmail.com',
        subject: 'Your Select Greens estimate: ' + d.estimated_range,
        html: html
      })
    });
    if (!res.ok) console.log('Resend rejected the email: ' + res.status + ' ' + (await res.text()));
  } catch (err) {
    console.log('Email send failed: ' + err.message);
  }
  return { statusCode: 200, body: 'done' };
};
