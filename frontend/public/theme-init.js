// Apply saved theme & density before first paint (prevents a dark flash for light-theme users)
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    if (!dark) {
      root.setAttribute('data-boot-theme', 'light');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f3f5f8');
    }
    if (localStorage.getItem('view_density') === 'compact') root.classList.add('density-compact');
  } catch (e) { /* storage unavailable */ }
})();
