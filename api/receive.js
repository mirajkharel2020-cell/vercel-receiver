// api/receive.js
export default function handler(req, res) {
  const method = req.method || 'GET';

  // Query (GET) and body (POST/beacon)
  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : safeParseJSON(req.body);

  const dParam = (query.d || (body && body.d) || '').toString();

  const logPayload = {
    at: new Date().toISOString(),
    method,
    url: req.url,
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''),
    userAgent: String(req.headers['user-agent'] || ''),
    query,
    body,
    hasD: Boolean(dParam),
  };

  // Try to base64-decode the `d` parameter if present
  if (dParam) {
    try {
      // Some senders wrap it in parentheses: (base64...)
      const cleaned = dParam.replace(/[()]/g, '');
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      logPayload.dDecoded = tryJsonParse(decoded) ?? decoded;
    } catch (e) {
      logPayload.dDecodeError = e?.message || String(e);
    }
  }

  // This shows up in Vercel -> Project -> Deployments -> Functions -> api/receive -> Logs
  console.log('[vercel-receiver] Incoming request', logPayload);

  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({ ok: true }));
}

function safeParseJSON(input) {
  if (!input || typeof input !== 'string') return input;
  try { return JSON.parse(input); } catch { return input; }
}

function tryJsonParse(input) {
  try { return JSON.parse(input); } catch { return null; }
}
