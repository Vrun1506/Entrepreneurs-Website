import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on every request except static assets and image optimisation.
    // Skipping fonts/css/js too — they don't need a session refresh and
    // running getUser() on every font request is wasted DB chatter.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|css|js)$).*)",
  ],
};
