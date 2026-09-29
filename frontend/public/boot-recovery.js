// Keeps the app loading while a new version is being deployed.
//
// While a deploy switches over, a request for a new /assets/ file can briefly fail (the file
// hasn't reached this data centre yet), or an old tab can ask for a file the new deploy removed.
// Older deploys also answered such requests with index.html marked immutable for a year, which
// the browser then kept as the "script". When an /assets/ script or stylesheet fails to load:
// download the page's asset files again past the browser cache (overwriting bad copies), wait a
// little longer on each attempt, and reload. After a few attempts the loading screen shows a
// "Try again" button instead of spinning forever.
// An external file, because the CSP forbids inline scripts.
(function () {
  var KEY = 'crm_asset_recovery';
  var DELAYS = [0, 2000, 5000, 10000];   // wait before each attempt (deploys settle within seconds)
  var EPISODE_MS = 3 * 60 * 1000;         // attempts older than this start a fresh count
  var busy = false;

  function readState() {
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (s && Date.now() - s.t < EPISODE_MS) return s;
    } catch (e) { /* storage unavailable */ }
    return { n: 0, t: Date.now() };
  }

  function writeState(s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  function splashText(text) {
    var el = document.querySelector('#boot-splash [data-boot-status]');
    if (el) el.textContent = text;
  }

  function showFailure(text) {
    var splash = document.getElementById('boot-splash');
    if (!splash) return;
    splashText(text || "Couldn't load the app");
    if (splash.querySelector('[data-boot-retry]')) return;
    var spinner = splash.querySelector('.boot-spinner');
    if (spinner) spinner.style.display = 'none';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-boot-retry', '');
    btn.textContent = 'Try again';
    btn.style.cssText = 'margin-top:8px;padding:8px 18px;border-radius:10px;border:0;background:#6366f1;color:#fff;font:600 13px/1.2 inherit;cursor:pointer;';
    btn.addEventListener('click', function () { reset(); recover(); });
    splash.appendChild(btn);
  }

  function reset() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
  }

  /** Re-download the page's assets past the cache, then reload. Resolves false when out of attempts. */
  function recover(extraUrl) {
    if (busy) return Promise.resolve(true);
    var s = readState();
    if (s.n >= DELAYS.length || !writeState({ n: s.n + 1, t: s.t })) {
      showFailure();
      return Promise.resolve(false);
    }
    busy = true;
    splashText('Updating to the latest version…');
    var prefix = location.origin + '/assets/';
    var urls = [];
    var els = document.querySelectorAll('script[src], link[href]');
    for (var i = 0; i < els.length; i++) {
      var u = els[i].src || els[i].href;
      if (u && u.indexOf(prefix) === 0) urls.push(u);
    }
    if (extraUrl && extraUrl.indexOf(prefix) === 0) urls.push(extraUrl);
    return new Promise(function (resolve) { setTimeout(resolve, DELAYS[s.n]); })
      .then(function () {
        return Promise.all(urls.map(function (u) {
          return fetch(u, { cache: 'reload', credentials: 'same-origin' }).catch(function () { /* offline */ });
        }));
      })
      .then(function () {
        location.reload();
        return true;
      });
  }

  // Load errors don't bubble: listen in the capture phase. While the app is starting, recover
  // right away; once it runs, only tell it (it offers a reload, so nobody loses unsaved work).
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || (el.tagName !== 'SCRIPT' && el.tagName !== 'LINK')) return;
    var u = el.src || el.href || '';
    if (u.indexOf('/assets/') === -1) return;
    if (document.getElementById('boot-splash')) recover(u);
    else window.dispatchEvent(new CustomEvent('crm:stale-assets', { detail: u }));
  }, true);

  // Still on the loading screen long after a normal start: offer a way out
  setTimeout(function () {
    if (!busy && document.getElementById('boot-splash')) {
      showFailure('This is taking longer than usual');
    }
  }, 25000);

  // Used by the app (see src/lib/deployRecovery.ts)
  window.__crmRecoverAssets = recover;
  window.__crmResetAssetRecovery = reset;
})();
