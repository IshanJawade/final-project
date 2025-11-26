import { getDeviceFingerprint } from './fingerprint';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  signal?: AbortSignal;
};

export class ApiError extends Error {
  status: number;
  detail?: string;
  data?: unknown;

  constructor(status: number, detail?: string, data?: unknown) {
    super(detail || `Request failed with status ${status}`);
    this.status = status;
    this.detail = detail;
    this.data = data;
  }
}

const isJsonPayload = (body: unknown) => body !== undefined && !(body instanceof FormData);

export const apiRequest = async <T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, headers, token, signal } = options;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  const requestHeaders: Record<string, string> = {
    'x-device-fingerprint': getDeviceFingerprint(),
    ...(headers || {})
  };

  const isJson = isJsonPayload(body);
  if (isJson) {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
  }
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    body: isJson ? JSON.stringify(body) : (body as BodyInit | undefined),
    headers: requestHeaders,
    credentials: 'include',
    signal
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  const expectsJson = contentType.includes('application/json');
  const payload = expectsJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = expectsJson && payload?.detail ? String(payload.detail) : response.statusText;
    throw new ApiError(response.status, detail, expectsJson ? payload : undefined);
  }

  return payload as T;
};
