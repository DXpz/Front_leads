/**
 * Base URL del backend (sin barra final).
 * - Vacío: en `npm run dev` las peticiones van al mismo origen y Vite reenvía `/api` → `http://localhost:3001` (ver vite.config).
 * - Producción o preview sin proxy: `VITE_API_BASE_URL=http://localhost:3001` (la API permite CORS `*`).
 */
const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
const API_BASE = rawApiBase.replace(/\/+$/, '');

/** Clave de API (definir en `.env` como `VITE_API_KEY=...`). Se envía en `X-API-Key`. */
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined)?.trim() ?? '';

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const headers = new Headers();
  headers.set('ngrok-skip-browser-warning', 'true');
  if (API_KEY) headers.set('X-API-Key', API_KEY);
  if (options?.headers) {
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

