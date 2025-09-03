// API route for receiving and logging requests with base64 decoding
export async function GET(request) {
  return handleRequest(request, "GET")
}

export async function POST(request) {
  return handleRequest(request, "POST")
}

async function handleRequest(request, method) {
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())

  let body = null
  try {
    const text = await request.text()
    body = text ? safeParseJSON(text) : null
  } catch (e) {
    // Body parsing failed, continue without it
  }

  const dParam = (query.d || (body && body.d) || "").toString()

  console.log("=== INCOMING REQUEST ===")
  console.log("Method:", method)
  console.log("URL:", request.url)
  console.log("Query params:", query)

  if (body) {
    console.log("Body:", body)
  }

  // Try to base64-decode the `d` parameter if present
  if (dParam) {
    console.log("Raw d parameter:", dParam)
    try {
      // Some senders wrap it in parentheses: (base64...)
      const cleaned = dParam.replace(/[()]/g, "")
      console.log("Cleaned d parameter:", cleaned)

      // First URL decode, then base64 decode
      const urlDecoded = decodeURIComponent(cleaned)
      console.log("URL decoded:", urlDecoded)

      const decoded = Buffer.from(urlDecoded, "base64").toString("utf8")
      console.log("Base64 decoded:", decoded)

      const parsed = tryJsonParse(decoded)
      if (parsed) {
        console.log("=== DECODED JSON DATA ===")
        console.log(JSON.stringify(parsed, null, 2))
      } else {
        console.log("=== DECODED TEXT DATA ===")
        console.log(decoded)
      }
    } catch (e) {
      console.log("Decode error:", e?.message || String(e))
    }
  } else {
    console.log("No 'd' parameter found")
  }

  console.log("=== END REQUEST ===")

  return Response.json({ ok: true })
}

function safeParseJSON(input) {
  if (!input || typeof input !== "string") return input
  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

function tryJsonParse(input) {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}
