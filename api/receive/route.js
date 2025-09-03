export default function handler(req, res) {
  console.log("[v0] === Incoming Request ===")
  console.log("[v0] Method:", req.method)
  console.log("[v0] URL:", req.url)
  console.log("[v0] Query:", req.query)
  console.log("[v0] Headers:", JSON.stringify(req.headers, null, 2))

  // Get the 'd' parameter from query
  const encodedData = req.query.d

  if (!encodedData) {
    console.log("[v0] No 'd' parameter found")
    return res.status(200).json({
      status: "received",
      message: "No data parameter found",
      timestamp: new Date().toISOString(),
    })
  }

  try {
    console.log("[v0] === Decoding Process ===")
    console.log("[v0] Raw parameter:", encodedData)

    // Step 1: URL decode (handles %3D etc.)
    const urlDecoded = decodeURIComponent(encodedData)
    console.log("[v0] After URL decode:", urlDecoded)

    // Step 2: Base64 decode
    const base64Decoded = Buffer.from(urlDecoded, "base64").toString("utf-8")
    console.log("[v0] After base64 decode:", base64Decoded)

    // Step 3: Parse JSON
    const jsonData = JSON.parse(base64Decoded)
    console.log("[v0] === DECODED JSON DATA ===")
    console.log("[v0]", JSON.stringify(jsonData, null, 2))

    return res.status(200).json({
      status: "success",
      decoded: jsonData,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.log("[v0] Error decoding data:", error.message)
    return res.status(400).json({
      status: "error",
      message: "Failed to decode data",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
