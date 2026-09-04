import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

type Params = {
  supabase: Supabase;
  setError: (v: string) => void;
  setIsLoading: (v: boolean) => void;
};

export function useGoogleAuth(p: Params) {
  const handleGoogle = async () => {
    p.setError("");
    p.setIsLoading(true);
    const { error: oauthError } = await p.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      p.setError(oauthError.message);
      p.setIsLoading(false);
    }
  };

  return { handleGoogle };
}
