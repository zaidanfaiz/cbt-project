(function () {
  const TOKEN_KEY = 'zdnch-insforge-access-token';
  const USER_KEY = 'zdnch-insforge-user';
  const publicPaths = ['/', '/auth', '/auth.html'];

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setSession(accessToken, user) {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (_error) {
      return null;
    }
  }

  function isPublicPath() {
    return publicPaths.includes(window.location.pathname);
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const token = getToken();
    if (token && url && url.startsWith('/api/') && !url.startsWith('/api/auth/signin') && !url.startsWith('/api/auth/signup')) {
      const headers = new Headers(init.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      init.headers = headers;
    }
    return nativeFetch(input, init);
  };

  function renderAuthBar() {
    const topbar = document.querySelector('.topbar, .exam-topbar');
    if (!topbar || topbar.querySelector('.auth-pill')) return;
    const user = getUser();
    const wrapper = document.createElement('div');
    wrapper.className = 'auth-pill';
    wrapper.innerHTML = user
      ? `<span>${user.email || 'Pengguna'}</span><button class="button secondary compact" type="button" data-auth-signout>Keluar</button>`
      : '<a class="button primary compact" href="/auth">Masuk</a>';
    topbar.appendChild(wrapper);
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-auth-signout]');
    if (!button) return;
    event.preventDefault();
    try {
      await nativeFetch('/api/auth/signout', { method: 'POST' });
    } catch (_error) {
      // Local session cleanup is enough for this lightweight app.
    }
    clearSession();
    window.location.href = '/auth';
  });

  document.addEventListener('DOMContentLoaded', () => {
    renderAuthBar();
    if (!isPublicPath() && !getToken()) {
      window.location.href = `/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  });

  window.ZDNCHAuth = {
    getToken,
    getUser,
    setSession,
    clearSession,
    nativeFetch,
  };
})();
