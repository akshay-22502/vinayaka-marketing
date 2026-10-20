import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(ok: boolean, status: number): NextResponse {
  return NextResponse.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Daily ping from Vercel Cron (see vercel.json) that keeps a free-tier Supabase project from
 * pausing after a week of inactivity, which would make every quote request fail (Ruling R20).
 * It runs one tiny select with the public anonymous client, the same kind of read every
 * visitor triggers. A paid Supabase plan does not pause, and this then does no harm.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else, or no CRON_SECRET
 * configured, is a 401. Failures are logged and never described in the response.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return respond(false, 401);
  }

  try {
    const { error } = await getPublicClient().from("site_settings").select("id").limit(1);
    if (error) {
      console.error("[keep-alive] the database refused the ping:", error.message);
      return respond(false, 500);
    }
  } catch (error) {
    console.error("[keep-alive] the ping failed:", error instanceof Error ? error.message : error);
    return respond(false, 500);
  }
  return respond(true, 200);
}
