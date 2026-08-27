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
      className="text-[0.8rem] bg-white/[0.05] border border-border-strong text-text-primary rounded-full px-4 py-1.5 cursor-pointer transition-colors duration-150 hover:bg-white/[0.10] hover:border-gold/50"
    >
      Sign out
    </button>
  );
}
