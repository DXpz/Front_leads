export default async function handler(req, res) {
  const base = (process.env.API_UPSTREAM ?? '').trim().replace(/\/+$/, '');

  if (!base) {
    res.status(500).json({ error: 'API_UPSTREAM no definida en Vercel → Settings → Environment Variables.' });
    return;
  }

  // Reconstruir el sufijo de ruta desde el parámetro catch-all
  const pathParam = req.query.path;
  const suffix = Array.isArray(pathParam)
    ? pathParam.join('/')
    : typeof pathParam === 'string'
    ? pathParam
    : '';

  // Reenviar query string (excepto el parámetro interno "path")
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    const v = Array.isArray(value) ? value : [String(value)];
    for (const val of v) qs.append(key, val);
  }
  const queryString = qs.toString();
  const target = `${base}/api/${suffix}${queryString ? `?${queryString}` : ''}`;

  // Cabeceras al upstream
  const headers = {};
  headers['ngrok-skip-browser-warning'] = 'true';
  const apiKey = req.headers['x-api-key'];
  if (apiKey) headers['X-API-Key'] = Array.isArray(apiKey) ? apiKey[0] : apiKey;
  const contentType = req.headers['content-type'];
  if (contentType) headers['Content-Type'] = Array.isArray(contentType) ? contentType[0] : contentType;
  const accept = req.headers['accept'];
  if (accept) headers['Accept'] = Array.isArray(accept) ? accept[0] : accept;

  const method = req.method ?? 'GET';
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.body != null) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!contentType) headers['Content-Type'] = 'application/json';
    }
  }

  const upstream = await fetch(target, { method, headers, body });

  const outType = upstream.headers.get('content-type');
  if (outType) res.setHeader('Content-Type', outType);
  res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
}
