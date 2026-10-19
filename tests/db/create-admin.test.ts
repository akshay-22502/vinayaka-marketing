import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonClient, createUser, serviceClient } from "./helpers";

// scripts/create-admin.ts, run the way the owner runs it (as a separate Node process), against
// the local stack. Each test uses its own addresses and afterAll removes them. The script refuses
// to add a second admin, so the admins table is emptied before each test and restored at the end
// (the db project runs its files one after another, so nothing else is looking at it meanwhile).

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../../scripts/create-admin.ts", import.meta.url));
const RUN = Date.now().toString(36);
const PASSWORD = "create-admin-pass-1";

const emails: string[] = [];
function newEmail(tag: string): string {
  const email = `create-admin-${tag}-${RUN}@example.com`;
  emails.push(email);
  return email;
}

type EnvOverrides = Record<string, string | undefined>;

function childEnv(overrides: EnvOverrides): NodeJS.ProcessEnv {
  // The password must come from the test, never from the shell running the tests.
  const env: NodeJS.ProcessEnv = { ...process.env, ADMIN_PASSWORD: undefined, ...overrides };
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete env[name];
  }
  return env;
}

/** Runs the script directly with Node. `args` are what the owner types after the command. */
function runScript(args: string[], overrides: EnvOverrides = {}) {
  return spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT, ...args], {
    encoding: "utf8",
    env: childEnv(overrides),
    timeout: 60_000,
  });
}

/** Runs it the documented way, through npm. */
function runNpm(args: string[], overrides: EnvOverrides = {}) {
  return spawnSync("npm", ["run", "-s", "create-admin", "--", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: childEnv(overrides),
    timeout: 90_000,
  });
}

async function userIdOf(email: string): Promise<string | undefined> {
  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((user) => user.email === email)?.id;
}

async function isAdminRow(email: string): Promise<boolean> {
  const id = await userIdOf(email);
  if (!id) return false;
  const { data, error } = await serviceClient().from("admins").select("user_id").eq("user_id", id);
  if (error) throw error;
  return data.length > 0;
}

let savedAdmins: { user_id: string; created_at: string }[] = [];

