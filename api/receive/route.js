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

  const logPayload = {
    at: new Date().toISOString(),
    method,
    url: request.url,
    ip: String(request.headers.get("x-forwarded-for") || ""),
    userAgent: String(request.headers.get("user-agent") || ""),
    query,
    body,
    hasD: Boolean(dParam),
  }

  // Try to base64-decode the `d` parameter if present
  if (dParam) {
    try {
      // Some senders wrap it in parentheses: (base64...)
      const cleaned = dParam.replace(/[()]/g, "")
      // First URL decode, then base64 decode
      const urlDecoded = decodeURIComponent(cleaned)
      const decoded = Buffer.from(urlDecoded, "base64").toString("utf8")
      logPayload.dDecoded = tryJsonParse(decoded) ?? decoded
    } catch (e) {
      logPayload.dDecodeError = e?.message || String(e)
    }
  }

  // This shows up in Vercel -> Project -> Deployments -> Functions -> api/receive -> Logs
  console.log("[vercel-receiver] Incoming request", logPayload)

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
