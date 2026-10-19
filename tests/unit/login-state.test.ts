import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { resolveLoginState } from "@/lib/admin/login-state";

// What /admin/login does with the session it finds, against a fake Supabase client. The page
// itself only turns the result into a redirect or the form.

function fakeSupabase(options: {
  user?: { id: string } | null;
  isAdmin?: boolean;
  rpcError?: { message: string } | null;
}): SupabaseClient {
  const { user = null, isAdmin = false, rpcError = null } = options;
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    rpc: vi.fn(async () => ({ data: rpcError ? null : isAdmin, error: rpcError })),
  } as unknown as SupabaseClient;
}

describe("resolveLoginState", () => {
  it("shows an empty form to a visitor without a session, and does not ask the database", async () => {
    const supabase = fakeSupabase({ user: null });
    await expect(resolveLoginState(supabase, undefined)).resolves.toEqual({ redirectTo: null, error: undefined });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("sends a signed-in admin to the dashboard", async () => {
    const supabase = fakeSupabase({ user: { id: "admin-1" }, isAdmin: true });
    await expect(resolveLoginState(supabase, undefined)).resolves.toEqual({ redirectTo: "/admin", error: undefined });
  });

  it("shows the form to a signed-in user who is not an admin", async () => {
    const supabase = fakeSupabase({ user: { id: "user-1" }, isAdmin: false });
    await expect(resolveLoginState(supabase, undefined)).resolves.toEqual({ redirectTo: null, error: undefined });
  });

  it("explains ?error=not-admin, and ignores any other value instead of echoing it", async () => {
    const supabase = fakeSupabase({ user: null });
    await expect(resolveLoginState(supabase, "not-admin")).resolves.toEqual({
      redirectTo: null,
      error: "This account does not have admin access",
    });
    for (const value of ["<script>alert(1)</script>", "something-else", ["not-admin", "x"]]) {
      await expect(resolveLoginState(supabase, value)).resolves.toEqual({ redirectTo: null, error: undefined });
    }
  });

  it("shows the form with a generic error, not an error page, when the admin check fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = fakeSupabase({ user: { id: "admin-1" }, rpcError: { message: "connection refused" } });

    const state = await resolveLoginState(supabase, undefined);

    expect(state.redirectTo).toBeNull();
    expect(state.error).toBe("We could not check your account just now. Please try signing in again.");
    expect(state.error).not.toContain("connection refused");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
