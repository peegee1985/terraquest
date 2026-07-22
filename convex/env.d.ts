// Convex functions run with `process.env` available at runtime, but this
// project's isolated convex/tsconfig.json doesn't pick up @types/node the
// way the root app typecheck does, so `process` is otherwise unresolved
// when `convex deploy --typecheck enable` runs its own tsc pass.
declare const process: { env: Record<string, string | undefined> };
