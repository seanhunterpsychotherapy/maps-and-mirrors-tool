/* Disposable same-origin browser fixture. Activated by its visible Run button. */
(function () {
  var rows = [], frame, win;
  var display = document.getElementById('results');
  var pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function settled(test) {
    const until=Date.now()+5000;
    while(!test()&&Date.now()<until)await pause(25);
  }
  function check(name, pass, details) {
    rows.push({ name, pass: !!pass, details: details || '' });
    display.textContent = JSON.stringify({ checks: rows.length, failures: rows.filter(r => !r.pass) }, null, 2);
  }
  async function load(hash, query, width) {
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    if (width) frame.style.width = width + 'px';
    var loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = 'frame.html' + (query || '') + '#' + hash;
    document.getElementById('frame').appendChild(frame);
    await loaded; win = frame.contentWindow; await pause(600);
    const target=MMRoutes.byKey[hash];
    if(target&&target.cardId)await settled(()=>win.document.getElementById(target.cardId).contains(win.document.activeElement));
  }
  function active() { return Array.from(win.document.querySelectorAll('.passage.active')).map(e => e.id).join(','); }
  function intact() {
    return win.sessionStorage.getItem('qa_unrelated') === 'KEEP_SESSION' &&
      win.localStorage.getItem('qa_unrelated') === 'KEEP_LOCAL' && win.localStorage.getItem('mm_bottles') === win.qaBottle &&
      win.localStorage.getItem('mm_toolbox') === win.qaToolbox &&
      JSON.parse(win.localStorage.getItem('mm_logs')).some(e=>e.timestamp==='2000-01-01T00:00:00.000Z');
  }
  function clean(name) {
    check(name + ' runtime errors', win.qaErrors.length === 0, win.qaErrors);
    check(name + ' private data excluded', !win.location.href.includes('SYNTHETIC_PRIVATE_SENTINEL') &&
      !JSON.stringify(win.history.state).includes('SYNTHETIC_PRIVATE_SENTINEL') &&
      !win.sessionStorage.getItem('mm_route_history_v1').includes('SYNTHETIC_PRIVATE_SENTINEL'));
  }
  async function nav(p) { win.go(p); await pause(650); }
  async function traverse(direction) { win.history[direction](); await pause(650); }
  async function contract(width) {
    for (const route of MMRoutes.routes.filter(r => r.type !== 'external')) {
      await load(route.route, '', width);
      const fallback = route.route === 'page/sort-through-reflection';
      check('Cold load ' + route.route, active() === (fallback ? 'sort-through' : route.passageId), active());
      check('Canonical ' + route.route, win.location.hash === '#' + (fallback ? 'page/sort-through' : route.route));
      check('No boot history push ' + route.route, win.history.length === win.qaInitialHistoryLength);
      check('No Continue ' + route.route, !win.document.querySelector('.welcome-back'));
      if (route.cardId) {
        const card = win.document.getElementById(route.cardId);
        const rect = card.getBoundingClientRect();
        check('Card focus ' + route.route, card.contains(win.document.activeElement));
        check('Card visible ' + route.route, rect.height > 0 && rect.top < win.innerHeight && rect.bottom > 0);
        if(width)check('Card clears fixed controls '+route.route,rect.top>=48,rect.top);
        if (route.expand) check('Disclosure ' + route.route, card.querySelector('.learn-more-btn').getAttribute('aria-expanded') === 'true');
      }
      if (route.mode) check('Mode ' + route.route, win._elMode === route.mode);
      if (width) check('No mobile overflow ' + route.route, win.document.documentElement.scrollWidth <= width + 1);
      check('Saved content ' + route.route, intact());
      clean(route.route);
    }
  }
  async function journeys() {
    for (const hash of ['tool/does-not-exist','page/professional-support','thoughts','page/growing','tool/%E0%A4%A','tool/thought-record?text=SYNTHETIC_PRIVATE_SENTINEL']) {
      await load(hash); check('Unknown fallback ' + hash, active() === 'triage' && win.location.hash === '#page/home'); clean(hash);
    }
    for (const old of ['struggling-new','soft-landing','struggling','thoughts','growing']) {
      await load('tool/thought-record','?last='+old);
      check('Stale pointer cannot override deep link '+old,active()==='distortions'&&!win.document.querySelector('.welcome-back')&&intact());
      await nav(old); check('Retired forward '+old,active()==='triage'&&intact());
      win.goStartOver();await pause(50);
      await nav('body'); win.goBack(old); await pause(650); check('Retired app Back fallback '+old,active()==='triage'&&intact());
      await nav('my-toolbox');
      const row=win.document.createElement('div');row.className='tb-row';row.setAttribute('data-tb-row-p',old);
      const button=win.document.createElement('button');row.appendChild(button);win.document.body.appendChild(row);win.tbRowOpen(button);
      await pause(650);check('Retired toolbox '+old,active()==='triage'&&intact());row.remove();
    }
    await load('page/home');
    for(const label of ['Help me settle','Help me sort through something','Help me prepare for something']) {
      const button=Array.from(win.document.querySelectorAll('#triage button')).find(b=>b.getAttribute('aria-label')===label||b.textContent.trim().startsWith(label));
      button.click();await pause(650);
      check('Doorway '+label,active()===({'Help me settle':'overwhelmed','Help me sort through something':'sort-through','Help me prepare for something':'anticipatory'})[label]);
      win.goStartOver();await pause(650);check('Start Over '+label,active()==='triage'&&win.location.hash==='#page/home'&&intact());
    }
    await load('page/tool-library');
    for(const item of win.TOOL_INDEX.filter(t=>!t.external)) {
      win.tlibOpen(item.passage,item.card);await pause(300);
      if(item.card)await settled(()=>win.document.getElementById(item.card).contains(win.document.activeElement));
      const route=win.MMRoutes.forTarget(item.passage,item.card);
      check('Library '+item.name,win.location.hash==='#'+route.route&&active()===route.passageId);
      if(item.card)check('Library card '+item.name,win.document.getElementById(item.card).contains(win.document.activeElement));
      await nav('tools-index');
    }
    // Native History API traversal; no private stack manipulation.
    await load('page/tool-library');
    win.tlibOpen('distortions','card-distortions-thought-record-4-steps');await pause(650);
    await traverse('back');check('Library native Back',active()==='tools-index');
    await traverse('forward');check('Library native Forward',win.location.hash==='#tool/thought-record');
    let count=win.history.length;
    await traverse('back');await traverse('forward');check('No traversal pushes',win.history.length===count);
    await load('page/prepare');
    win.goFromAnticipatory('body');await pause(650);await nav('wise-mind');
    await traverse('back');check('Prepare context restored',/Prepare/.test(win.document.querySelector('#body .passage-breadcrumb').textContent));
    await traverse('back');check('Doorway Back twice',active()==='anticipatory');
    await traverse('forward');await traverse('forward');check('Doorway Forward twice',active()==='wise-mind');
    await load('tool/thought-record');await nav('values');await traverse('back');
    check('PDF entry returns exactly',win.location.hash==='#tool/thought-record'&&win.document.getElementById('card-distortions-thought-record-4-steps').contains(win.document.activeElement));
    count=win.history.length;win.document.querySelector('.skip-link').click();await pause(50);
    check('Skip link preserves URL/history',win.location.hash==='#tool/thought-record'&&win.history.length===count&&win.document.activeElement.id==='main-content');
    await load('tool/looping-thought');count=win.history.length;
    const next=win.document.querySelector('#tsg-step-1 button');next.click();await pause(250);
    check('Guided next leaves URL/history',win.history.length===count&&win.location.hash==='#tool/looping-thought');
    win.goBack('thought-spiral');await pause(250);check('Guided app Back stays in exercise',active()==='thought-spiral-guided'&&win.history.length===count);
    await nav('values');await traverse('back');check('Guided re-entry Step 1',win.document.getElementById('tsg-step-1').style.display!=='none');
    await load('tool/check-in');await nav('values');await traverse('back');check('Check-in mode survives history',win._elMode==='checkin');
    await nav('emotion-labeling');check('Normal feeling route is distress',win._elMode==='distress'&&win.location.hash==='#tool/name-whats-here');
    await load('tool/temperature-shift');await nav('my-toolbox');
    win.document.querySelector('.tb-row-open').click();await pause(650);check('Valid toolbox anchor',win.location.hash==='#tool/temperature-shift'&&intact());
    await load('page/settle');win.goBodyTemperatureFromOverwhelmed();await pause(650);check('Temperature helper canonical',win.location.hash==='#tool/temperature-shift');
    win.setUrgeFocus('ride-it-out');await nav('urges');check('Urge helper canonical',win.location.hash==='#tool/ride-it-out');
    await load('tool/support-plan');win.go('support-plan-guided');win.go('distortions');await pause(650);
    check('Rapid entry cancellation',active()==='distortions'&&win.document.activeElement.id==='distortions');
    win.go('body');win.MMNavigation.openTarget('body','card-body-temperature-shift');await pause(650);
    check('Interrupted fade reveals other cards',Array.from(win.document.querySelectorAll('#body .tool-card')).every(c=>win.getComputedStyle(c).opacity!=='0'));
    await load('tool/thought-record');win.document.getElementById('dist-thought').value='SYNTHETIC_PRIVATE_SENTINEL';
    await nav('values');await traverse('back');clean('Typed thought');
    check('Analytics no private data',!JSON.stringify(win.qaEvents).includes('SYNTHETIC_PRIVATE_SENTINEL'));
    let opens=win.qaEvents.filter(e=>e.path.startsWith('open/')).length;
    await traverse('forward');await traverse('back');check('Traversal no duplicate opens',win.qaEvents.filter(e=>e.path.startsWith('open/')).length===opens);
    await load('tool/dearman');win.document.getElementById('dm-d').value='SYNTHETIC_PRIVATE_SENTINEL';
    win.tlibOpen('interpersonal','card-interpersonal-give-stay-connected-while-you-say-it');await pause(650);
    await traverse('back');check('Same-passage card Back',win.location.hash==='#tool/dearman'&&win.document.getElementById('dm-d').value==='SYNTHETIC_PRIVATE_SENTINEL');
    check('Same-passage direct context restored',!win.document.querySelector('#interpersonal .tlib-back-injected'));
    await traverse('forward');check('Same-passage Library context restored',!!win.document.querySelector('#interpersonal .tlib-back-injected'));
    win.location.hash='tool/wise-mind';await pause(650);check('Manual hash exact card',win.location.hash==='#tool/wise-mind'&&active()==='wise-mind');
    await traverse('back');check('Manual hash only one entry',win.location.hash==='#tool/give');
    await traverse('forward');check('Manual hash Forward',win.location.hash==='#tool/wise-mind');
    win.sessionStorage.setItem('qa_keep_history','1');
    await new Promise(resolve=>{frame.onload=resolve;win.location.reload();});win=frame.contentWindow;await pause(650);
    check('Reload current route',win.location.hash==='#tool/wise-mind'&&active()==='wise-mind');
    await traverse('back');check('Back after reload',win.location.hash==='#tool/give');
    win.sessionStorage.removeItem('qa_keep_history');
    await load('tool/thought-record');
    win.history.pushState({mmNav:1,id:'obsolete',route:'page/growing'},'','#page/growing');await nav('values');await traverse('back');
    check('Stale browser-history target recovers',active()==='triage'&&win.location.hash==='#page/home'&&intact());
    await load('tool/check-in','?blocked=1');check('Storage unavailable check-in',active()==='emotion-labeling'&&win._elMode==='checkin');
    check('Storage unavailable no errors',win.qaErrors.length===0,win.qaErrors);
  }
  async function run(mobile) {
    rows=[];document.getElementById('run').disabled=true;document.getElementById('mobile').disabled=true;
    try { await contract(mobile?390:null);if(!mobile)await journeys(); }
    catch(error){check('Suite exception',false,String(error.stack||error));}
    const report={mode:mobile?'390px':'desktop',checks:rows.length,passed:rows.filter(r=>r.pass).length,failures:rows.filter(r=>!r.pass),results:rows};
    display.textContent=JSON.stringify(report,null,2);
    try{await fetch('/qa-result/'+(mobile?'mobile':'desktop'),{method:'POST',body:JSON.stringify(report)});}catch(_){}
    document.getElementById('run').disabled=false;document.getElementById('mobile').disabled=false;
  }
  document.getElementById('run').onclick=()=>run(false);
  document.getElementById('mobile').onclick=()=>run(true);
})();
