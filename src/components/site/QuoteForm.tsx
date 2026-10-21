"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type HTMLInputTypeAttribute } from "react";
import { trackQuoteRequest } from "@/lib/analytics";
import type { Country } from "@/lib/content/types";
import { ATTACHMENT_ACCEPT, validateAttachment } from "@/lib/quote/attachment";
import {
  FIELD_LIMITS,
  FIELD_ORDER,
  NETWORK_ERROR_MESSAGE,
  checkQuoteForm,
  firstInvalidField,
  interpretQuoteResponse,
  teamName,
  type FieldErrors,
  type QuoteField,
  type QuoteFormValues,
  type QuoteOutcome,
} from "@/lib/quote/form-checks";
import { Turnstile, type TurnstileHandle } from "./Turnstile";

type Option = { slug: string; name: string };

type Props = {
  /** Products a visitor can pick: published, in published categories. */
  options: Option[];
  /** Slugs to tick when the form opens. Slugs that are not in `options` are ignored. */
  preselected: string[];
  /** Cloudflare Turnstile site key; no captcha is shown without one. */
  siteKey: string | undefined;
};

type Status = "idle" | "sending" | "sent";

type Feedback = {
  errors: FieldErrors;
  /** Text for the alert region (server messages, network trouble). */
  alert: string | null;
  /**
   * What the alert is about, so it can go away when that is settled: "fields" once the highlighted
   * fields are fixed, "captcha" once the security check has a token again.
   */
  alertKind: "fields" | "captcha" | "failure" | null;
  /** Where to move the focus after this update: a field, the send button, or nowhere. */
  focus: QuoteField | "submit" | null;
};

const NO_FEEDBACK: Feedback = { errors: {}, alert: null, alertKind: null, focus: null };

const CAPTCHA_PENDING_MESSAGE =
  "Please wait a moment for the security check to finish, then send your request again. If it does not appear, reload the page or contact us directly.";
const CAPTCHA_EXPIRED_MESSAGE =
  "The security check expired. Please wait a moment for it to refresh, then send your request again.";
const CAPTCHA_ERROR_MESSAGE =
  "The security check could not run. Please reload the page and try again, or contact us directly.";

// Styling -------------------------------------------------------------------------------------

const inputClass =
  "block w-full min-h-12 rounded-md border border-slate-500 bg-white px-3 py-2.5 text-base text-slate-900 aria-[invalid=true]:border-red-700 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-700";
const labelClass = "mb-1.5 block text-base font-semibold text-slate-900";
const choiceClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-slate-500 bg-white px-3 py-2 has-[:checked]:border-navy has-[:checked]:bg-slate-50 has-[:checked]:ring-1 has-[:checked]:ring-navy";
const hintClass = "mt-1.5 text-sm text-slate-600";

function OptionalMark() {
  return <span className="font-normal text-slate-600">{" (optional)"}</span>;
}

