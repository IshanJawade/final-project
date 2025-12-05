const DEFAULT_BASE = import.meta.env.DEV ? 'http://localhost:4000' : '/api';
const rawBase = import.meta.env.VITE_API_URL;
export const API_BASE = rawBase !== undefined && rawBase !== null && rawBase !== '' ? String(rawBase) : DEFAULT_BASE;

function buildUrl(path) {
  const base = API_BASE && API_BASE !== '/' ? API_BASE.replace(/\/$/, '') : API_BASE;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base || base === '/') {
    return normalizedPath;
  }

  if (/^https?:\/\//i.test(base)) {
    return new URL(normalizedPath, `${base}/`).toString();
  }

  if (normalizedPath.startsWith(base)) {
    return normalizedPath;
  }

  return `${base}${normalizedPath}`;
}

export function resolveApiUrl(path) {
  if (typeof path === 'string' && /^https?:\/\//i.test(path)) {
    return path;
  }
  return buildUrl(path || '/');
}

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(resolveApiUrl(path), {
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
