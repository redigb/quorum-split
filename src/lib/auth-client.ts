"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

let client: SupabaseClient | null = null;

/** Cliente del navegador: SOLO para iniciar sesión (anon key). Ninguna tabla es accesible desde aquí (RLS cerrado). */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** `undefined` = todavía cargando, `null` = sin sesión. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabaseBrowser().auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Headers para las rutas protegidas: token de sala del anfitrión si lo hay, si no la sesión de la cuenta. */
export async function hostHeaders(roomToken?: string): Promise<Record<string, string>> {
  if (roomToken) return { authorization: `Bearer ${roomToken}` };
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session ? { "x-session": data.session.access_token } : {};
}

export async function sendMagicLink(email: string, redirectPath: string) {
  const { error } = await supabaseBrowser().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}${redirectPath}` },
  });
  if (error) throw error;
}
