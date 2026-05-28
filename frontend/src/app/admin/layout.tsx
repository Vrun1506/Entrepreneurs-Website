import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server-side admin gate. notFound() renders the same 404 page as any
// non-existent route, so non-admins can't even tell the route exists.
// This is defense in depth — the database (RLS + is_admin checks inside
// every admin RPC function) is the actual security boundary.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  return <>{children}</>;
}