async function clearAdmins(): Promise<void> {
  const { error } = await serviceClient().from("admins").delete().neq("user_id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

beforeAll(async () => {
  const { data, error } = await serviceClient().from("admins").select("user_id, created_at");
  if (error) throw error;
  savedAdmins = data;
});

beforeEach(clearAdmins);

afterAll(async () => {
  const service = serviceClient();
  for (const email of emails) {
    const id = await userIdOf(email);
    if (id) await service.auth.admin.deleteUser(id); // the admins row goes with the user
  }
  await clearAdmins();
  if (savedAdmins.length > 0) {
    const { error } = await service.from("admins").upsert(savedAdmins, { onConflict: "user_id" });
    if (error) throw error;
  }
});

describe("scripts/create-admin.ts", () => {
  it("creates a user who can sign in and is an admin, with the password from ADMIN_PASSWORD", async () => {
    const email = newEmail("new");
    const result = runScript([email], { ADMIN_PASSWORD: PASSWORD });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(email);
    expect(result.stdout + result.stderr).not.toContain(PASSWORD);

    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signIn.error).toBeNull();
    const isAdmin = await client.rpc("is_admin");
    expect(isAdmin.data).toBe(true);
  });

  it("never prints the password, not even when run the documented way through npm", async () => {
    const email = newEmail("npm");
    const result = runNpm([email], { ADMIN_PASSWORD: PASSWORD });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(email);
    // npm echoes the command line it runs ("> node ... <args>") unless it is silenced.
    expect(result.stdout + result.stderr).not.toContain(PASSWORD);
    expect(await isAdminRow(email)).toBe(true);
  });

  it("can be run again for the same address: the password is reset and the user stays an admin", async () => {
    const email = newEmail("again");
    expect(runScript([email], { ADMIN_PASSWORD: PASSWORD }).status).toBe(0);
    // A password as the second argument still works (discouraged: it lands in shell history).
    const second = runScript([email, `${PASSWORD}-changed`]);
    expect(second.status, second.stderr).toBe(0);
    expect(await isAdminRow(email)).toBe(true);

    const client = anonClient();
    expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).not.toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: `${PASSWORD}-changed` })).error).toBeNull();
  });

  it("reads the target from the environment, and falls back to the local stack without one", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    const explicit = runScript([newEmail("env")], { ADMIN_PASSWORD: PASSWORD });
    expect(explicit.status, explicit.stderr).toBe(0);
    expect(explicit.stdout).toContain(url);

    const fallback = runScript([newEmail("local"), "--force"], {
      ADMIN_PASSWORD: PASSWORD,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    expect(fallback.status, fallback.stderr).toBe(0);
    expect(fallback.stdout).toContain("local Supabase");
  });

  it("refuses to guess when only one of the two settings is present", () => {
    const result = runScript([newEmail("half")], { ADMIN_PASSWORD: PASSWORD, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  describe("one admin", () => {
    it("refuses to add a second admin, says why, and creates nothing", async () => {
      const first = newEmail("first");
      await createUser(first, PASSWORD, { admin: true });

      const second = newEmail("second");
      const result = runScript([second], { ADMIN_PASSWORD: PASSWORD });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("already has an admin");
      expect(result.stderr).toContain(first);
      expect(result.stderr).toContain("--force");
      expect(await userIdOf(second)).toBeUndefined();
    });

    it("refuses to promote an existing user to a second admin", async () => {
      await createUser(newEmail("owner"), PASSWORD, { admin: true });
      const member = newEmail("member");
      await createUser(member, PASSWORD, { admin: false });

      const result = runScript([member], { ADMIN_PASSWORD: PASSWORD });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--force");
      expect(await isAdminRow(member)).toBe(false);
    });

    it("adds a second admin when --force is given", async () => {
      const first = newEmail("force-first");
      await createUser(first, PASSWORD, { admin: true });

      const second = newEmail("force-second");
      const result = runScript([second, "--force"], { ADMIN_PASSWORD: PASSWORD });

      expect(result.status, result.stderr).toBe(0);
      expect(await isAdminRow(first)).toBe(true);
      expect(await isAdminRow(second)).toBe(true);
    });

    it("still resets the password of the admin who exists, even when there are two", async () => {
      const first = newEmail("reset-first");
      await createUser(first, PASSWORD, { admin: true });
      await createUser(newEmail("reset-second"), PASSWORD, { admin: true });

      const result = runScript([first], { ADMIN_PASSWORD: `${PASSWORD}-changed` });

      expect(result.status, result.stderr).toBe(0);
      const client = anonClient();
      expect((await client.auth.signInWithPassword({ email: first, password: `${PASSWORD}-changed` })).error).toBeNull();
    });
  });

  describe("the password", () => {
    it("asks for it when it is not given and there is no terminal to ask on", async () => {
      const email = newEmail("no-tty");
      const result = runScript([email]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("ADMIN_PASSWORD");
      expect(await userIdOf(email)).toBeUndefined();
    });

    const python = spawnSync("python3", ["--version"], { encoding: "utf8" });
    it.skipIf(python.status !== 0)("is asked for twice on a terminal, without echoing what is typed", async () => {
      const email = newEmail("tty");
      // A pseudo-terminal, so the script believes a person is typing. The prompt is answered
      // only after it appears, and everything the terminal shows is collected.
      const driver = `
import os, pty, select, sys, time
node, script, email, password = sys.argv[1:5]
pid, fd = pty.fork()
if pid == 0:
    os.execv(node, [node, "--experimental-strip-types", script, email])
out = b""
def read_until(marker, seconds=40):
    global out
    deadline = time.time() + seconds
    while marker not in out and time.time() < deadline:
        ready, _, _ = select.select([fd], [], [], 1)
        if ready:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                return
            if not chunk:
                return
            out += chunk
read_until(b"Password: ")
os.write(fd, (password + "\\r").encode())
read_until(b"Repeat password: ")
os.write(fd, (password + "\\r").encode())
while True:
    ready, _, _ = select.select([fd], [], [], 30)
    if not ready:
        break
    try:
        chunk = os.read(fd, 4096)
    except OSError:
        break
    if not chunk:
        break
    out += chunk
_, status = os.waitpid(pid, 0)
sys.stdout.write(out.decode("utf8", "replace"))
sys.exit(os.waitstatus_to_exitcode(status))
`;
      const result = spawnSync("python3", ["-I", "-c", driver, process.execPath, SCRIPT, email, PASSWORD], {
        encoding: "utf8",
        env: childEnv({}),
        timeout: 90_000,
      });

      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("Password: ");
      expect(result.stdout).toContain("Repeat password: ");
      expect(result.stdout).not.toContain(PASSWORD);
      expect(result.stdout).toContain(email);

      const signIn = await anonClient().auth.signInWithPassword({ email, password: PASSWORD });
      expect(signIn.error).toBeNull();
    });
  });

  it("explains the usage and creates nothing when the arguments are wrong", async () => {
    const noArgs = runScript([], { ADMIN_PASSWORD: PASSWORD });
    expect(noArgs.status).not.toBe(0);
    expect(noArgs.stderr).toContain("Usage");

    const badEmail = runScript(["not-an-email"], { ADMIN_PASSWORD: PASSWORD });
    expect(badEmail.status).not.toBe(0);
    expect(badEmail.stderr).toContain("email");

    const unknownFlag = runScript([newEmail("flag"), "--frce"], { ADMIN_PASSWORD: PASSWORD });
    expect(unknownFlag.status).not.toBe(0);
    expect(unknownFlag.stderr).toContain("--frce");

    const tooMany = runScript([newEmail("many"), PASSWORD, "extra"]);
    expect(tooMany.status).not.toBe(0);
    expect(tooMany.stderr).toContain("Usage");

    const email = newEmail("short");
    const shortArg = runScript([email, "short"]);
    expect(shortArg.status).not.toBe(0);
    expect(shortArg.stderr).toContain("password");
    const shortEnv = runScript([email], { ADMIN_PASSWORD: "short" });
    expect(shortEnv.status).not.toBe(0);
    expect(shortEnv.stderr).toContain("password");
    expect(await userIdOf(email)).toBeUndefined();
  });
});
