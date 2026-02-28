"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export default function SignOutButton() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSupabase(createSupabaseBrowserClient());
    }
  }, []);

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:border-white"
      disabled={!supabase}
    >
      Sign out
    </button>
  );
}
