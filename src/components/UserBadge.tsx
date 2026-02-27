import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export default async function UserBadge() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.email) {
    return null;
  }

  return (
    <span className="rounded-full border border-white/30 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
      {session.user.email}
    </span>
  );
}
