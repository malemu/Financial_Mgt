"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:border-white"
    >
      Sign out
    </button>
  );
}
