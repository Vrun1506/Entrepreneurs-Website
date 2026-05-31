// Discriminated-union return type for server actions and any other
// callsite where "did it work" matters more than throwing. Reused so we
// don't redeclare `Result` in seven different actions.

export type Result<T = void, E = string> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: E };

export const ok: {
  (): Result<void>;
  <T>(data: T): Result<T>;
} = ((data?: unknown) =>
  data === undefined
    ? { ok: true }
    : { ok: true, data }
) as never;

export const err = <E = string>(error: E): Result<never, E> => ({ ok: false, error });