/** `announce` makes screen readers read the message out when it appears (used for a refused file). */
function FieldError({ id, message, announce = false }: { id: string; message: string | undefined; announce?: boolean }) {
  if (!message) return null;
  return (
    <p id={id} role={announce ? "alert" : undefined} className="mt-1.5 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

/** Ids that tie a field to its hint and its error message (`aria-describedby`). */
function describedBy(...ids: (string | null | false | undefined)[]): string | undefined {
  const present = ids.filter(Boolean);
  return present.length > 0 ? present.join(" ") : undefined;
}

type TextFieldProps = {
  prefix: string;
  name: QuoteField;
  label: string;
  error: string | undefined;
  optional?: boolean;
  hint?: string;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email";
  maxLength: number;
  /** A textarea instead of a one-line input. */
  rows?: number;
};

/** A labelled text field with an optional hint and an error message next to it. */
function TextField({
  prefix,
  name,
  label,
  error,
  optional = false,
  hint,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  rows,
}: TextFieldProps) {
  const id = `${prefix}-${name}`;
  const shared = {
    id,
    name,
    required: !optional,
    maxLength,
    minLength: optional ? undefined : FIELD_LIMITS.requiredMin,
    className: inputClass,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy(hint && `${id}-hint`, error && `${id}-error`),
  };
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {optional ? <OptionalMark /> : null}
      </label>
      {rows ? (
        <textarea {...shared} rows={rows} />
      ) : (
        <input
          {...shared}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
        />
      )}
      {hint ? (
        <p id={`${id}-hint`} className={hintClass}>
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

// Reading the form ------------------------------------------------------------------------------

function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

/** The file the visitor chose, or null: an untouched file input posts an empty, unnamed file. */
function chosenFile(data: FormData): File | null {
  const value = data.get("attachment");
  return value instanceof File && value.name !== "" ? value : null;
}

function readValues(data: FormData): QuoteFormValues {
  return {
    name: text(data, "name"),
    company: text(data, "company"),
    email: text(data, "email"),
    phone: text(data, "phone"),
    country: text(data, "country"),
    products: data.getAll("products").filter((value): value is string => typeof value === "string"),
    quantity: text(data, "quantity"),
    projectLocation: text(data, "projectLocation"),
    message: text(data, "message"),
    attachment: chosenFile(data),
  };
}

/** Turns a failed answer into what the page shows: field errors plus any text that has no field. */
function feedbackFor(outcome: Exclude<QuoteOutcome, { kind: "sent" }>): Feedback {
  if (outcome.kind === "failed") {
    return { errors: {}, alert: outcome.message, alertKind: "failure", focus: "submit" };
  }
  const focus = firstInvalidField(outcome.errors);
  // An error for something that is not a field on this form can only be shown in the alert.
  const loose = Object.entries(outcome.errors)
    .filter(([field]) => !(FIELD_ORDER as readonly string[]).includes(field))
    .map(([, message]) => message);
  return {
    errors: outcome.errors,
    alert: [outcome.message, ...loose].join(" "),
    alertKind: focus !== null && loose.length === 0 ? "fields" : "failure",
    focus: focus ?? "submit",
  };
}

// The form ----------------------------------------------------------------------------------------

export function QuoteForm({ options, preselected, siteKey }: Props) {
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const sending = useRef(false);
  // The last file that was refused, and whether the visitor has been told once more at send time.
  const refusedFile = useRef<{ problem: string; warned: boolean } | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [team, setTeam] = useState<Country | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(NO_FEEDBACK);

  const selected = new Set(preselected);
  const { errors } = feedback;

  // After a send attempt that failed, focus the first invalid field. When there is only a message
  // (no field to blame), focus returns to the send button, which was disabled while sending.
  useEffect(() => {
    if (feedback.focus === "submit") submitRef.current?.focus();
    else if (feedback.focus) formRef.current?.querySelector<HTMLElement>(`[name="${feedback.focus}"]`)?.focus();
  }, [feedback]);

  useEffect(() => {
    if (status === "sent") thanksRef.current?.focus();
  }, [status]);

  function clearError(name: string) {
    setFeedback((current) => {
      if (current.errors[name] === undefined) return current;
      const remaining = { ...current.errors };
      delete remaining[name];
      const done = Object.keys(remaining).length === 0 && current.alertKind === "fields";
      return {
        ...current,
        errors: remaining,
        alert: done ? null : current.alert,
        alertKind: done ? null : current.alertKind,
        focus: null,
      };
    });
  }

  // The security check's own events. A new token ends a "wait for the check" message.
  function showCaptchaMessage(alert: string) {
    setFeedback((current) => ({ ...current, alert, alertKind: "captcha", focus: null }));
  }
  function handleToken() {
    setFeedback((current) => (current.alertKind === "captcha" ? { ...current, alert: null, alertKind: null, focus: null } : current));
  }

  // A file is checked as soon as it is chosen, so a too-big drawing is refused before the form is filled in.
  function checkChosenFile(input: HTMLInputElement) {
    const problem = validateAttachment(input.files?.[0] ?? null);
    if (!problem) {
      refusedFile.current = null;
      clearError("attachment");
      return;
    }
    input.value = "";
    refusedFile.current = { problem, warned: false };
    setFeedback((current) => ({ ...current, errors: { ...current.errors, attachment: problem }, focus: null }));
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target.name === "attachment" && target instanceof HTMLInputElement) checkChosenFile(target);
    else if (target.name) clearError(target.name);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;

    const data = new FormData(event.currentTarget);
    const values = readValues(data);

    // 1. The checks the browser can do. The server repeats all of them.
    const problems = checkQuoteForm(values);
    // A file that was refused when it was chosen is no longer in the input, so without this the
    // request would go out without it and the visitor would never be told. Say it once more here;
    // sending again then continues without the file.
    const refused = refusedFile.current;
    if (refused && !values.attachment && !refused.warned) {
      refused.warned = true;
      problems.attachment = `${refused.problem} It was not attached. Choose another file, or send your request again to continue without it.`;
    }
    if (Object.keys(problems).length > 0) {
      setFeedback({ errors: problems, alert: null, alertKind: null, focus: firstInvalidField(problems) });
      return;
    }
    // 2. The captcha token, which the widget puts in the form once the check has passed.
    if (siteKey && text(data, "cf-turnstile-response").trim() === "") {
      setFeedback({ ...NO_FEEDBACK, alert: CAPTCHA_PENDING_MESSAGE, alertKind: "captcha", focus: "submit" });
      return;
    }
    if (!values.attachment) data.delete("attachment");

    // 3. Send.
    sending.current = true;
    setStatus("sending");
    setFeedback(NO_FEEDBACK);

    let outcome: QuoteOutcome;
    try {
      const response = await fetch("/api/quote", { method: "POST", body: data });
      const body: unknown = await response.json().catch(() => null);
      outcome = interpretQuoteResponse(response.status, body, values.country as Country);
    } catch {
      outcome = { kind: "failed", message: NETWORK_ERROR_MESSAGE };
    }
    sending.current = false;

    if (outcome.kind === "sent") {
      trackQuoteRequest(outcome.team, values.products.length);
      setTeam(outcome.team);
      setStatus("sent");
      return;
    }
    // A captcha token works once, so the next attempt needs a new one.
    turnstileRef.current?.reset();
    setStatus("idle");
    setFeedback(feedbackFor(outcome));
  }

  if (status === "sent" && team) {
    return (
      <section
        aria-labelledby={`${prefix}-thanks`}
        className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
      >
        <h2
          id={`${prefix}-thanks`}
          ref={thanksRef}
          tabIndex={-1}
          className="text-2xl font-bold tracking-tight text-navy focus:outline-none"
        >
          Thank you. Our {teamName(team)} team will reply to your request.
        </h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-600">
          We have your details. The team will email you with recommendations and a quotation.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/products" className="btn btn-primary">
            Browse products
          </Link>
          <Link href="/" className="btn btn-secondary">
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  const sendingNow = status === "sending";

  return (
    <form
      ref={formRef}
      aria-label="Quote request"
      method="post"
      action="/api/quote"
      encType="multipart/form-data"
      noValidate
      onSubmit={handleSubmit}
      onChange={handleChange}
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-8"
    >
      <p className="mb-6 text-base text-slate-600">All fields are required unless marked optional.</p>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-dark">Your details</p>
          <TextField prefix={prefix} name="name" label="Name" error={errors.name} autoComplete="name" maxLength={FIELD_LIMITS.name} />
          <TextField
            prefix={prefix}
            name="company"
            label="Company"
            optional
            error={errors.company}
            autoComplete="organization"
            maxLength={FIELD_LIMITS.company}
          />
          <TextField
            prefix={prefix}
            name="email"
            label="Email"
            type="email"
            error={errors.email}
            autoComplete="email"
            inputMode="email"
            maxLength={FIELD_LIMITS.email}
          />
          <TextField
            prefix={prefix}
            name="phone"
            label="Phone"
            type="tel"
            error={errors.phone}
            autoComplete="tel"
            inputMode="tel"
            maxLength={FIELD_LIMITS.phone}
          />

          <fieldset
            role="radiogroup"
            aria-required="true"
            aria-invalid={errors.country ? true : undefined}
            aria-describedby={describedBy(`${prefix}-country-hint`, errors.country && `${prefix}-country-error`)}
            className="min-w-0"
          >
            <legend className={labelClass}>Country</legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["IN", "India"],
                  ["AE", "UAE"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={choiceClass}>
                  <input type="radio" name="country" value={value} required className="size-5 shrink-0 accent-navy" />
                  <span className="text-base text-slate-900">{label}</span>
                </label>
              ))}
            </div>
            <p id={`${prefix}-country-hint`} className={hintClass}>
              Our team in the country you choose will reply.
            </p>
            <FieldError id={`${prefix}-country-error`} message={errors.country} />
          </fieldset>
        </div>

        <div className="min-w-0 space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-dark">Your project</p>

          {options.length > 0 ? (
            <fieldset
              aria-describedby={describedBy(`${prefix}-products-hint`, errors.products && `${prefix}-products-error`)}
              className="min-w-0"
            >
              <legend className={labelClass}>
                Products
                <OptionalMark />
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <label key={option.slug} className={choiceClass}>
                    <input
                      type="checkbox"
                      name="products"
                      value={option.slug}
                      defaultChecked={selected.has(option.slug)}
                      className="size-5 shrink-0 accent-navy"
                    />
                    <span className="min-w-0 break-words text-base text-slate-900">{option.name}</span>
                  </label>
                ))}
              </div>
              <p id={`${prefix}-products-hint`} className={hintClass}>
                Tick everything you want a quote for.
              </p>
              <FieldError id={`${prefix}-products-error`} message={errors.products} />
            </fieldset>
          ) : null}

          <TextField
            prefix={prefix}
            name="quantity"
            label="Quantity"
            optional
            hint="For example 5,000 m2 or 20 rolls."
            error={errors.quantity}
            maxLength={FIELD_LIMITS.quantity}
          />
          <TextField
            prefix={prefix}
            name="projectLocation"
            label="Project location"
            optional
            hint="Town or city and country, so we can plan delivery."
            error={errors.projectLocation}
            autoComplete="off"
            maxLength={FIELD_LIMITS.projectLocation}
          />
          <TextField
            prefix={prefix}
            name="message"
            label="Message"
            rows={5}
            hint="What are you building, and what do you need from us?"
            error={errors.message}
            maxLength={FIELD_LIMITS.message}
          />

          <div>
            <label htmlFor={`${prefix}-attachment`} className={labelClass}>
              Attachment
              <OptionalMark />
            </label>
            <input
              id={`${prefix}-attachment`}
              name="attachment"
              type="file"
              accept={ATTACHMENT_ACCEPT}
              aria-invalid={errors.attachment ? true : undefined}
              aria-describedby={describedBy(`${prefix}-attachment-hint`, errors.attachment && `${prefix}-attachment-error`)}
              className="block w-full min-w-0 text-base text-slate-900 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:text-base file:font-semibold file:text-white hover:file:bg-slate-800"
            />
            <p id={`${prefix}-attachment-hint`} className={hintClass}>
              PDF, JPG, PNG or DWG, up to 4 MB. Larger drawings can be emailed to us after we reply.
            </p>
            <FieldError id={`${prefix}-attachment-error`} message={errors.attachment} announce />
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-4 border-t border-slate-200 pt-6">
        {siteKey ? (
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}
            onToken={handleToken}
            onExpired={() => showCaptchaMessage(CAPTCHA_EXPIRED_MESSAGE)}
            onError={() => showCaptchaMessage(CAPTCHA_ERROR_MESSAGE)}
          />
        ) : null}

        <div role="alert" className={feedback.alert ? "rounded-md border border-red-700 bg-red-50 px-4 py-3 text-base font-medium text-red-900" : undefined}>
          {feedback.alert}
        </div>

        <button
          ref={submitRef}
          type="submit"
          disabled={sendingNow}
          aria-busy={sendingNow}
          className="btn btn-primary min-h-12 w-full px-8 text-lg disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {sendingNow ? (
            <>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="9" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
              </svg>
              Sending…
            </>
          ) : (
            "Send request"
          )}
        </button>
      </div>
    </form>
  );
}
