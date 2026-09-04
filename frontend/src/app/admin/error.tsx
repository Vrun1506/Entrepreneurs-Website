"use client";

import { SegmentError } from "@/components/SegmentError";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} label="this admin page" />;
}
