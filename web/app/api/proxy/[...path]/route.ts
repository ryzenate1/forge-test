import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/api-base";
import { authenticatedHeaders, NO_STORE } from "@/lib/forge-proxy";

export const dynamic = "force-dynamic";

async function forward(request: NextRequest, path: string[]) {
  const targetPath = path.join("/");
  const search = request.nextUrl.search;
  const url = `${API_BASE}/api/v1/${targetPath}${search}`;
  const method = request.method;
  const isMutation = method !== "GET" && method !== "HEAD";
  const headers = authenticatedHeaders(request, isMutation);
  if (headers instanceof NextResponse) return headers;

  const hasBody = method !== "GET" && method !== "HEAD";
  let body: string | undefined;
  if (hasBody) {
    body = await request.text();
  }

  // Forward content-type if present, preserve json
  const forwardHeaders = new Headers(headers);
  const ct = request.headers.get("content-type");
  if (ct) forwardHeaders.set("Content-Type", ct);
  else if (hasBody) forwardHeaders.set("Content-Type", "application/json");

  // Forward Idempotency-Key if present
  const idem = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  if (idem) forwardHeaders.set("Idempotency-Key", idem);

  try {
    const res = await fetch(url, {
      method,
      headers: forwardHeaders,
      body: body && body.length > 0 ? body : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await res.text();
      return new NextResponse(data, {
        status: res.status,
        headers: { "Content-Type": "application/json", "Cache-Control": NO_STORE },
      });
    }
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": contentType || "text/plain", "Cache-Control": NO_STORE },
    });
  } catch {
    return NextResponse.json({ error: "Upstream unreachable" }, { status: 502, headers: { "Cache-Control": NO_STORE } });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(request, path);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(request, path);
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(request, path);
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(request, path);
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(request, path);
}
