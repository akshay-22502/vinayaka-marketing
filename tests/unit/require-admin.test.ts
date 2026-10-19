import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// requireAdmin() against a fake Supabase client: who gets in, who is signed out and where
// each case is sent. The real flow (cookies, RLS, the browser) is covered by
// tests/e2e/admin-auth.spec.ts.

vi.mock("next/navigation", () => ({
  // The real redirect() throws; so does this one, so code after it cannot run.
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const getServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ getServerClient: () => getServerClient() }));

const { isAdmin, requireAdmin } = await import("@/lib/admin/require-admin");

type FakeOptions = {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  isAdmin?: boolean | null;
  rpcError?: { message: string } | null;
};

function fakeSupabase(options: FakeOptions) {
  const { user = null, userError = null, isAdmin = false, rpcError = null } = options;
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: userError })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => ({ data: rpcError ? null : isAdmin, error: rpcError })),
  };
  getServerClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  getServerClient.mockReset();
});

describe("requireAdmin", () => {
  it("sends a visitor without a session to the login page", async () => {
    const supabase = fakeSupabase({ user: null, userError: { message: "Auth session missing!" } });

    await expect(requireAdmin()).rejects.toThrow("REDIRECT /admin/login");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out a user who is not an admin and says why", async () => {
    const supabase = fakeSupabase({ user: { id: "user-1" }, isAdmin: false });

    await expect(requireAdmin()).rejects.toThrow("REDIRECT /admin/login?error=not-admin");
    expect(supabase.rpc).toHaveBeenCalledWith("is_admin");
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("lets an admin in and hands back the user id and the user's own client", async () => {
    const supabase = fakeSupabase({ user: { id: "admin-1" }, isAdmin: true });

    const result = await requireAdmin();

    expect(result.userId).toBe("admin-1");
    expect(result.supabase).toBe(supabase);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("fails loudly, without signing anyone out, when the admin check itself fails", async () => {
    const supabase = fakeSupabase({ user: { id: "admin-1" }, rpcError: { message: "connection refused" } });

    await expect(requireAdmin()).rejects.toThrow("Could not check admin access: connection refused");
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});

describe("isAdmin", () => {
  it("is true only when is_admin() returns exactly true", async () => {
    for (const [value, expected] of [[true, true], [false, false], [null, false]] as const) {
      const supabase = fakeSupabase({ isAdmin: value });
      await expect(isAdmin(supabase as unknown as SupabaseClient)).resolves.toBe(expected);
    }
  });
});
