/**
 * Local test for the preview lead proxy. Fetch is mocked, so nothing is posted.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const handler = require('../api/leads.js');

const PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
let failed = 0;

function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', message);
  } else {
    console.log('ok:', message);
  }
}

function mockResponse(status, body) {
  return {
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  };
}

function run(body, upstreamStatus = 201, upstreamBody = { success: true }) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return mockResponse(upstreamStatus, upstreamBody);
  };
  const resState = { status: 0, headers: {}, body: '' };
  const res = {
    setHeader(key, value) {
      resState.headers[key] = value;
    },
    status(code) {
      resState.status = code;
      return this;
    },
    json(payload) {
      resState.body = JSON.stringify(payload);
    },
    send(text) {
      resState.body = text;
    },
  };
  return handler({ method: 'POST', body }, res).then(() => {
    global.fetch = original;
    return { calls, resState };
  });
}

for (const label of ['Solar-Powered Well Pump', 'Pump Repair & Replacement']) {
  const message = `Service: ${label}\nArea: Hunt\nPreview proxy check. Do not deliver this lead.`;
  const result = await run({
    name: 'Preview check',
    phone: '(830) 000-0000',
    email: 'preview-check@example.com',
    message,
    source: 'hillcountrywelldrilling.com',
    landing_url: 'https://preview.vercel.app/',
    profile_id: PROFILE_ID,
    company_website: '',
  });
  assert(result.calls.length === 1, label + ' is forwarded once');
  assert(result.calls[0].url === 'https://www.tradedeskpro.com/api/leads', label + ' targets TradeDeskPro');
  assert(result.calls[0].init.headers.Origin === 'https://hillcountrywelldrilling.com', label + ' uses the allowlisted production origin');
  const forwarded = JSON.parse(result.calls[0].init.body);
  assert(forwarded.profile_id === PROFILE_ID, label + ' keeps the existing profile');
  assert(forwarded.source === 'hillcountrywelldrilling.com', label + ' keeps the site source');
  assert(forwarded.message === message, label + ' keeps the service label in the message');
  assert(!('company_website' in forwarded), label + ' does not forward the honeypot');
  assert(result.resState.status === 201, label + ' returns the upstream status');
}

const honey = await run({
  name: 'Spam',
  phone: '(830) 000-0000',
  profile_id: PROFILE_ID,
  company_website: 'https://spam.example',
  message: 'Service: Solar-Powered Well Pump',
});
assert(honey.calls.length === 0, 'honeypot is not forwarded');
assert(honey.resState.status === 201, 'honeypot returns success without an upstream call');

const wrongProfile = await run({
  name: 'Other account',
  phone: '(830) 000-0000',
  profile_id: '00000000-0000-0000-0000-000000000000',
  message: 'Service: Pump Repair & Replacement',
});
assert(wrongProfile.calls.length === 0, 'another profile is not forwarded');
assert(wrongProfile.resState.status === 400, 'another profile is rejected');

const denied = await run(
  {
    name: 'Preview check',
    phone: '(830) 000-0000',
    profile_id: PROFILE_ID,
    message: 'Service: Solar-Powered Well Pump',
    source: 'hillcountrywelldrilling.com',
  },
  403,
  { error: 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' }
);
assert(denied.resState.status === 403, 'upstream rejection is passed back to the page');
assert(denied.resState.body.includes('ORIGIN_NOT_ALLOWED'), 'upstream error body is preserved');

if (failed) {
  console.error(failed + ' assertion(s) failed');
  process.exit(1);
}
console.log('Preview proxy tests passed. No live lead was sent.');
