import { beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in and sign-out Server Actions against a fake Supabase client. The happy path and the
// wrong-password path also run for real in tests/e2e/admin-auth.spec.ts; the branches that need
// Supabase to misbehave (rate limit, outage) can only be tested here.

vi.mock("next/navigation", () => ({
  // The real redirect() throws; so does this one, so code after it cannot run.
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const getServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ getServerClient: () => getServerClient() }));

const { signIn, signOut } = await import("@/app/admin/actions");

type AuthFailure = { name: string; status?: number; message: string };

function fakeSupabase(options: {
  signInError?: AuthFailure;
  user?: { id: string };
  isAdmin?: boolean;
  rpcError?: { message: string };
}) {
  const { signInError, user = { id: "user-1" }, isAdmin = true, rpcError } = options;
  const supabase = {
    auth: {
      signInWithPassword: vi.fn(async () =>
        signInError ? { data: { user: null }, error: signInError } : { data: { user }, error: null },
      ),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ data: rpcError ? null : isAdmin, error: rpcError ?? null })),
  };
  getServerClient.mockResolvedValue(supabase);
  return supabase;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const WRONG = { error: "Incorrect email or password" };

beforeEach(() => {
  getServerClient.mockReset();
});

describe("signIn", () => {
  it("goes to the dashboard when an admin signs in, trimming the email", async () => {
    const supabase = fakeSupabase({ isAdmin: true });

    await expect(signIn(null, form({ email: "  Owner@Example.com ", password: "secret-password" }))).rejects.toThrow(
      "REDIRECT /admin",
    );
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "Owner@Example.com",
      password: "secret-password",
    });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs a user who is not an admin straight out and explains on the login page", async () => {
    const supabase = fakeSupabase({ isAdmin: false });

    await expect(signIn(null, form({ email: "user@example.com", password: "secret-password" }))).rejects.toThrow(
      "REDIRECT /admin/login?error=not-admin",
    );
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("shows the form with a generic error, and leaves no session, when the admin check fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = fakeSupabase({ rpcError: { message: "connection refused" } });

    await expect(signIn(null, form({ email: "owner@example.com", password: "secret-password" }))).resolves.toEqual({
      error: "We could not check your account just now. Please try signing in again.",
    });
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("gives one message for every credential problem, whatever Supabase says", async () => {
    for (const failure of [
      { name: "AuthApiError", status: 400, message: "Invalid login credentials" },
      { name: "AuthApiError", status: 400, message: "Email not confirmed" },
      { name: "AuthApiError", status: 400, message: "User not found" },
      { name: "AuthApiError", status: 403, message: "User is banned" },
    ]) {
      fakeSupabase({ signInError: failure });
      await expect(signIn(null, form({ email: "a@example.com", password: "x" }))).resolves.toEqual(WRONG);
    }
  });

  it("says so when Supabase rate-limits the attempts, or cannot be reached", async () => {
    fakeSupabase({ signInError: { name: "AuthApiError", status: 429, message: "over_request_rate_limit" } });
    await expect(signIn(null, form({ email: "a@example.com", password: "x" }))).resolves.toEqual({
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    });

    fakeSupabase({ signInError: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" } });
    await expect(signIn(null, form({ email: "a@example.com", password: "x" }))).resolves.toEqual({
      error: "We could not reach the sign-in service. Please try again.",
    });
  });

  it("does not call Supabase when the email or password is missing", async () => {
    const supabase = fakeSupabase({});

    await expect(signIn(null, form({ email: "", password: "x" }))).resolves.toEqual(WRONG);
    await expect(signIn(null, form({ email: "a@example.com", password: "" }))).resolves.toEqual(WRONG);
    await expect(signIn(null, form({ email: "   ", password: "x" }))).resolves.toEqual(WRONG);
    await expect(signIn(null, form({ password: "x" }))).resolves.toEqual(WRONG);
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("ends the session and returns to the login page", async () => {
    const supabase = fakeSupabase({});

    await expect(signOut()).rejects.toThrow("REDIRECT /admin/login");
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
