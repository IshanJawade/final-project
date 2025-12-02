export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = response.headers.get('Content-Type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson && payload && payload.message ? payload.message : 'Request failed';
    throw new Error(message);
  }

  return payload;
}
