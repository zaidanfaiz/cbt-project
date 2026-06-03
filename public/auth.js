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

googleButton.addEventListener('click', () => {
  setStatus('Membuka Google...');
  window.location.href = `/api/auth/google/start?next=${encodeURIComponent(nextUrl())}`;
});

const params = new URLSearchParams(window.location.search);
if (params.get('error')) {
  setStatus(params.get('error'), true);
}

setMode('signin');
