export default async function handler(req, res) {
  const upstream = (process.env.API_UPSTREAM ?? '').trim().replace(/\/+$/, '');
  if (!upstream) {
    res.status(500).json({ ok: false, error: 'API_UPSTREAM NO está definida en Vercel.' });
    return;
  }

  let apiStatus = null;
  let apiBody = null;
  try {
    const r = await fetch(`${upstream}/api/state`, {
      headers: { 'X-API-Key': process.env.VITE_API_KEY ?? '', 'ngrok-skip-browser-warning': 'true' },
    });
    apiStatus = r.status;
    apiBody = await r.text();
  } catch (e) {
    apiBody = String(e);
  }

  res.status(200).json({
    ok: true,
    API_UPSTREAM: upstream,
    upstream_status: apiStatus,
    upstream_body: apiBody,
  });
}
