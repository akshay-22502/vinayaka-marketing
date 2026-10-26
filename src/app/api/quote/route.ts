import { NextResponse } from "next/server";
import { handleQuote, type QuoteDeps, type QuoteResult } from "@/lib/quote/handle";
import { clientIp } from "@/lib/quote/ip";
import { createMailer } from "@/lib/quote/mailer";
import { ATTACHMENT_MAX_BYTES } from "@/lib/quote/schema";
import { createSupabaseQuoteStore } from "@/lib/quote/store";
import { createCaptchaVerifier } from "@/lib/quote/turnstile";
import { env } from "@/lib/env";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
// Seconds Vercel lets one request run: the captcha check (5 s) plus two sequential Resend calls (up to 8 s each).
export const maxDuration = 60;

const SERVER_ERROR_MESSAGE =
  "Something went wrong on our side, so your request was not sent. Please try again in a moment, or contact us directly.";

/** Room for the text fields and multipart framing on top of the largest allowed attachment. */
const MAX_BODY_BYTES = ATTACHMENT_MAX_BYTES + 512 * 1024;

/**
 * Wires the real dependencies from the environment. Built per request (not at import)
 * so `next build` needs none of the secrets, and a missing one becomes a 500 for the
 * request that needs it. It throws for a missing secret, except the captcha secret when
 * ALLOW_DEV_FALLBACKS=true (see createCaptchaVerifier) and the Resend key, whose absence
 * only stops the emails (see createMailer).
 */
function createDeps(): QuoteDeps {
  const salt = env.requireServerEnv("IP_HASH_SALT");
  return {
    store: createSupabaseQuoteStore(getServiceClient()),
    mailer: createMailer(),
    verifyCaptcha: createCaptchaVerifier(),
    salt,
    now: () => new Date(),
  };
}

function respond({ status, body }: QuoteResult): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  let deps: QuoteDeps;
  try {
    deps = createDeps();
  } catch (error) {
    console.error("[quote] the quote API is not configured:", error instanceof Error ? error.message : error);
    return respond({
      status: 500,
      body: { ok: false, message: "Quote requests are unavailable right now. Please contact us directly." },
    });
  }

  // Refuse an oversized body before buffering it. (Vercel stops anything over 4.5 MB itself.)
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return respond({
      status: 400,
      body: {
        ok: false,
        message: "Please check the highlighted fields and try again.",
        errors: { attachment: "The attachment is larger than 4 MB. Send a smaller file, and email larger drawings to us after we reply." },
      },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond({
      status: 400,
      body: { ok: false, message: "That request could not be read. Please reload the page and try again." },
    });
  }

  // Last line of defence: whatever escapes handleQuote still answers in JSON, so the form
  // always gets something it can show. The details go to the log, not to the visitor.
  try {
    return respond(await handleQuote(form, clientIp(request.headers), deps));
  } catch (error) {
    console.error("[quote] unexpected error:", error instanceof Error ? (error.stack ?? error.message) : error);
    return respond({ status: 500, body: { ok: false, message: SERVER_ERROR_MESSAGE } });
  }
}
