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
 * The mailer the quote API uses, built from the environment.
 *
 * With RESEND_API_KEY it sends through Resend, from MAIL_FROM. Without it, it
 * throws (the route answers 500 and logs it), unless ALLOW_DEV_FALLBACKS is
 * exactly "true", where it logs the email and counts it as sent.
 *
 * `send` rejects when Resend refuses the email. (The Resend SDK returns errors
 * instead of throwing them; a rejection is what lets the caller see the failure.)
 */
export function createMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (!env.devFallbacksAllowed()) {
      throw new Error("Missing required environment variable RESEND_API_KEY. See .env.example.");
    }
    return consoleMailer;
  }

  const resend = new Resend(apiKey);
  const from = process.env.MAIL_FROM?.trim() || DEFAULT_FROM;

  return {
    async send({ to, subject, html, text, replyTo }) {
      const { error } = await resend.emails.send({ from, to, subject, html, text, replyTo });
      if (error) throw new Error(`Resend could not send the email: ${error.message}`);
    },
  };
}
