import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "@/lib/supabase/config";

/**
 * Keeps the admin's Supabase session fresh. The access token lasts an hour; on a
 * request after that, this refreshes it and writes the new cookies to both the
 * request (so the page being rendered sees them) and the response (so the browser
 * keeps them). Server Components cannot write cookies themselves.
 *
 * It does not decide who may enter: `requireAdmin()` does that in each page and
 * action. And it only runs for /admin (see the matcher). Public pages must stay
 * static, so they must never go through here.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabasePublicConfig();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that carry session cookies must not be cached by a CDN or proxy.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Verifies the token with Supabase Auth and refreshes it when it has expired.
  // getUser(), not getSession(): the session cookie alone proves nothing.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
