/* TradeDeskPro first-touch/UTM capture */
(function () {
  if (typeof document === 'undefined') return;
  var s = document.createElement('script');
  s.src = 'https://www.tradedeskpro.com/js/tdp-lead-attribution.js';
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();

/**
 * Lead intake for Hill Country Well Drilling → TradeDeskPro /api/leads
 * No client secrets. Origin must be on the profile allowlist.
 */
(function () {
  var API_URL = 'https://www.tradedeskpro.com/api/leads';
  var PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
  var SOURCE = 'hillcountrywelldrilling.com';
  var PHONE_FALLBACK = '(830) 465-3375';
  var MIN_FILL_MS = 3000;
  var loadedAt = Date.now();
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (e) {
      return '';
    }
  }

  function fieldValue(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || '').trim() : '';
  }

  function buildMessage(service, area, message) {
    var lines = [];
    if (service) lines.push('Service: ' + service);
    if (area) lines.push('Area: ' + area);
    if (message) lines.push(message);
    return lines.join('\n');
  }

  function provenance() {
    var extra = {};
    if (typeof window.tdpLeadAttribution === 'function') {
      try {
        extra = window.tdpLeadAttribution() || {};
      } catch (e) {
        extra = {};
      }
    }
    var out = {};
    ['first_touch_url', 'landing_path', 'referrer'].concat(UTM_KEYS).forEach(function (key) {
      if (extra[key]) out[key] = extra[key];
    });
    UTM_KEYS.forEach(function (key) {
      if (!out[key]) {
        var fromUrl = qs(key);
        if (fromUrl) out[key] = fromUrl;
      }
    });
    return out;
  }

  function statusEl(form) {
    var el = form.querySelector('.form-status');
    if (!el) {
      el = document.createElement('p');
      el.className = 'form-status';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      form.appendChild(el);
    }
    return el;
  }

  function showStatus(form, ok, text) {
    var el = statusEl(form);
    el.textContent = text;
    el.style.color = ok ? '#166534' : '#991b1b';
    el.style.display = 'block';
  }

  function setButton(btn, disabled, label) {
    if (!btn) return;
    btn.disabled = disabled;
    if (label) btn.textContent = label;
  }

  function showSuccess(form) {
    showStatus(
      form,
      true,
      "Request received. We'll contact you within 1 hour during business hours."
    );
  }

  function showError(form) {
    showStatus(
      form,
      false,
      "We couldn't send that just now. Please call " +
        PHONE_FALLBACK +
        " and we'll help right away."
    );
  }

  async function submitLead(payload) {
    var body = {
      name: payload.name,
      phone: payload.phone || '',
      email: payload.email || '',
      message: payload.message || '',
      source: SOURCE,
      landing_url: window.location.href,
      profile_id: PROFILE_ID,
    };
    var extra = provenance();
    Object.keys(extra).forEach(function (key) {
      if (extra[key] && !body[key]) body[key] = extra[key];
    });

    var res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 201 || res.status === 202 || (res.ok && res.status >= 200 && res.status < 300)) {
      return res.status;
    }
    throw new Error('Lead submit failed (' + res.status + ')');
  }

  function wireForm(form) {
    if (!form || form.dataset.leadsWired === '1') return;
    form.dataset.leadsWired = '1';
    form.removeAttribute('action');
    if (!form.getAttribute('method')) form.setAttribute('method', 'post');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], button:not([type])');
      var original = btn ? btn.textContent : '';
      setButton(btn, true, 'Sending...');

      if (fieldValue(form, 'company_website') || Date.now() - loadedAt < MIN_FILL_MS) {
        form.reset();
        showSuccess(form);
        setButton(btn, false, original);
        return;
      }

      var name = fieldValue(form, 'name');
      var phone = fieldValue(form, 'phone');
      if (!name || !phone) {
        showStatus(form, false, 'Please enter your name and phone number, or call ' + PHONE_FALLBACK + '.');
        setButton(btn, false, original);
        return;
      }

      try {
        await submitLead({
          name: name,
          phone: phone,
          email: fieldValue(form, 'email'),
          message: buildMessage(
            fieldValue(form, 'service'),
            fieldValue(form, 'area'),
            fieldValue(form, 'message')
          ),
        });
        form.reset();
        showSuccess(form);
      } catch (err) {
        showError(form);
      }
      setButton(btn, false, original);
    });
  }

  function init() {
    document.querySelectorAll('form.lead-form, form#leadForm').forEach(wireForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
