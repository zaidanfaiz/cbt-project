import { createClient } from '/vendor/insforge-sdk/index.mjs';

const form = document.querySelector('#auth-form');
const nameRow = document.querySelector('#auth-name-row');
const nameField = document.querySelector('#auth-name');
const emailField = document.querySelector('#auth-email');
const passwordField = document.querySelector('#auth-password');
const modeButtons = document.querySelectorAll('[data-auth-mode]');
const submitButton = document.querySelector('#auth-submit');
const googleButton = document.querySelector('#auth-google');
const statusEl = document.querySelector('#auth-status');

let mode = 'signin';
let insforgeClient = null;

function nextUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('next') || '/';
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setMode(nextMode) {
  mode = nextMode;
  nameRow.hidden = mode !== 'signup';
  submitButton.textContent = mode === 'signup' ? 'Daftar' : 'Masuk';
  modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.authMode === mode));
}

async function configClient() {
  if (insforgeClient) return insforgeClient;
  const response = await fetch('/api/auth/config');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Gagal membaca konfigurasi auth.');
  insforgeClient = createClient({
    baseUrl: data.base_url,
    anonKey: data.anon_key,
  });
  return insforgeClient;
}

async function syncOAuthSession() {
  if (!window.location.search.includes('insforge_code=')) return;
  setStatus('Memproses login Google...');
  const client = await configClient();
  const { data, error } = await client.auth.getCurrentUser();
  if (error) throw error;
  const headers = client.getHttpClient().getHeaders();
  const token = String(headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !data || !data.user) throw new Error('Token Google OAuth tidak ditemukan.');
  window.ZDNCHAuth.setSession(token, data.user);
  window.location.href = nextUrl();
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.authMode));
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    name: nameField.value,
    email: emailField.value,
    password: passwordField.value,
  };

  try {
    const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin';
    const response = await window.ZDNCHAuth.nativeFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Autentikasi gagal.');
    if (!data.accessToken) {
      setStatus('Akun dibuat. Silakan cek email verifikasi lalu masuk kembali.');
      return;
    }
    window.ZDNCHAuth.setSession(data.accessToken, data.user);
    window.location.href = nextUrl();
  } catch (error) {
    setStatus(error.message, true);
  }
});

googleButton.addEventListener('click', async () => {
  try {
    setStatus('Membuka Google...');
    const client = await configClient();
    const { data, error } = await client.auth.signInWithOAuth('google', {
      redirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(nextUrl())}`,
      skipBrowserRedirect: true,
      additionalParams: { prompt: 'select_account' },
    });
    if (error) throw error;
    window.location.href = data.url;
  } catch (error) {
    setStatus(error.message, true);
  }
});

setMode('signin');
syncOAuthSession().catch((error) => setStatus(error.message, true));
