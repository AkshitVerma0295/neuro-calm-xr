/* =============================================================================
   NeuroCalm XR® — HCP Portal (fictional demo)
   File: js/main.js
   -----------------------------------------------------------------------------
   Single classic script. No dependencies, no globals (except window.dataLayer),
   no inline styles. Every feature lives in its own initX() that returns early
   when its root element is missing.

   Sections
     1.  Config
     2.  dataLayer bootstrap + debug logging
     3.  Shared helpers
     4.  Double-init guard
     5.  Section tracking (SPA)   -> initSectionTracking()
     6.  HCP disclaimer bar       -> initHcpBar()
     7.  Header navigation        -> initNav()
     8.  Clinical data tabs       -> initTabs()
     9.  Safety accordion         -> initAccordions()
     10. Rep request form         -> initForm()
     11. Footer year              -> initFooterYear()
     12. Bootstrap
   ========================================================================== */

(function () {
  'use strict';

  /* ===========================================================================
     1. CONFIG
     ========================================================================= */

  var NAV_BREAKPOINT = 900;                          // matches CSS @media (max-width: 900px)
  var HCP_BAR_STORAGE_KEY = 'neurocalm-xr.hcp-bar.dismissed';
  var INIT_FLAG_ATTR = 'data-nc-init';
  var GLYPH_OPEN = '+';
  var GLYPH_CLOSED = '\u2212';                       // MINUS SIGN
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var NPI_RE = /^\d{10}$/;
  var SECTION_EVENT_NAME = 'section_view';           // NOT 'page_view' (see review #1)
  var SECTION_DEBOUNCE_MS = 180;                     // smooths rapid scroll-past events
  var SITE_NAME = 'NeuroCalm XR';

  /* ===========================================================================
     2. DATALAYER BOOTSTRAP + DEBUG LOGGING
     The array exists on every load. Pushes are guarded. Console visibility is
     gated so production stays silent.
     ========================================================================= */

  window.dataLayer = window.dataLayer || [];

  /** Debug is on when: window.NEUROCALM_DEBUG=true, ?debug=1, ?gtm_debug=1,
   *  or running on localhost / 127.0.0.1 / file://. */
  function isDebugEnabled() {
    try {
      if (window.NEUROCALM_DEBUG === true) return true;
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('debug') === '1') return true;
      if (qs.get('gtm_debug') === '1') return true;
      var host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1' ||
          host === '[::1]' || host === '') return true;
    } catch (error) { /* URLSearchParams unsupported */ }
    return false;
  }

  /** Pretty console output. Called only from pushToDataLayer(). Never throws. */
  function logDataLayerEvent(label, payload) {
    if (!isDebugEnabled()) return;
    try {
      var count = window.dataLayer ? window.dataLayer.length : 0;
      console.groupCollapsed(
        '%c[dataLayer]%c ' + label + '  %c(' + count + ' events queued)',
        'color:#0b6e69;font-weight:700;',
        'color:#1f2933;font-weight:400;',
        'color:#52606d;font-weight:400;font-style:italic;'
      );
      console.log('payload:', payload);
      console.log('dataLayer:', window.dataLayer);
      console.groupEnd();
    } catch (error) { /* console unavailable */ }
  }

  /** Single chokepoint for every GTM push. Returns true on success. */
  function pushToDataLayer(payload) {
    try {
      window.dataLayer.push(payload);
      logDataLayerEvent(payload.event, payload);
      return true;
    } catch (error) {
      logDataLayerEvent('PUSH FAILED', { error: String(error), attempted: payload });
      return false;
    }
  }

  /* ===========================================================================
     3. SHARED HELPERS
     ========================================================================= */

  function toArray(list) { return Array.prototype.slice.call(list || []); }
  function isElement(node) { return !!node && node.nodeType === 1; }

  function focusIfPossible(element) {
    if (!isElement(element) || typeof element.focus !== 'function') return false;
    element.focus();
    return true;
  }

  function readStorage(key) {
    try { return window.sessionStorage.getItem(key); } catch (error) { return null; }
  }

  function writeStorage(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (error) { /* ignore */ }
  }

  function humanizeId(id) {
    if (!id || id === 'top') return 'Home';
    return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  /* ===========================================================================
     4. DOUBLE-INIT GUARD
     ========================================================================= */

  function alreadyInitialized() {
    var root = document.documentElement;
    if (!root) return false;
    if (root.getAttribute(INIT_FLAG_ATTR) === 'true') return true;
    root.setAttribute(INIT_FLAG_ATTR, 'true');
    return false;
  }

  /* ===========================================================================
     5. SECTION TRACKING (SPA)
     ========================================================================= */

  function buildSectionPayload(id, name, element) {
    var sectionEl = element || document.getElementById(id);
    var heading = sectionEl ? sectionEl.querySelector('h1, h2, h3') : null;
    var displayName = name || (heading ? heading.textContent.trim() : humanizeId(id));
    var path = window.location.pathname + (id === 'top' ? '' : '#' + id);

    return {
      event: SECTION_EVENT_NAME,
      section_id: id,
      section_name: displayName,
      page_path: path,
      page_title: document.title,
      site_name: SITE_NAME
    };
  }

  /** Keep the address bar in sync with the visible section (deep-linkable). */
  function syncHash(id) {
    var targetPath = window.location.pathname;
    var targetHash = id === 'top' ? '' : '#' + id;
    var currentPath = window.location.pathname;
    var currentHash = window.location.hash || '';
    if (targetPath === currentPath && targetHash === currentHash) return;

    try {
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', targetPath + targetHash);
      } else if (id === 'top') {
        window.location.hash = '';
      } else {
        window.location.hash = id;
      }
    } catch (error) { /* some browsers block replaceState on file:// */ }
  }

  function initSectionTracking() {
    /* Tracked targets: hero (mapped to 'top' since it has no id) + all
       section[id] elements. WeakMap lets us map back to ids without touching
       the DOM. */
    var tracked = [];
    var hero = document.querySelector('.hero');
    if (hero) tracked.push({ element: hero, id: 'top' });

    toArray(document.querySelectorAll('section[id]')).forEach(function (section) {
      if (section.id && section.id !== 'top') {
        tracked.push({ element: section, id: section.id });
      }
    });

    if (!tracked.length) {
      /* No sections at all — record a single 'top' view so the dataLayer
         isn't empty. */
      pushToDataLayer(buildSectionPayload('top', 'Home', null));
      return;
    }

    var activeId = null;
    var pendingId = null;
    var debounceTimer = null;

    function commit(id) {
      if (!id || id === activeId) return;
      activeId = id;
      var t = tracked.filter(function (x) { return x.id === id; })[0];
      var element = t ? t.element : null;
      syncHash(id);
      pushToDataLayer(buildSectionPayload(id, null, element));
    }

    function scheduleCommit(id) {
      pendingId = id;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(function () {
        debounceTimer = null;
        var finalId = pendingId;
        pendingId = null;
        commit(finalId);
      }, SECTION_DEBOUNCE_MS);
    }

    /** Fallback: pick the target with the greatest visible height (handles
     *  gaps, tiny sections, and browsers without IntersectionObserver). */
    function pickBestFromViewport() {
      var vh = window.innerHeight || 0;
      var bestId = null;
      var bestVisible = 0;
      tracked.forEach(function (t) {
        var rect = t.element.getBoundingClientRect();
        if (rect.height <= 0) return;
        var visibleHeight = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
        if (visibleHeight > bestVisible) {
          bestVisible = visibleHeight;
          bestId = t.id;
        }
      });
      return bestId;
    }

    if (!('IntersectionObserver' in window)) {
      /* Fallback path for very old browsers. */
      window.addEventListener('scroll', function () {
        var id = pickBestFromViewport();
        if (id) scheduleCommit(id);
      }, { passive: true });
      var initialId = pickBestFromViewport();
      if (initialId) scheduleCommit(initialId);
      return;
    }

    var idByElement = new WeakMap();
    tracked.forEach(function (t) { idByElement.set(t.element, t.id); });

    var observer = new IntersectionObserver(function (entries) {
      var bestId = null;
      var bestRatio = 0;

      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (entry.intersectionRatio > bestRatio) {
          bestRatio = entry.intersectionRatio;
          bestId = idByElement.get(entry.target) || null;
        }
      });

      if (bestId) {
        scheduleCommit(bestId);
      } else {
        var fallbackId = pickBestFromViewport();
        if (fallbackId) scheduleCommit(fallbackId);
      }
    }, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
      rootMargin: '0px 0px -10% 0px'
    });

    tracked.forEach(function (t) { observer.observe(t.element); });

    /* NOTE: we deliberately do NOT call updateActiveSectionFromViewport()
       synchronously here. The observer fires with initial entries on the next
       frame and will emit the correct first section — avoiding the
       double-fire that the previous version had. */
  }

  /* ===========================================================================
     6. HCP DISCLAIMER BAR
     ========================================================================= */

  function initHcpBar() {
    var bar = document.getElementById('hcpBar');
    if (!bar) return;

    var closeButton = document.getElementById('hcpBarClose');

    if (readStorage(HCP_BAR_STORAGE_KEY) === '1') bar.hidden = true;
    if (!closeButton) return;

    closeButton.addEventListener('click', function () {
      var focusWasInside = bar.contains(document.activeElement);
      bar.hidden = true;
      writeStorage(HCP_BAR_STORAGE_KEY, '1');
      if (focusWasInside) {
        var fallback = document.querySelector('.logo') || document.getElementById('navToggle');
        focusIfPossible(fallback);
      }
    });
  }

  /* ===========================================================================
     7. HEADER NAVIGATION
     ========================================================================= */

  function initNav() {
    var toggle = document.getElementById('navToggle');
    var nav = document.getElementById('primaryNav');
    if (!toggle || !nav) return;

    function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) nav.classList.add('is-open');
      else nav.classList.remove('is-open');
    }

    setOpen(false);

    toggle.addEventListener('click', function () { setOpen(!isOpen()); });

    nav.addEventListener('click', function (event) {
      var target = event.target;
      if (!isOpen()) return;
      if (!isElement(target) || typeof target.closest !== 'function') return;
      if (target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key !== 'Escape' && key !== 'Esc') return;
      if (!isOpen()) return;
      event.preventDefault();
      setOpen(false);
      focusIfPossible(toggle);
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        resizeTimer = null;
        if (window.innerWidth > NAV_BREAKPOINT && isOpen()) setOpen(false);
      }, 150);
    });

    window.addEventListener('pageshow', function (event) {
      if (event.persisted) setOpen(false);
    });
  }

  /* ===========================================================================
     8. CLINICAL DATA TABS
     ========================================================================= */

  function resolveTabPanel(root, button, panels, index) {
    var panel = null;
    var controlsId = button.getAttribute('aria-controls');
    if (controlsId) {
      panel = document.getElementById(controlsId);
      if (panel && !root.contains(panel)) panel = null;
    }
    if (!panel) {
      var dataTabId = button.getAttribute('data-tab');
      if (dataTabId) {
        panel = document.getElementById(dataTabId);
        if (panel && !root.contains(panel)) panel = null;
      }
    }
    if (!panel && panels[index]) panel = panels[index];
    return panel || null;
  }

  function initTabs() {
    var roots = toArray(document.querySelectorAll('.tabs'));
    if (!roots.length) return;
    roots.forEach(setupTabs);
  }

  function setupTabs(root) {
    var list = root.querySelector('[role="tablist"]') || root.querySelector('.tabs__list');
    var buttons = toArray(root.querySelectorAll('.tab-btn'));
    if (!list || !buttons.length) return;

    var panels = toArray(root.querySelectorAll('.tab-panel'));

    var pairs = buttons.map(function (button, index) {
      return { button: button, panel: resolveTabPanel(root, button, panels, index) };
    });

    function findInitialIndex() {
      var i;
      for (i = 0; i < pairs.length; i += 1) {
        if (pairs[i].button.getAttribute('aria-selected') === 'true') return i;
      }
      for (i = 0; i < pairs.length; i += 1) {
        if (pairs[i].button.classList.contains('is-active')) return i;
      }
      return 0;
    }

    function activate(index, moveFocus) {
      if (index < 0 || index >= pairs.length) return;
      for (var i = 0; i < pairs.length; i += 1) {
        var pair = pairs[i];
        var selected = (i === index);
        if (selected) pair.button.classList.add('is-active');
        else pair.button.classList.remove('is-active');
        pair.button.setAttribute('aria-selected', selected ? 'true' : 'false');
        pair.button.setAttribute('tabindex', selected ? '0' : '-1');
        if (pair.panel) {
          if (selected) pair.panel.classList.add('is-active');
          else pair.panel.classList.remove('is-active');
        }
      }
      if (moveFocus) focusIfPossible(pairs[index].button);
    }

    function indexOfFocusedTab() {
      var active = document.activeElement;
      for (var i = 0; i < pairs.length; i += 1) {
        if (pairs[i].button === active) return i;
      }
      return 0;
    }

    buttons.forEach(function (button, index) {
      button.addEventListener('click', function () { activate(index, false); });
    });

    list.addEventListener('keydown', function (event) {
      var count = pairs.length;
      if (!count) return;
      var key = event.key;
      var current = indexOfFocusedTab();
      var next;
      if (key === 'ArrowRight' || key === 'ArrowDown') next = (current + 1) % count;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (current - 1 + count) % count;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = count - 1;
      else return;
      event.preventDefault();
      activate(next, true);
    });

    activate(findInitialIndex(), false);
  }

  /* ===========================================================================
     9. SAFETY ACCORDION
     ========================================================================= */

  function resolveAccordionPanel(button, item) {
    var panel = null;
    var controlsId = button.getAttribute('aria-controls');
    if (controlsId) panel = document.getElementById(controlsId);
    if (!panel) {
      var sibling = button.nextElementSibling;
      if (sibling && sibling.classList.contains('acc__panel')) panel = sibling;
    }
    if (!panel && item) panel = item.querySelector('.acc__panel');
    return panel || null;
  }

  function initAccordions() {
    var roots = toArray(document.querySelectorAll('.acc'));
    if (!roots.length) return;
    roots.forEach(setupAccordion);
  }

  function setupAccordion(root) {
    var items = toArray(root.querySelectorAll('.acc__item'));
    if (!items.length) return;
    var single = root.hasAttribute('data-accordion-single');

    var pairs = items.map(function (item) {
      var button = item.querySelector('.acc__btn');
      if (!button) return null;
      return { button: button, panel: resolveAccordionPanel(button, item) };
    }).filter(function (p) { return p !== null; });

    if (!pairs.length) return;

    function setExpanded(pair, expanded) {
      pair.button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (pair.panel) pair.panel.hidden = !expanded;
      var glyph = pair.button.querySelector('span[aria-hidden="true"]');
      if (glyph) glyph.textContent = expanded ? GLYPH_CLOSED : GLYPH_OPEN;
    }

    pairs.forEach(function (pair) {
      var expanded = pair.button.getAttribute('aria-expanded') === 'true';
      setExpanded(pair, expanded);

      pair.button.addEventListener('click', function () {
        var nowExpanded = pair.button.getAttribute('aria-expanded') === 'true';
        var next = !nowExpanded;
        if (next && single) {
          pairs.forEach(function (other) {
            if (other !== pair) setExpanded(other, false);
          });
        }
        setExpanded(pair, next);
      });
    });
  }

  /* ===========================================================================
     10. REP REQUEST FORM
     ========================================================================= */

  function initForm() {
    var form = document.getElementById('repForm');
    if (!form) return;

    var statusEl = document.getElementById('formStatus');
    if (statusEl) {
      if (!statusEl.hasAttribute('role')) statusEl.setAttribute('role', 'status');
      if (!statusEl.hasAttribute('aria-live')) statusEl.setAttribute('aria-live', 'polite');
    }

    function makeField(inputId, errorId, validate) {
      var input = document.getElementById(inputId);
      if (!input) return null;
      var errorEl = errorId ? document.getElementById(errorId) : null;
      return { input: input, errorEl: errorEl, validate: validate };
    }

    var fields = [
      makeField('fullName', 'fullNameError', function (input) {
        return input.value.trim() ? '' : 'Enter your full name.';
      }),
      makeField('email', 'emailError', function (input) {
        var value = input.value.trim();
        if (!value) return 'Enter your professional email address.';
        return EMAIL_RE.test(value) ? '' : 'Enter a valid email address, for example name@clinic.org.';
      }),
      makeField('npi', 'npiError', function (input) {
        var value = input.value.trim();
        if (!value) return 'Enter your 10-digit NPI number.';
        return NPI_RE.test(value) ? '' : 'NPI must be exactly 10 digits.';
      }),
      makeField('specialty', 'specialtyError', function (input) {
        return input.value ? '' : 'Select a specialty.';
      }),
      makeField('consent', 'consentError', function (input) {
        return input.checked ? '' : 'Confirm that you are a licensed US healthcare professional.';
      })
    ].filter(function (f) { return f !== null; });

    var hasSubmitted = false;

    function setFieldError(field, message) {
      if (field.errorEl) field.errorEl.textContent = message;
      if (message) {
        field.input.setAttribute('aria-invalid', 'true');
        if (field.errorEl && field.errorEl.id) {
          field.input.setAttribute('aria-describedby', field.errorEl.id);
        }
      } else {
        field.input.removeAttribute('aria-invalid');
        if (field.errorEl && field.errorEl.id &&
            field.input.getAttribute('aria-describedby') === field.errorEl.id) {
          field.input.removeAttribute('aria-describedby');
        }
      }
    }

    function setStatus(message, kind) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove('is-error', 'is-success');
      if (kind === 'error') statusEl.classList.add('is-error');
      else if (kind === 'success') statusEl.classList.add('is-success');
    }

    function clearStatus() {
      if (!statusEl) return;
      statusEl.textContent = '';
      statusEl.classList.remove('is-error', 'is-success');
    }

    fields.forEach(function (field) {
      function revalidate() {
        if (!field.errorEl || field.errorEl.textContent === '') return;
        setFieldError(field, field.validate(field.input));
      }
      field.input.addEventListener('input', revalidate);
      field.input.addEventListener('change', revalidate);
      field.input.addEventListener('blur', function () {
        if (!hasSubmitted) return;
        setFieldError(field, field.validate(field.input));
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearStatus();
      hasSubmitted = true;

      var firstInvalid = null;
      fields.forEach(function (field) {
        var message = field.validate(field.input);
        setFieldError(field, message);
        if (message && !firstInvalid) firstInvalid = field;
      });

      if (firstInvalid) {
        setStatus('Please correct the highlighted fields and try again.', 'error');
        focusIfPossible(firstInvalid.input);
        return;
      }

      setStatus(
        'Thank you. Your demo request has been recorded — no data was sent or stored.',
        'success'
      );
    });
  }

  /* ===========================================================================
     11. FOOTER YEAR
     ========================================================================= */

  function initFooterYear() {
    var yearEl = document.getElementById('year');
    if (!yearEl) return;
    var current = String(new Date().getFullYear());
    if (yearEl.textContent !== current) yearEl.textContent = current;
  }

  /* ===========================================================================
     12. BOOTSTRAP
     ========================================================================= */

  function init() {
    if (alreadyInitialized()) return;

    initSectionTracking();
    initHcpBar();
    initNav();
    initTabs();
    initAccordions();
    initForm();
    initFooterYear();

    if (isDebugEnabled()) {
      console.info(
        '%c[NeuroCalm]%c dataLayer tracking is live. Inspect via window.dataLayer.',
        'color:#0b6e69;font-weight:700;',
        'color:#1f2933;font-weight:400;'
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();