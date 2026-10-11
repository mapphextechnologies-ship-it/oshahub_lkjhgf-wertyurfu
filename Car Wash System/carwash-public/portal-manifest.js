(() => {
  const pathname = window.location.pathname;
  const manifestPath = pathname === '/washer'
    ? '/washer.webmanifest'
    : pathname === '/receptionist'
      ? '/receptionist.webmanifest'
      : '/manifest.webmanifest';
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = manifestPath;
})();
