// api/decode.js - Direct decoder endpoint
export default function handler(req, res) {
  const dParam = (req.query.d || req.body?.d || '').toString();

  if (!dParam) {
    return res.status(400).json({ error: 'Missing d parameter' });
  }

  try {
    const cleaned = dParam.replace(/[()]/g, '');
    const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
    const parsed = tryJsonParse(decoded);

    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(parsed || decoded, null, 2));
  } catch (error) {
    res.status(400).json({ error: 'Invalid base64 data' });
  }
}

function tryJsonParse(input) {
  try { return JSON.parse(input); } catch { return null; }
}
