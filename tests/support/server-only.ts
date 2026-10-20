// Stand-in for the `server-only` package in tests. The real one throws when it is
// imported outside a React Server Components build, which would stop unit and
// database tests from loading the server modules they exercise.
export {};
