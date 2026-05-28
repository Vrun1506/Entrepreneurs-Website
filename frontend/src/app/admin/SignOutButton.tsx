"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    // supabase.auth.signOut() clears the local session even if the server
    // request fails, so we redirect either way. Log so we can spot
    // recurring server-side failures.
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Sign out server call failed:", error);
    router.replace("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-[0.8rem] text-text-muted bg-transparent border border-border rounded-full px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:text-text-primary hover:border-gold/40"
    >
      Sign out
    </button>
  );
}
