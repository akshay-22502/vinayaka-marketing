import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./helpers";

// scripts/create-admin.ts, run the way the owner runs it (as a separate Node process), against
// the local stack. Each test uses its own address and the afterAll removes them.

const SCRIPT = fileURLToPath(new URL("../../scripts/create-admin.ts", import.meta.url));
const RUN = Date.now().toString(36);
const PASSWORD = "create-admin-pass-1";

const emails: string[] = [];
function newEmail(tag: string): string {
  const email = `create-admin-${tag}-${RUN}@example.com`;
  emails.push(email);
  return email;
}

function runScript(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...envOverrides };
  for (const [name, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[name];
  }
  return spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT, ...args], {
    encoding: "utf8",
    env,
    timeout: 60_000,
  });
}

async function userIdOf(email: string): Promise<string | undefined> {
  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((user) => user.email === email)?.id;
}

afterAll(async () => {
  const service = serviceClient();
  for (const email of emails) {
    const id = await userIdOf(email);
    if (id) await service.auth.admin.deleteUser(id); // the admins row goes with the user
  }
});

describe("scripts/create-admin.ts", () => {
  it("creates a user who can sign in and is an admin", async () => {
    const email = newEmail("new");
    const result = runScript([email, PASSWORD]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(email);
    expect(result.stdout).not.toContain(PASSWORD);

    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signIn.error).toBeNull();
    const isAdmin = await client.rpc("is_admin");
    expect(isAdmin.data).toBe(true);
  });

  it("can be run again for the same address: the password is reset and the user stays an admin", async () => {
    const email = newEmail("again");
    expect(runScript([email, PASSWORD]).status).toBe(0);
    const second = runScript([email, `${PASSWORD}-changed`]);
    expect(second.status, second.stderr).toBe(0);

    const service = serviceClient();
    const id = await userIdOf(email);
    expect(id).toBeDefined();
    const rows = await service.from("admins").select("user_id").eq("user_id", id!);
    expect(rows.data).toHaveLength(1);

    const client = anonClient();
    expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).not.toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: `${PASSWORD}-changed` })).error).toBeNull();
  });

  it("reads the target from the environment, and falls back to the local stack without one", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    const explicit = runScript([newEmail("env"), PASSWORD]);
    expect(explicit.status, explicit.stderr).toBe(0);
    expect(explicit.stdout).toContain(url);

    const fallback = runScript([newEmail("local"), PASSWORD], {
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    expect(fallback.status, fallback.stderr).toBe(0);
    expect(fallback.stdout).toContain("local Supabase");
  });

  it("refuses to guess when only one of the two settings is present", () => {
    const result = runScript([newEmail("half"), PASSWORD], { SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("explains the usage and creates nothing when the arguments are wrong", async () => {
    const noArgs = runScript([]);
    expect(noArgs.status).not.toBe(0);
    expect(noArgs.stderr).toContain("Usage");

    const badEmail = runScript(["not-an-email", PASSWORD]);
    expect(badEmail.status).not.toBe(0);
    expect(badEmail.stderr).toContain("email");

    const email = newEmail("short");
    const shortPassword = runScript([email, "short"]);
    expect(shortPassword.status).not.toBe(0);
    expect(shortPassword.stderr).toContain("password");
    expect(await userIdOf(email)).toBeUndefined();
  });
});

