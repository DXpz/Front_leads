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

function withNgrokBypass(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    if (u.hostname.endsWith('ngrok-free.dev') && !u.searchParams.has('ngrok-skip-browser-warning')) {
      u.searchParams.set('ngrok-skip-browser-warning', 'true');
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Wrapper común para API:
 * - añade bypass del warning de ngrok free.
 * - mantiene flexibilidad de headers del caller.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('ngrok-skip-browser-warning')) {
    headers.set('ngrok-skip-browser-warning', 'true');
  }
  
  const url = withNgrokBypass(apiUrl(path));
  console.debug(`API Call: ${init?.method || 'GET'} ${url}`);
  
  return fetch(url, { ...init, headers })
    .then(response => {
      console.debug(`API Response: ${response.status} ${response.statusText} for ${init?.method || 'GET'} ${url}`);
      return response;
    })
    .catch(error => {
      console.error(`API Error: ${error.message} for ${init?.method || 'GET'} ${url}`);
      throw error;
    });
}

