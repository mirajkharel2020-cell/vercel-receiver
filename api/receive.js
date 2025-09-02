export default async function handler(req, res) {
  try {
    // --- Handle GET requests (Base64 in query param) ---
    if (req.method === "GET") {
      const { d } = req.query;
      if (!d) {
        return res.status(400).json({ error: "Missing 'd' parameter" });
      }

      // Step 1: URL decode
      const urlDecoded = decodeURIComponent(d);

      // Step 2: Base64 decode
      const base64Decoded = Buffer.from(urlDecoded, "base64").toString("utf-8");

      // Step 3: Parse JSON
      const parsedData = JSON.parse(base64Decoded);

      console.log("Received GET data:", parsedData);

      return res.status(200).json({ success: true, data: parsedData });
    }

    // --- Handle POST requests (direct JSON) ---
    if (req.method === "POST") {
      const body = req.body;

      console.log("Received POST data:", body);

      return res.status(200).json({ success: true, data: body });
    }

    // If not GET or POST
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: "Failed to parse data", details: err.message });
  }
}
