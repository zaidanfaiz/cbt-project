const DOKPLOY_BASE_URL = 'https://butuncloud.online/api';

function dokployHeaders() {
  const token = process.env.DOKPLOY_ADMIN_TOKEN;
  if (!token) {
    throw new Error('DOKPLOY_ADMIN_TOKEN belum diisi di environment variable.');
  }

  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': token,
    'Content-Type': 'application/json',
  };
}

async function dokployRequest(path, options = {}) {
  const response = await fetch(`${DOKPLOY_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...dokployHeaders(),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.message || payload.error || 'Request Dokploy gagal.';
    throw new Error(message);
  }

  return payload;
}

async function restartDockerContainer(containerId) {
  return dokployRequest('/docker.restartContainer', {
    method: 'POST',
    body: JSON.stringify({ containerId }),
  });
}

async function getSystemHealth() {
  return dokployRequest('/settings.health', {
    method: 'GET',
  });
}

module.exports = {
  restartDockerContainer,
  getSystemHealth,
};
