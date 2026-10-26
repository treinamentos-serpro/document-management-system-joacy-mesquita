const API_PREFIX = '/api';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('Não foi possível conectar ao servidor. Tente novamente.', { cause: error });
  }

  if (!response.ok) {
    let message = `Não foi possível concluir a operação (HTTP ${response.status}).`;
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.json();
      if (typeof body.error?.message === 'string' && body.error.message) {
        message = body.error.message;
      }
    }
    throw new Error(message);
  }
  return response;
}

async function requestJson(path, options) {
  const response = await request(path, options);
  return response.json();
}

export async function listDocuments({ signal } = {}) {
  return requestJson('/documents', { signal });
}

export async function uploadDocument(file) {
  if (!file) throw new Error('Selecione um arquivo para enviar.');
  const body = new FormData();
  body.append('file', file);
  return requestJson('/upload', { method: 'POST', body });
}

export async function downloadDocument(id) {
  const response = await request(`/documents/${encodeURIComponent(id)}/download`);
  return response.blob();
}
