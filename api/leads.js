/**
 * Same-origin lead proxy for hosts TradeDeskPro does not allowlist.
 * The live site still posts directly to TradeDeskPro. Preview hostnames
 * post here, and this function forwards the same payload with the
 * production origin so the lead reaches the existing Inbox.
 */
const UPSTREAM = 'https://www.tradedeskpro.com/api/leads';
const PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
const ALLOWED_ORIGIN = 'https://hillcountrywelldrilling.com';
const FORWARDED_FIELDS = [
  'name',
  'phone',
  'email',
  'message',
  'source',
  'landing_url',
  'profile_id',
  'first_touch_url',
  'landing_path',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
];

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return null;
    }
  }
  return {};
}

function payloadFrom(body) {
  const payload = {};
  FORWARDED_FIELDS.forEach((key) => {
    if (body[key] != null && body[key] !== '') payload[key] = body[key];
  });
  payload.profile_id = PROFILE_ID;
  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = readBody(req);
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (String(body.company_website || '').trim()) {
    res.status(201).json({ success: true });
    return;
  }

  if (body.profile_id && body.profile_id !== PROFILE_ID) {
    res.status(400).json({ error: 'Unexpected profile' });
    return;
  }

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
      Referer: ALLOWED_ORIGIN + '/',
    },
    body: JSON.stringify(payloadFrom(body)),
  });
  const text = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  res.send(text);
};
