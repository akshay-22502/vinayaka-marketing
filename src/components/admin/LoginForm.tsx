"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/admin/actions";

const fieldClass =
  "mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm placeholder:text-slate-500";

/**
 * Email and password. The form posts to the signIn Server Action; a failed attempt comes back
 * as an error shown in a live region. `initialError` is the reason the server already knows,
 * such as a user who signed in but is not an admin.
 */
export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, null);
  const error = state ? state.error : initialError;

  return (
    <form action={formAction} className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-semibold text-slate-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-semibold text-slate-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClass}
        />
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full disabled:cursor-wait disabled:opacity-70">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
