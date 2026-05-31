export type BulkResult =
  | { ok: true; succeeded: number; failed: number; firstError?: string }
  | { ok: false; error: string };
