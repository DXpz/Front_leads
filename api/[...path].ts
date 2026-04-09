import type { VercelRequest, VercelResponse } from '@vercel/node';

const upstreamRaw = () => (process.env.API_UPSTREAM ?? '').trim().replace(/\/+$/, '');

/**
 * Proxy /api/* → API_UPSTREAM (http del servidor real).
 * Evita contenido mixto: el cliente llama a https://tu-app.vercel.app/api/... en el mismo origen.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const base = upstreamRaw();
  if (!base) {
    res.status(500).json({ error: 'API_UPSTREAM no está definida en Vercel (URL del backend, ej. http://200.35.189.139).' });
    return;
  }

  const pathParam = req.query.path;
  const suffix = Array.isArray(pathParam)
    ? pathParam.map(String).join('/')
    : typeof pathParam === 'string'
      ? pathParam
      : '';

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (typeof value === 'string') search.append(key, value);
    else if (Array.isArray(value)) for (const v of value) search.append(key, String(v));
  }
  const qs = search.toString();
  const target = `${base}/api/${suffix}${qs ? `?${qs}` : ''}`;

  const headers = new Headers();
  const apiKey = req.headers['x-api-key'];
  if (apiKey) headers.set('X-API-Key', Array.isArray(apiKey) ? apiKey[0] : apiKey);
  headers.set('ngrok-skip-browser-warning', 'true');

  const contentType = req.headers['content-type'];
  if (contentType) headers.set('Content-Type', Array.isArray(contentType) ? contentType[0] : contentType);
  const accept = req.headers['accept'];
  if (accept) headers.set('Accept', Array.isArray(accept) ? accept[0] : accept);

  const method = req.method ?? 'GET';
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else if (req.body != null && typeof req.body === 'object') {
      body = JSON.stringify(req.body);
      if (!contentType) headers.set('Content-Type', 'application/json');
    }
  }

  const r = await fetch(target, { method, headers, body });

  const outType = r.headers.get('content-type');
  if (outType) res.setHeader('Content-Type', outType);

  res.status(r.status);
  res.send(Buffer.from(await r.arrayBuffer()));
}
