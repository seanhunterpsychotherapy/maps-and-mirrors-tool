/* Same-document navigation. Public names live only in routes.js. */
(function (global) {
  'use strict';
  var registry = global.MMRoutes;
  var rawGo = global.go, rawStartOver = global.goStartOver;
  var storageKey = 'mm_route_history_v1';
  var skipBack = ['triage', 'crisis-now', 'about', 'tools-index', 'message-bottle', 'sort-through-reflect'];
  var contexts = ['direct', 'settle', 'sort', 'prepare', 'library', 'search', 'deeper', 'toolbox', 'fallback', 'relationship'];
  var entries = [], cursor = -1, backFloor = 0;
  var token = 0, pending = 0, timers = [], readyCallbacks = [], traversal = false, targeted = false;
  var activeRoute = null, activeContext = null, lastSignature = '', waitingForBack = false, entryMode = null;

  function get(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } }
  function set(key, value) {
    try { if (value == null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch (_) {}
  }
  function cleanContext(context) {
    context = context || {};
    return {
      prepare: context.prepare === true,
      library: context.library === true,
      analytics: contexts.indexOf(context.analytics) >= 0 ? context.analytics : 'direct',
      controlOrigin: context.controlOrigin === 'anticipatory' ? 'anticipatory' : 'control-check'
    };
  }
  function entryForState(state) {
    if (!state || state.mmNav !== 1 || typeof state.id !== 'string') return -1;
    return entries.findIndex(function (e) { return e.id === state.id && e.route === state.route; });
  }
  function remember() {
    // Navigation metadata only. Never serialize DOM, forms, search terms or exercise progress.
    set(storageKey, JSON.stringify({ entries: entries, cursor: cursor, backFloor: backFloor }));
  }
  function makeEntry(route, context) {
    return { mmNav: 1, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      route: route.route, context: cleanContext(context) };
  }
  function signature() {
    var state = history.state;
    return location.hash + '|' + (state && state.mmNav === 1 ? state.id : 'foreign');
  }
  function syncBackStack() {
    // Compatibility view for existing callers, never a second source of history.
    global._navHistory = entries.slice(backFloor, cursor).map(function (e) {
      return registry.byKey[e.route].passageId;
    }).filter(function (id) { return skipBack.indexOf(id) < 0; });
  }
  function saveEntry(route, context, mode) {
    var entry;
    if (mode === 'push' && activeRoute && activeRoute.route === route.route) mode = 'replace';
    if (mode === 'push' || mode === 'adopt' || cursor < 0) {
      entries = entries.slice(0, cursor + 1);
      entry = makeEntry(route, context);
      entries.push(entry); cursor = entries.length - 1;
    } else {
      entry = makeEntry(route, context);
      // Retain identity on replace so Forward and our owned-entry lookup agree.
      if (entries[cursor]) entry.id = entries[cursor].id;
      entries[cursor] = entry;
    }
    if (entries.length > 50) {
      var removed = entries.length - 50;
      entries.splice(0, removed); cursor -= removed; backFloor = Math.max(0, backFloor - removed);
    }
    // Keep both / and /index.html entry forms within the same document.
    var url = location.pathname + '#' + route.route;
    try {
      if (mode === 'push') history.pushState(entry, '', url);
      else history.replaceState(entry, '', url);
    } catch (_) {
      // Storage/history restrictions must not prevent a usable passage.
    }
    activeRoute = route; activeContext = cleanContext(context);
    lastSignature = signature(); syncBackStack(); remember();
  }

  function beginEntry() {
    token++; pending = 0; readyCallbacks = [];
    timers.forEach(clearTimeout); timers = [];
  }
  function later(callback, delay) {
    var expected = token;
    pending++;
    var timer = setTimeout(function () {
      var i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1);
      if (expected !== token) return;
      try { callback(); } finally {
        if (expected === token && --pending === 0) {
          var callbacks = readyCallbacks; readyCallbacks = [];
          callbacks.forEach(function (ready) { ready(); });
        }
      }
    }, delay);
    timers.push(timer); return timer;
  }
  function reflectionReady() {
    var selected = global._sortThroughSelected;
    if (!Array.isArray(selected) || selected.length < 2) {
      try { selected = JSON.parse(get('mm_st_paths_chips')); } catch (_) { selected = null; }
    }
    return Array.isArray(selected) && selected.length > 1 && selected.every(function (id) {
      return typeof id === 'string' && typeof global._sortThroughGetChip === 'function' && global._sortThroughGetChip(id);
    });
  }
  function safeRoute(route) {
    if (!route || route.type === 'external') return registry.byKey['page/home'];
    if (route.passageId === 'sort-through-reflect' && !reflectionReady()) return registry.byKey['page/sort-through'];
    var passage = document.getElementById(route.passageId);
    var card = route.cardId && document.getElementById(route.cardId);
    if (!passage || !passage.classList.contains('passage') || (route.cardId && (!card || !passage.contains(card)))) {
      return registry.byKey['page/home'];
    }
    return route;
  }
  function captureContext(route) {
    var passage = document.getElementById(route.passageId);
    return cleanContext({
      prepare: !!(passage && passage._antOverrideActive),
      library: get('mm_from_library') === 'fresh',
      analytics: global._mmAnalyticsContext,
      controlOrigin: global._ccgFromPassage
    });
  }
  function setEntryContext(route, context, source) {
    // A URL carries no inherited transient mode or pending card request.
    if (source === 'direct') {
      ['mm_values_context', 'mm_urge_focus', 'mm_el_mode'].forEach(function (key) { set(key, null); });
    }
    if (route.passageId === 'emotion-labeling') set('mm_el_mode', route.mode === 'checkin' ? 'checkin' : 'distress');
    if (route.passageId === 'control-check-guided') global._ccgFromPassage = context.controlOrigin;
    if (source !== 'forward') {
      // Rebuild presentation context, not another user's answers or data.
      document.querySelectorAll('.tlib-back-injected').forEach(function (e) { e.remove(); });
      document.querySelectorAll('.passage-library-context').forEach(function (e) { e.classList.remove('passage-library-context'); });
      set('mm_from_library', context.library ? 'fresh' : null);
    }
    var passage = document.getElementById(route.passageId);
    if (passage && context.prepare && global._antBreadcrumbOverrides[route.passageId]) {
      var breadcrumb = passage.querySelector('.passage-breadcrumb');
      if (breadcrumb) {
        if (!(route.passageId in global._antOriginalBreadcrumbs)) global._antOriginalBreadcrumbs[route.passageId] = breadcrumb.innerHTML;
        breadcrumb.innerHTML = global._antBreadcrumbOverrides[route.passageId];
        passage._antOverrideActive = true;
      }
    }
    if (source !== 'forward' && !context.prepare && passage) {
      passage._antOverrideActive = false;
      var original = global._antOriginalBreadcrumbs[route.passageId];
      var currentBreadcrumb = passage.querySelector('.passage-breadcrumb');
      if (original && currentBreadcrumb) currentBreadcrumb.innerHTML = original;
    }
    if (typeof global.mmSetAnalyticsContext === 'function') global.mmSetAnalyticsContext(context.analytics);
  }
  function focusTarget(route, localCard, expected) {
    function ready() {
      if (expected !== token || global._currentPage !== route.passageId) return;
      var passage = document.getElementById(route.passageId);
      var card = document.getElementById(localCard || route.cardId);
      if (!card || !passage.contains(card)) return;
      // Targeted entry skips fades; remove stale styles from an interrupted prior fade.
      for (var node = card; node && node !== passage; node = node.parentElement) {
        node.style.opacity = '1'; node.style.pointerEvents = '';
      }
      if (route.expand) {
        var button = card.querySelector('.learn-more-btn');
        if (button && button.getAttribute('aria-expanded') !== 'true') global.toggleLearn(button);
      }
      var focus = card.querySelector('h2,h3,.learn-more-btn') || card;
      if (!focus.matches('button,a,input,textarea,select')) focus.setAttribute('tabindex', '-1');
      focus.focus({ preventScroll: true });
      // Leave room for the fixed Home/Settings controls on narrow viewports.
      card.style.scrollMarginTop = '64px';
      card.scrollIntoView({ block: 'start', behavior: global._safeScrollBehavior ? global._safeScrollBehavior() : 'auto' });
      card.classList.add('search-highlight');
      // Highlight removal is cosmetic and must not block entry readiness.
      setTimeout(function () { if (expected === token) card.classList.remove('search-highlight'); }, 1700);
      var announcer = document.getElementById('a11y-announcer');
      if (announcer) announcer.textContent = 'Navigated to: ' + (focus.textContent.trim() || route.name);
    }
    // Complete from the actual entry lifecycle, not a timing guess or background rAF.
    if (pending) readyCallbacks.push(ready);
    else ready();
  }
  function navigate(candidate, options) {
    options = options || {};
    var route = safeRoute(candidate), source = options.source || 'forward';
    var context = cleanContext(options.context || (source === 'forward' ? captureContext(route) : null));
    var oldRoute = activeRoute;
    var cardOnly = source === 'traverse' && oldRoute && oldRoute.passageId === route.passageId &&
      oldRoute.mode === route.mode && !!route.cardId;
    beginEntry(); targeted = !!(route.cardId || options.localCard);
    traversal = source === 'traverse'; entryMode = route.mode || null;
    try {
      setEntryContext(route, context, source);
      if (!cardOnly) {
        // A cancelled entry fade must not leave this passage's other cards invisible.
        document.getElementById(route.passageId).querySelectorAll('[style]').forEach(function (element) {
          if (element.style.opacity === '0' && element.style.pointerEvents === 'none') {
            element.style.opacity = '1'; element.style.pointerEvents = ''; element.style.transition = '';
          }
        });
        rawGo(route.passageId);
      } else if (typeof global.mmApplyLibraryContext === 'function') {
        global.mmApplyLibraryContext(route.passageId, context.library);
      }
      if (traversal) global._mmOpenContext = context.analytics;
    } finally { traversal = false; targeted = false; entryMode = null; }
    if (options.mode === 'traverse' && route === candidate) {
      activeRoute = route; activeContext = context;
      lastSignature = signature(); syncBackStack(); remember();
    } else saveEntry(route, context, options.mode === 'traverse' ? 'replace' : (options.mode || 'push'));
    if (route.cardId || options.localCard) focusTarget(route, options.localCard, token);
    return route;
  }
  function routeForPassage(id) {
    id = global.resolveRetiredPassage(id);
    if (id === 'emotion-labeling' && get('mm_el_mode') === 'checkin') return registry.byKey['tool/check-in'];
    if (id === 'urges') {
      var suffix = get('mm_urge_focus');
      if (suffix) {
        set('mm_urge_focus', null);
        return registry.forTarget(id, 'card-urges-' + suffix);
      }
    }
    return registry.forTarget(id);
  }
  function openTarget(id, card) {
    var resolved = global.resolveRetiredPassage(id);
    var route = registry.forTarget(resolved, card);
    // Preserve older valid local Toolbox anchors without inventing public slugs.
    var element = card && document.getElementById(card);
    var passage = document.getElementById(resolved);
    var localCard = !route.cardId && element && passage && passage.contains(element) ? card : null;
    return navigate(route, { localCard: localCard });
  }
  function back(fallback) {
    if (waitingForBack) return;
    for (var i = cursor - 1; i >= backFloor; i--) {
      var route = registry.byKey[entries[i].route];
      if (skipBack.indexOf(route.passageId) < 0) {
        waitingForBack = true;
        history.go(i - cursor);
        return;
      }
    }
    navigate(registry.forTarget(global.resolveRetiredPassage(fallback || 'triage')), { source: 'traverse' });
  }
  function urlChanged() {
    waitingForBack = false;
    // popstate and hashchange can describe the same browser transition.
    if (signature() === lastSignature) return;
    if (location.hash === '#main-content') {
      if (activeRoute) saveEntry(activeRoute, activeContext, 'adopt');
      var main = document.getElementById('main-content');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
      return;
    }
    var parsed = registry.parse(location.hash);
    var index = entryForState(history.state);
    if (index >= 0 && entries[index].route === parsed.route.route && parsed.valid) {
      cursor = index;
      navigate(parsed.route, { mode: 'traverse', source: 'traverse', context: entries[index].context });
    } else {
      // Manual hash edits already created a browser entry. Adopt it, never push again.
      navigate(parsed.route, { mode: 'adopt', source: 'direct' });
    }
  }

  global.MMNavigation = Object.freeze({
    openTarget: openTarget, back: back, later: later,
    isTraversal: function () { return traversal; },
    entryMode: function () { return entryMode; },
    isTargeted: function () { return targeted; }
  });
  global.go = function (id) { return navigate(routeForPassage(id)); };
  global.goStartOver = function () {
    beginEntry();
    rawStartOver();
    saveEntry(registry.byKey['page/home'], null, 'push');
    backFloor = cursor; syncBackStack(); remember();
  };
  // A skip link should not replace a permanent tool URL or create a history entry.
  var skipLink = document.querySelector('.skip-link[href="#main-content"]');
  if (skipLink) skipLink.addEventListener('click', function (event) {
    event.preventDefault();
    var main = document.getElementById('main-content');
    main.setAttribute('tabindex', '-1'); main.focus();
  });

  try {
    var saved = JSON.parse(get(storageKey));
    if (saved && Array.isArray(saved.entries) && saved.entries.length <= 200) {
      entries = saved.entries.filter(function (e) {
        return e && e.mmNav === 1 && typeof e.id === 'string' && /^[a-z0-9-]+$/.test(e.id) &&
          registry.byKey[e.route] && registry.byKey[e.route].type !== 'external';
      }).map(function (e) { return { mmNav: 1, id: e.id, route: e.route, context: cleanContext(e.context) }; });
      cursor = entryForState(history.state);
      backFloor = Number.isInteger(saved.backFloor) ? Math.max(0, Math.min(saved.backFloor, entries.length - 1)) : 0;
    }
  } catch (_) {}
  if (cursor < 0) { entries = []; backFloor = 0; }
  var initial = registry.parse(location.hash);
  // Exactly one replace on boot. Do not manufacture a home visit before PDF entry.
  if (initial.explicit) navigate(initial.route, { mode: 'replace', source: 'direct' });
  else saveEntry(registry.byKey['page/home'], null, 'replace');
  global.addEventListener('popstate', urlChanged);
  global.addEventListener('hashchange', urlChanged);
  global.addEventListener('pageshow', function (event) {
    if (event.persisted && signature() !== lastSignature) urlChanged();
  });
})(window);
