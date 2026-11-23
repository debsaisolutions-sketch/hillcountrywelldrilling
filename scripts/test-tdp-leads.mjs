/**
 * Local test with a mocked fetch. Does not post a live lead.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = fs.readFileSync(path.join(root, 'js', 'tdp-leads.js'), 'utf8');
const PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.parentNode = null;
    this.id = '';
    this.className = '';
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === 'id') this.id = String(value);
    if (key === 'class') this.className = String(value);
  }
  getAttribute(key) {
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }
  removeAttribute(key) {
    delete this.attrs[key];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      if (matches(node, sel)) out.push(node);
      for (const child of node.children) walk(child);
    };
    for (const child of this.children) walk(child);
    return out;
  }
  reset() {
    const walk = (node) => {
      if (node !== this && 'value' in node) node.value = '';
      for (const child of node.children) walk(child);
    };
    walk(this);
  }
}

function matches(node, sel) {
  const parts = sel.split(',').map((s) => s.trim());
  return parts.some((part) => matchesOne(node, part));
}

function matchesOne(node, sel) {
  if (sel === '.form-status') return String(node.className || '').split(/\s+/).includes('form-status');
  if (sel === 'form.lead-form') return node.tagName === 'FORM' && String(node.className).split(/\s+/).includes('lead-form');
  if (sel === 'form#leadForm') return node.tagName === 'FORM' && node.id === 'leadForm';
  const attr = sel.match(/^\[name="([^"]+)"\]$/);
  if (attr) return node.getAttribute('name') === attr[1];
  if (sel === 'button[type="submit"]') return node.tagName === 'BUTTON' && node.getAttribute('type') === 'submit';
  if (sel === 'button:not([type])') return node.tagName === 'BUTTON' && node.getAttribute('type') == null;
  return false;
}

function makeHarness() {
  const calls = [];
  let now = 1_700_000_000_000;
  let status = 201;
  let failNetwork = false;
  let releaseFetch = null;
  let holdFetch = false;

  const form = new El('form');
  form.id = 'leadForm';
  form.className = 'lead-form';
  form.setAttribute('id', 'leadForm');
  form.setAttribute('class', 'lead-form');
  form.setAttribute('action', 'https://example.invalid/old');
  form.setAttribute('method', 'post');

  function input(name, value) {
    const el = new El('input');
    el.setAttribute('name', name);
    el.value = value;
    form.appendChild(el);
    return el;
  }

  const fields = {
    name: input('name', 'Ada Lovelace'),
    phone: input('phone', '(830) 465-3375'),
    email: input('email', 'ada@example.com'),
    service: input('service', 'Pump Repair & Replacement'),
    area: input('area', 'Kerrville'),
    message: input('message', 'No water at the house.'),
    company_website: input('company_website', ''),
  };
  const button = new El('button');
  button.setAttribute('type', 'submit');
  button.textContent = 'Request Free Estimate';
  form.appendChild(button);

  const document = new El('document');
  document.readyState = 'complete';
  document.head = new El('head');
  document.documentElement = new El('html');
  document.body = new El('body');
  document.body.appendChild(form);
  document.createElement = (tag) => new El(tag);
  document.addEventListener = () => {};
  document.querySelectorAll = (sel) => {
    const out = [];
    const walk = (node) => {
      if (matches(node, sel)) out.push(node);
      for (const child of node.children) walk(child);
    };
    walk(document.body);
    return out;
  };

  const location = {
    href: 'https://hillcountrywelldrilling.com/?utm_source=test&utm_medium=cpc',
    search: '?utm_source=test&utm_medium=cpc',
    hostname: 'hillcountrywelldrilling.com',
  };
  const window = {
    location,
    tdpLeadAttribution() {
      return {
        landing_url: 'https://hillcountrywelldrilling.com/?utm_source=test&utm_medium=cpc',
        first_touch_url: 'https://hillcountrywelldrilling.com/?utm_source=test',
        utm_source: 'test',
        utm_medium: 'cpc',
        utm_campaign: 'wells',
      };
    },
  };
  window.fetch = async (url, init) => {
    calls.push({ url, init, atDisabled: button.disabled, buttonLabel: button.textContent });
    if (holdFetch) {
      await new Promise((resolve) => {
        releaseFetch = resolve;
      });
    }
    if (failNetwork) throw new Error('network down');
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => ({ ok: true }),
      text: async () => '',
    };
  };

  const context = {
    window,
    document,
    location: window.location,
    console,
    Date: { now: () => now },
    URLSearchParams,
    fetch: (...args) => window.fetch(...args),
  };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: 'tdp-leads.js' });

  async function submit() {
    const handler = form.listeners.submit[0];
    if (!handler) throw new Error('form was not wired');
    await handler({ preventDefault() {} });
  }

  return {
    form,
    fields,
    button,
    calls,
    submit,
    setHost(host) {
      location.hostname = host;
      location.href = 'https://' + host + '/';
    },
    setNow(ms) {
      now = 1_700_000_000_000 + ms;
    },
    setStatus(code) {
      status = code;
    },
    setFailNetwork(v) {
      failNetwork = v;
    },
    hold() {
      holdFetch = true;
    },
    release() {
      holdFetch = false;
      if (releaseFetch) releaseFetch();
    },
    statusText() {
      return (form.querySelector('.form-status') || {}).textContent || '';
    },
  };
}

function bodyOf(call) {
  const headers = call.init.headers || {};
  if (headers['X-TDP-Lead-Secret'] || headers['x-tdp-lead-secret']) {
    throw new Error('client sent X-TDP-Lead-Secret');
  }
  return JSON.parse(call.init.body);
}

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', message);
  } else {
    console.log('ok:', message);
  }
}

const ok = makeHarness();
assert(ok.form.getAttribute('action') == null, 'placeholder action removed when the form is wired');
ok.setNow(4000);
await ok.submit();
assert(ok.calls.length === 1, 'one POST for a normal submit');
const posted = bodyOf(ok.calls[0]);
assert(ok.calls[0].url === 'https://www.tradedeskpro.com/api/leads', 'live host posts directly to TradeDeskPro /api/leads');
assert(posted.profile_id === PROFILE_ID, 'profile_id is the Deb profile');
assert(posted.name === 'Ada Lovelace', 'name posted');
assert(posted.phone === '(830) 465-3375', 'phone posted');
assert(posted.email === 'ada@example.com', 'email posted');
assert(posted.source === 'hillcountrywelldrilling.com', 'source is the site domain');
assert(posted.landing_url.includes('hillcountrywelldrilling.com'), 'landing_url posted');
assert(posted.utm_source === 'test' && posted.utm_medium === 'cpc' && posted.utm_campaign === 'wells', 'utm fields posted');
assert(posted.first_touch_url.includes('utm_source=test'), 'first_touch_url posted');
assert(
  posted.message === 'Service: Pump Repair & Replacement\nArea: Kerrville\nNo water at the house.',
  'service, area, and details folded into message'
);
assert(ok.statusText().includes('Request received'), '201 shows success');
assert(!ok.statusText().includes("couldn't"), '201 does not show the error fallback');
assert(ok.button.disabled === false, 'button re-enabled after success');
assert(ok.calls[0].atDisabled === true && ok.calls[0].buttonLabel === 'Sending...', 'button disabled while sending');

for (const code of [202, 200]) {
  const harness = makeHarness();
  harness.setNow(5000);
  harness.setStatus(code);
  await harness.submit();
  assert(harness.calls.length === 1 && harness.statusText().includes('Request received'), code + ' shows success');
}

for (const code of [403, 429, 500]) {
  const harness = makeHarness();
  harness.setNow(5000);
  harness.setStatus(code);
  await harness.submit();
  assert(harness.statusText().includes('(830) 465-3375'), code + ' shows the phone fallback');
  assert(!harness.statusText().includes('Request received'), code + ' does not look like success');
}

const network = makeHarness();
network.setNow(5000);
network.setFailNetwork(true);
await network.submit();
assert(network.statusText().includes('(830) 465-3375'), 'network error shows the phone fallback');

const honey = makeHarness();
honey.setNow(9000);
honey.fields.company_website.value = 'https://spam.example';
await honey.submit();
assert(honey.calls.length === 0, 'honeypot does not post');
assert(honey.statusText().includes('Request received'), 'honeypot fakes success');

const fast = makeHarness();
fast.setNow(2999);
await fast.submit();
assert(fast.calls.length === 0, 'submit under 3s does not post');
assert(fast.statusText().includes('Request received'), 'fast submit fakes success');

const allowed = makeHarness();
allowed.setNow(3000);
await allowed.submit();
assert(allowed.calls.length === 1, 'submit at 3s is allowed');

const plain = makeHarness();
plain.setNow(8000);
plain.fields.service.value = '';
plain.fields.area.value = '';
await plain.submit();
assert(bodyOf(plain.calls[0]).message === 'No water at the house.', 'message stays plain when service and area are empty');

const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

function serviceOptionValues(html) {
  const select = html.match(/<select name="service">([\s\S]*?)<\/select>/);
  if (!select) throw new Error('service dropdown missing from homepage');
  return [...select[1].matchAll(/<option([^>]*)>([^<]*)<\/option>/g)]
    .map((match) => {
      const valueAttr = match[1].match(/\bvalue="([^"]*)"/);
      const text = decode(match[2]);
      return valueAttr ? decode(valueAttr[1]) : text;
    })
    .filter(Boolean);
}

const optionValues = serviceOptionValues(page);
const solarLabel = 'Solar-Powered Well Pump';
const existingLabel = 'Pump Repair & Replacement';
assert(optionValues.includes(solarLabel), 'homepage dropdown includes Solar-Powered Well Pump');
assert(optionValues.includes(existingLabel), 'homepage dropdown still includes Pump Repair & Replacement');
assert(page.includes('<h1>Hill Country Well Drilling</h1>'), 'Hill Country Well Drilling brand stays visible');
assert(
  page.includes('Water Well Drilling in Kerrville, Hunt &amp; the Texas Hill Country'),
  'hero subheading names water well drilling in Kerrville, Hunt, and the Texas Hill Country'
);
assert(page.includes('<title>Hill Country Well Drilling | Water well drilling and solar-powered well pumps | Kerrville TX</title>'), 'title mentions water well drilling and solar-powered well pumps');
assert(
  page.includes('Water well drilling and solar-powered well pumps across Kerrville, Hunt, and the Texas Hill Country.'),
  'meta description mentions water well drilling and solar-powered well pumps'
);
assert(page.includes('Solar-Powered Water Well Pumps'), 'solar service card heading is present');
assert(
  page.includes('Need to get water to a part of your property where electricity is hard to reach? Tell us where your property is, whether you already have a water well or need one drilled, and what you need the water for.'),
  'solar service card uses the requested copy'
);
assert(
  page.includes('href="#contact"') && page.includes('Request a solar well pump estimate.'),
  'solar CTA links to the existing estimate form'
);
assert(page.includes('(830) 465-3375'), 'existing phone number is unchanged');
assert(page.includes('data-bot-name="Grace"'), 'Grace chat widget remains');
assert(page.includes('data-agent-id="agent_830bfd70ac375ce5e4b1c83fa5"'), 'Retell agent remains');
assert(!page.includes('367-4918') && !page.includes('hcwaterwelldrilling.com'), 'reference site contact details are not copied');

async function assertServiceLabel(label) {
  const harness = makeHarness();
  harness.setNow(4000);
  harness.fields.service.value = label;
  harness.fields.area.value = 'Hunt';
  harness.fields.message.value = 'Local mock only. Do not deliver this lead.';
  await harness.submit();
  assert(harness.calls.length === 1, label + ' posts once through the mocked handler');
  assert(harness.calls[0].url === 'https://www.tradedeskpro.com/api/leads', label + ' still uses TradeDeskPro /api/leads');
  const body = bodyOf(harness.calls[0]);
  assert(body.profile_id === PROFILE_ID, label + ' keeps the existing TradeDeskPro Inbox profile');
  assert(body.source === 'hillcountrywelldrilling.com', label + ' keeps the existing source');
  assert(body.message.startsWith('Service: ' + label + '\n'), label + ' label is the service line on the lead');
  assert(body.message.includes('Area: Hunt'), label + ' still includes the area field');
  assert(body.phone === '(830) 465-3375', label + ' does not change the phone field');
}

await assertServiceLabel(optionValues.find((value) => value === solarLabel));
await assertServiceLabel(optionValues.find((value) => value === existingLabel));

for (const label of [solarLabel, existingLabel]) {
  const preview = makeHarness();
  preview.setNow(4000);
  preview.setHost('hillcountrywelldrilling-git-cu-e89b1d-freedom-banking-blueprint.vercel.app');
  preview.fields.service.value = label;
  preview.fields.message.value = 'Preview proxy check. Do not deliver this lead.';
  await preview.submit();
  assert(preview.calls.length === 1, label + ' on a preview host posts once');
  assert(preview.calls[0].url === '/api/leads', label + ' on a preview host uses the same-origin proxy');
  const body = bodyOf(preview.calls[0]);
  assert(body.profile_id === PROFILE_ID, label + ' preview payload keeps the existing profile');
  assert(body.source === 'hillcountrywelldrilling.com', label + ' preview payload keeps the site source');
  assert(body.message.startsWith('Service: ' + label + '\n'), label + ' preview payload keeps the service label');
}

if (failed) {
  console.error(failed + ' assertion(s) failed');
  process.exit(1);
}
console.log('All mocked lead tests passed. No live lead was sent.');
