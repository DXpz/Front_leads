export default async function handler(req, res) {
  const upstream = (process.env.API_UPSTREAM ?? '').trim().replace(/\/+$/, '');
  if (!upstream) {
    res.status(500).json({ ok: false, error: 'API_UPSTREAM NO está definida en Vercel.' });
    return;
  }

  const key = process.env.VITE_API_KEY ?? '';
  const headers = { 'X-API-Key': key, 'ngrok-skip-browser-warning': 'true' };

  const tests = {};
  for (const path of ['/api/state', '/api/metrics/lista-asesores']) {
    try {
      const r = await fetch(`${upstream}${path}`, { headers });
      tests[path] = { status: r.status, body: await r.text() };
    } catch (e) {
      tests[path] = { error: String(e) };
    }
  }

  res.status(200).json({ ok: true, API_UPSTREAM: upstream, tests });
}
