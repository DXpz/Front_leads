/**
 * Base URL del backend (sin barra final).
 * - Vacío: en `npm run dev` las peticiones van al mismo origen y Vite reenvía `/api` → `http://localhost:3001` (ver vite.config).
 * - Producción o preview sin proxy: `VITE_API_BASE_URL=http://localhost:3001` (la API permite CORS `*`).
 */
const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
const API_BASE = rawApiBase.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const headers = {
    ...options?.headers,
    'ngrok-skip-browser-warning': 'true',
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

