import type { SupabaseClient } from "@supabase/supabase-js";

const PER_PAGE = 200;

/**
 * Creates the auth user (email confirmed) or reuses the existing one, then
 * grants or revokes admin rights, and returns the user id.
 *
 * Needs a service-role client. This is the only place that creates users: the
 * DB tests, the E2E preparation script and the create-admin script all call it.
 * An existing user gets the given password, so re-running resets it.
 */
export async function ensureUser(
  service: SupabaseClient,
  email: string,
  password: string,
  opts: { admin: boolean },
): Promise<string> {
  const normalised = email.trim().toLowerCase();
  const id = await createOrUpdateUser(service, normalised, password);

  if (opts.admin) {
    const { error } = await service
      .from("admins")
      .upsert({ user_id: id }, { onConflict: "user_id" });
    if (error) throw new Error(`Could not grant admin to ${normalised}: ${error.message}`);
  } else {
    const { error } = await service.from("admins").delete().eq("user_id", id);
    if (error) throw new Error(`Could not revoke admin from ${normalised}: ${error.message}`);
  }
  return id;
}

async function createOrUpdateUser(
  service: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.data.user) return created.data.user.id;

  if (created.error?.code !== "email_exists") {
    throw new Error(`Could not create user ${email}: ${created.error?.message}`);
  }

  const existingId = await findUserId(service, email);
  const updated = await service.auth.admin.updateUserById(existingId, {
    password,
    email_confirm: true,
  });
  if (updated.error) {
    throw new Error(`Could not update user ${email}: ${updated.error.message}`);
  }
  return existingId;
}

async function findUserId(service: SupabaseClient, email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < PER_PAGE) {
      throw new Error(`User ${email} reported as existing but was not found`);
    }
  }
}
