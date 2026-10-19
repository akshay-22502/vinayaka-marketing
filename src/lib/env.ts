/** Read a required server-side env var; throws a clear error if it is unset or empty. */
export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

export const env = { requireServerEnv };
