export default async function handler(req, res) {
  const base = (process.env.API_UPSTREAM ?? '').trim().replace(/\/+$/, '');

  if (!base) {
    return res.status(500).json({ error: 'API_UPSTREAM no definida en Vercel.' });
  }

  // _path viene del rewrite: /api/metrics/lista-asesores → ?_path=metrics/lista-asesores
  const pathParam = req.query._path ?? '';
  const suffix = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;

  // Reenviar query params originales (excepto _path)
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === '_path') continue;
    if (Array.isArray(v)) v.forEach((val) => qs.append(k, val));
    else qs.set(k, v);
  }
  const queryString = qs.toString();
  const target = `${base}/api/${suffix}${queryString ? `?${queryString}` : ''}`;

  // API Key: primero desde variable de servidor, luego desde header del cliente
  const upstreamHeaders = {};
  const serverKey = (process.env.API_KEY ?? '').trim();
  const clientKey = req.headers['x-api-key'];
  const key =
    serverKey ||
    (typeof clientKey === 'string' ? clientKey.trim() : Array.isArray(clientKey) ? clientKey[0] : '') ||
    '';
  if (key) upstreamHeaders['X-API-Key'] = key;

  const forwarded = ['content-type', 'accept', 'authorization'];
  for (const h of forwarded) {
    const val = req.headers[h];
    if (val) upstreamHeaders[h] = Array.isArray(val) ? val[0] : val;
  }

  const method = req.method ?? 'GET';
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    // Leer body como stream raw para no depender del body parser de Vercel
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
    if (body.length === 0) body = undefined;
  }

  // Cabeceras que NO deben propagarse al cliente:
  // - caché: evitan 304 en el proxy
  // - content-encoding/transfer-encoding: Node fetch descomprime automáticamente
  // - content-length: el buffer ya descomprimido puede diferir del tamaño original
  const STRIP_HEADERS = [
    'etag', 'last-modified', 'cache-control', 'expires', 'pragma',
    'content-encoding', 'transfer-encoding', 'content-length',
  ];

  try {
    const upstream = await fetch(target, { method, headers: upstreamHeaders, body });

    const outType = upstream.headers.get('content-type');
    if (outType) res.setHeader('Content-Type', outType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    upstream.headers.forEach((value, key) => {
      if (!STRIP_HEADERS.includes(key.toLowerCase())) {
        try { res.setHeader(key, value); } catch (_) {}
      }
    });

    const statusCode = upstream.status === 304 ? 200 : upstream.status;
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(statusCode).send(buffer);
  } catch (err) {
    console.error('[proxy] Error conectando a', target, err);
    res.status(502).json({ error: 'Error conectando al upstream.', target, detail: String(err) });
  }
}
