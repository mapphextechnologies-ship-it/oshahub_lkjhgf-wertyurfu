/**
 * Shared admin UI auth: stores X-Admin-Key in sessionStorage and wraps fetch.
 * If the server has no admin key configured, requests work without a prompt.
 */
(function (global) {
  var STORAGE_KEY = "salama_admin_api_key";

  function getAdminKey() {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  }

  function setAdminKey(key) {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  function ensureAdminKey() {
    var existing = getAdminKey();
    if (existing) return existing;
    var entered = window.prompt(
      "Enter Admin API key (X-Admin-Key).\n\nLeave blank only if SALAMA_ADMIN_API_KEY is unset on the server.",
      ""
    );
    if (entered === null) return "";
    entered = entered.trim();
    if (entered) setAdminKey(entered);
    return entered;
  }

  function adminFetch(url, options) {
    options = options || {};
    var headers = new Headers(options.headers || {});
    var key = getAdminKey() || ensureAdminKey();
    if (key) headers.set("X-Admin-Key", key);

    return fetch(url, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (res.status === 401) {
        setAdminKey("");
        var retryKey = ensureAdminKey();
        if (!retryKey) return res;
        headers.set("X-Admin-Key", retryKey);
        return fetch(url, Object.assign({}, options, { headers: headers }));
      }
      return res;
    });
  }

  function clearAdminKey() {
    setAdminKey("");
  }

  global.SalamaAdminAuth = {
    getAdminKey: getAdminKey,
    setAdminKey: setAdminKey,
    ensureAdminKey: ensureAdminKey,
    adminFetch: adminFetch,
    clearAdminKey: clearAdminKey,
  };
})(window);
