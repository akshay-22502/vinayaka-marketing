// A stand-in for the Supabase client in unit tests of Server Actions: it records every query and
// RPC call and answers each one from a function the test supplies.

export type Op = { name: string; args: unknown[] };
export type Query = { table: string; ops: Op[] };
export type Outcome = { data?: unknown; error?: { code?: string; message: string; details?: string } | null };
export type RpcCall = { name: string; args: Record<string, unknown> };
export type StorageCall = { bucket: string; method: string; args: unknown[] };

export function createFakeSupabase(options: {
  answer?: (query: Query) => Outcome;
  answerRpc?: (call: RpcCall) => Outcome;
  answerStorage?: (call: StorageCall) => Outcome;
}) {
  const answer: (query: Query) => Outcome = options.answer ?? (() => ({ data: [{ id: "row" }] }));
  const answerRpc: (call: RpcCall) => Outcome = options.answerRpc ?? (() => ({ data: null }));
  const queries: Query[] = [];
  const rpcCalls: RpcCall[] = [];
  const answerStorage: (call: StorageCall) => Outcome = options.answerStorage ?? (() => ({ data: [] }));
  const storageCalls: StorageCall[] = [];

  const supabase = {
    from(table: string) {
      const query: Query = { table, ops: [] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const name of ["insert", "update", "upsert", "delete", "select", "eq", "in", "single", "order"]) {
        builder[name] = (...args: unknown[]) => {
          query.ops.push({ name, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
        const outcome = answer(query);
        return Promise.resolve(resolve({ data: outcome.data ?? null, error: outcome.error ?? null }));
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      const call: RpcCall = { name, args };
      rpcCalls.push(call);
      const outcome = answerRpc(call);
      return Promise.resolve({ data: outcome.data ?? null, error: outcome.error ?? null });
    },
    storage: {
      from(bucket: string) {
        const call = (method: string) => (...args: unknown[]) => {
          const storageCall: StorageCall = { bucket, method, args };
          storageCalls.push(storageCall);
          const outcome = answerStorage(storageCall);
          return Promise.resolve({ data: outcome.data ?? null, error: outcome.error ?? null });
        };
        return { remove: call("remove"), createSignedUrl: call("createSignedUrl") };
      },
    },
  };

  return { supabase, queries, rpcCalls, storageCalls };
}
