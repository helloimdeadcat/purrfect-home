import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_METHOD_HEADER } from "@/lib/push/config";
import type { Database } from "@/types/database";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    (pathname.startsWith("/api/") &&
      !pathname.startsWith("/api/auth/login") &&
      !pathname.startsWith("/api/auth/register") &&
      !pathname.startsWith("/api/auth/logout") &&
      // Preview is public (token is the secret); accept still requires a session in the route.
      !pathname.startsWith("/api/invitations/preview"))
  );
}

function misconfiguredResponse(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  if (acceptsHtml || !pathname.startsWith("/api/")) {
    return new NextResponse(
      "Application misconfigured: missing Supabase public environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  return NextResponse.json(
    {
      error:
        "Application misconfigured: missing Supabase public environment variables.",
    },
    { status: 503 },
  );
}

/**
 * Refresh the auth session and guard /app/* (+ protected API) routes.
 * Next.js 16 uses proxy.ts (middleware.ts is deprecated).
 *
 * Fail-closed: missing env must not open protected routes.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Route handlers only see headers(): forward the real method (overwriting
  // any client value) so requireHousehold() can push after mutations.
  // Forwarded below via NextResponse.next({ request }).
  request.headers.set(REQUEST_METHOD_HEADER, request.method);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (isProtectedPath(pathname)) {
      return misconfiguredResponse(request);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  const isInviteRoute = pathname === "/invite";
  const isAuthRoute = pathname === "/login" || pathname === "/register";

  if (isAppRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Logged-in users may stay on /invite to explicitly accept an invitation.
  if (isAuthRoute && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (isInviteRoute && !user) {
    // Allow unauthenticated preview; acceptance requires login/register first.
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
