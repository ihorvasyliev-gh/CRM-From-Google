// Recovers the app when the browser cache holds a broken copy of a code file.
//
// While a deploy switches over, a request for a new /assets/ file can briefly get the SPA's
// index.html instead (200, text/html). _headers marks /assets/* as immutable for a year, so the
// browser keeps that HTML as the "script" and the app hangs on the loading screen even after a
// reload. When an /assets/ script or stylesheet fails to load, download the page's asset files
// again past the cache (which overwrites the bad copies), then reload once.
// An external file, because the CSP forbids inline scripts.
(function () {
  var KEY = 'asset_recovery_at';

  function recover(extraUrl) {
    try {
      var last = parseInt(sessionStorage.getItem(KEY) || '0', 10);
      if (Date.now() - last < 30000) return Promise.resolve(false);
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch (e) {
      return Promise.resolve(false);
    }
    var prefix = location.origin + '/assets/';
    var urls = [];
    var els = document.querySelectorAll('script[src], link[href]');
    for (var i = 0; i < els.length; i++) {
      var u = els[i].src || els[i].href;
      if (u && u.indexOf(prefix) === 0) urls.push(u);
    }
    if (extraUrl && extraUrl.indexOf(prefix) === 0) urls.push(extraUrl);
    return Promise.all(urls.map(function (u) {
      return fetch(u, { cache: 'reload', credentials: 'same-origin' }).catch(function () { /* offline */ });
    })).then(function () {
      location.reload();
      return true;
    });
  }

  // Load errors don't bubble: listen in the capture phase
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || (el.tagName !== 'SCRIPT' && el.tagName !== 'LINK')) return;
    var u = el.src || el.href || '';
    if (u.indexOf('/assets/') !== -1) recover(u);
  }, true);

  // Used by the app's ErrorBoundary when a lazily loaded page fails to load
  window.__crmRecoverAssets = recover;
})();
