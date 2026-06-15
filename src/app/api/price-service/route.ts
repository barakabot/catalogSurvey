import { NextRequest, NextResponse } from "next/server";

const PRICE_SERVICE_URL = "http://localhost:3002";

async function proxyRequest(req: NextRequest, path: string) {
  const method = req.method;
  const url = `${PRICE_SERVICE_URL}${path}`;

  let body: string | null = null;
  if (method === "POST" || method === "PUT") {
    body = await req.text();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "سرویس قیمت در دسترس نیست. لطفاً از API داخلی استفاده کنید." },
      { status: 503 }
    );
  }
}

// GET /api/price-service?path=/api/health
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "/api/health";
  return proxyRequest(req, path);
}

export async function POST(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "/api/health";
  return proxyRequest(req, path);
}

export async function PUT(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "/api/health";
  return proxyRequest(req, path);
}

export async function DELETE(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "/api/health";
  return proxyRequest(req, path);
}
