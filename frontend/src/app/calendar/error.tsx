"use client";

import { SegmentError } from "@/components/SegmentError";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError error={error} reset={reset} label="the calendar" />;
}
