// api/receive.js
export default function handler(req, res) {
  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : safeParseJSON(req.body);
  
  const dParam = (query.d || (body && body.d) || '').toString();
  
  if (dParam) {
    try {
      // Clean and decode the base64 data
      const cleaned = dParam.replace(/[()]/g, '');
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      const parsedData = tryJsonParse(decoded) ?? decoded;
      
      // Clean logs - only b64 data and decoded result
      console.log('[b64-data]', dParam);
      console.log('[decoded-data]', parsedData);
    } catch (e) {
      console.log('[decode-error]', e?.message || String(e));
    }
  }

  // Simple response - users only see "ok"
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('ok');
}

function safeParseJSON(input) {
  if (!input || typeof input !== 'string') return input;
  try { return JSON.parse(input); } catch { return input; }
}

function tryJsonParse(input) {
  try { return JSON.parse(input); } catch { return null; }
}
