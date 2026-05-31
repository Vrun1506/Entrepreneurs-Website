import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { allow, clientIp } from "@/lib/ratelimit";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching getUser() here causes @supabase/ssr to refresh the session
  // cookie if it's near expiry. Do not run code between createServerClient
  // and getUser() — it's a known auth race condition.
  await supabase.auth.getUser();

  // Coarse per-IP backstop on mutations (Next server actions are POSTs).
  // No-op unless Upstash is configured; reads (GET/HEAD) never hit Redis.
  // Cloudflare absorbs real floods at the edge — this is defence in depth.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const allowed = await allow("mutations", clientIp(request.headers));
    if (!allowed) {
      return new NextResponse("Too many requests. Please slow down and try again shortly.", { status: 429 });
    }
  }

  return response;
}
