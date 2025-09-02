export default function handler(req, res) {
  const { d } = req.query;

  console.log("Received d:", d); // ✅ This will appear in Vercel logs

  res.status(200).json({
    status: "ok",
    received: d || null
  });
}
