"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

function LoginForm() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSupabase(createSupabaseBrowserClient());
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setStatus("loading");
    setError(null);
    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setStatus("error");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--panel)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[color:var(--line)] bg-white p-8 shadow-[var(--shadow)]">
        <h1 className="text-center font-display text-2xl text-[color:var(--ink)]">
          Conviction OS
        </h1>
        <p className="mt-2 text-center text-sm text-[color:var(--muted)]">
          Sign in with your Supabase credentials.
        </p>
        <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
          <label className="text-sm text-[color:var(--muted)]">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="text-sm text-[color:var(--muted)]">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--ink)]"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {error && (
            <p className="text-sm text-[color:var(--danger)]">{error}</p>
          )}
          <button
            type="submit"
            className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white disabled:opacity-60"
            disabled={status === "loading" || !supabase}
          >
            {mode === "login" ? "Sign In" : "Register"}
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-[color:var(--muted)]">
          {mode === "login" ? (
            <button
              type="button"
              className="font-semibold text-[color:var(--ink)]"
              onClick={() => setMode("register")}
            >
              Need an account? Register
            </button>
          ) : (
            <button
              type="button"
              className="font-semibold text-[color:var(--ink)]"
              onClick={() => setMode("login")}
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
        <div className="mt-6 text-center text-xs text-[color:var(--muted)]">
          <Link href="https://supabase.com/docs/guides/auth" className="underline">
            Forgot password? Use Supabase reset email.
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[color:var(--panel)] px-4 py-10">
          <div className="rounded-3xl border border-[color:var(--line)] bg-white/70 px-6 py-4 text-sm text-[color:var(--muted)]">
            Loading sign-in…
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
