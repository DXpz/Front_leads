export default async function handler(req, res) {
  const base = (process.env.API_UPSTREAM ?? '').trim().replace(/\/+$/, '');

  if (!base) {
    res.status(500).json({ error: 'API_UPSTREAM no definida en Vercel.' });
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
  const upstreamHeaders = {};
  upstreamHeaders['ngrok-skip-browser-warning'] = 'true';
  const apiKey = req.headers['x-api-key'];
  if (apiKey) upstreamHeaders['X-API-Key'] = Array.isArray(apiKey) ? apiKey[0] : apiKey;
  const contentType = req.headers['content-type'];
  if (contentType) upstreamHeaders['Content-Type'] = Array.isArray(contentType) ? contentType[0] : contentType;
  const accept = req.headers['accept'];
  if (accept) upstreamHeaders['Accept'] = Array.isArray(accept) ? accept[0] : accept;

  const method = req.method ?? 'GET';
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.body != null) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (!contentType) upstreamHeaders['Content-Type'] = 'application/json';
    }
  }

  try {
    const upstream = await fetch(target, { method, headers: upstreamHeaders, body });

    // Cabeceras que NO se deben propagar al cliente:
    // - caché: evitan 304 en el proxy
    // - content-encoding/transfer-encoding: Node fetch descomprime automáticamente,
    //   reenviar content-encoding causaría que el browser intente re-descomprimir datos ya planos
    // - content-length: el tamaño del buffer ya descomprimido puede diferir del original
    const STRIP_HEADERS = [
      'etag', 'last-modified', 'cache-control', 'expires', 'pragma',
      'content-encoding', 'transfer-encoding', 'content-length',
    ];

    const outType = upstream.headers.get('content-type');
    if (outType) res.setHeader('Content-Type', outType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    upstream.headers.forEach((value, key) => {
      if (!STRIP_HEADERS.includes(key.toLowerCase())) {
        try { res.setHeader(key, value); } catch (_) {}
      }
    });

    // Si el upstream devuelve 304 el proxy no tiene body; devolvemos 200 vacío
    const statusCode = upstream.status === 304 ? 200 : upstream.status;
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(statusCode).send(buffer);
  } catch (err) {
    console.error('[proxy] Error al contactar upstream:', target, err);
    res.status(502).json({
      error: 'No se pudo conectar con el backend.',
      target,
      detail: String(err),
    });
  }
}
