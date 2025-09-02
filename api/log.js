// /api/log.js
export default function handler(req, res) {
  const data = req.query.d;

  if (!data) {
    return res.status(400).json({ message: 'No data received' });
  }

  console.log('--- Received Data ---');
  console.log('Base64:', data);

  try {
    const decoded = Buffer.from(data, 'base64').toString('utf-8');
    console.log('Decoded JSON:', decoded);
  } catch (err) {
    console.log('Failed to decode base64:', err.message);
  }

  res.status(200).json({ message: 'Data logged successfully' });
}
