import { NextResponse, type NextRequest } from "next/server";

import { evaluateLocalOperatorRequest } from "@/lib/security/local-operator";

export function proxy(request: NextRequest) {
  const decision = evaluateLocalOperatorRequest({
    method: request.method,
    url: request.url,
    headers: request.headers
  });

  if (decision.ok) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: decision.message,
      code: decision.code
    },
    { status: decision.status }
  );
}

export const config = {
  matcher: ["/api/:path*"]
};
