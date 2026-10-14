// Applies the saved theme before first paint (loaded as a blocking script from index.html),
// so dark-mode users never see a flash of the light theme. Kept as a file rather than an
// inline script so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('theme');
    var dark =
      t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch {
    // Storage may be unavailable (private mode); the app falls back to the system theme.
  }
})();
