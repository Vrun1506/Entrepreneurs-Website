"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Verifies an approved listing still exists with status='approved'.
//
// Use case: the listing pages server-render the directory once at page
// load. If a poster deletes their listing afterward (or it expires, or
// it's pulled by an admin), viewers continue to see a stale card until
// they refresh. Calling check() before showing the expanded detail
// view catches the staleness and lets the UI render a clean "no longer
// available" state instead of pretending the card is still live.
//
// Once stale is true, repeated check() calls are no-ops — the listing
// won't come back.
export function useListingFreshness(table: "opportunities" | "events" | "vcs_grants", id: string) {
  const supabase = useMemo(() => createClient(), []);
  const [checking, setChecking] = useState(false);
  const [stale, setStale] = useState(false);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    if (checked || stale) return;
    setChecking(true);
    const { data } = await supabase
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("status", "approved")
      .maybeSingle();
    setChecking(false);
    setChecked(true);
    if (!data) setStale(true);
  }, [supabase, table, id, checked, stale]);

  return { checking, stale, check };
}
