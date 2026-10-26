import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

export interface Mailer {
  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<void>;
}

const DEFAULT_FROM = "TerraTechBharat <quotes@terratechbharat.com>";

/** How long one send may take before it counts as failed (a hung request must not hold the buyer's response). */
const SEND_TIMEOUT_MS = 8_000;

/** Rejects if `work` has not settled within `ms`; the timer never outlives the call. */
async function withTimeout<T>(work: PromiseLike<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms / 1000} seconds`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Logs the email instead of sending it, for local runs without a Resend key. */
const consoleMailer: Mailer = {
  async send(message) {
    console.info(
      "[mail:dev] Not sent (RESEND_API_KEY is not set; ALLOW_DEV_FALLBACKS=true).",
      JSON.stringify({ to: message.to, replyTo: message.replyTo, subject: message.subject, text: message.text }),
    );
  },
};

/**
 * Stands in when RESEND_API_KEY is not set on a real deployment: every send rejects, so the quote
 * handler logs it and leaves the request saved with `email_sent` false ("Email not sent" in the
 * admin inbox). A missing email key must never stop a buyer's request from being saved.
 */
const unconfiguredMailer: Mailer = {
  async send() {
    throw new Error("RESEND_API_KEY is not set, so no email was sent. See .env.example.");
  },
};

/**
 * The mailer the quote API uses, built from the environment.
 *
 * With RESEND_API_KEY it sends through Resend, from MAIL_FROM. Without it, every
 * send fails (the request is still saved and shows "Email not sent"), unless
 * ALLOW_DEV_FALLBACKS is exactly "true", where it logs the email and counts it as sent.
 *
 * `send` rejects when Resend refuses the email or does not answer within 8 seconds. (The Resend SDK returns errors
 * instead of throwing them; a rejection is what lets the caller see the failure.)
 */
export function createMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return env.devFallbacksAllowed() ? consoleMailer : unconfiguredMailer;
  }

  const resend = new Resend(apiKey);
  const from = process.env.MAIL_FROM?.trim() || DEFAULT_FROM;

  return {
    async send({ to, subject, html, text, replyTo }) {
      const { error } = await withTimeout(
        resend.emails.send({ from, to, subject, html, text, replyTo }),
        SEND_TIMEOUT_MS,
        "Resend",
      );
      if (error) throw new Error(`Resend could not send the email: ${error.message}`);
    },
  };
}
