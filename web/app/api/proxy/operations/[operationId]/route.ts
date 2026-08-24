import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/api-base";
import { authenticatedHeaders, NO_STORE, safeUpstreamError } from "@/lib/forge-proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params;
  const headers = authenticatedHeaders(request);
  if (headers instanceof NextResponse) return headers;
  try {
    const res = await fetch(`${API_BASE}/api/v1/operations/${encodeURIComponent(operationId)}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return safeUpstreamError(res.status, "Operation fetch");
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": NO_STORE } });
  } catch {
    return NextResponse.json({ error: "Operation unreachable" }, { status: 502, headers: { "Cache-Control": NO_STORE } });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params;
  const headers = authenticatedHeaders(request, true);
  if (headers instanceof NextResponse) return headers;
  const body = await request.json().catch(() => ({}));
  // Support cancellation: POST with {action:"cancel"} or DELETE
  if (body.action === "cancel") {
    try {
      const res = await fetch(`${API_BASE}/api/v1/operations/${encodeURIComponent(operationId)}/cancel`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return safeUpstreamError(res.status, "Operation cancel");
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { headers: { "Cache-Control": NO_STORE } });
    } catch {
      return NextResponse.json({ error: "Operation cancel unreachable" }, { status: 502, headers: { "Cache-Control": NO_STORE } });
    }
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const { operationId } = await params;
  const headers = authenticatedHeaders(request, true);
  if (headers instanceof NextResponse) return headers;
  try {
    const res = await fetch(`${API_BASE}/api/v1/operations/${encodeURIComponent(operationId)}/cancel`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return safeUpstreamError(res.status, "Operation cancel");
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { headers: { "Cache-Control": NO_STORE } });
  } catch {
    return NextResponse.json({ error: "Operation cancel unreachable" }, { status: 502, headers: { "Cache-Control": NO_STORE } });
  }
}
