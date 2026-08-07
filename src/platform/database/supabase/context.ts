import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "./client";
import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * A resolved caller: a Supabase client plus the id of the user it acts as.
 *
 * Browser code omits it and lets the current session be resolved. Server
 * functions pass the request-scoped client from `requireSupabaseAuth`, which
 * keeps RLS applied while avoiding a second round trip for the user id.
 */
export interface SupabaseUserContext {
  client: TypedSupabaseClient;
  userId: string;
}

export async function resolveUserContext(
  context?: SupabaseUserContext,
): Promise<SupabaseUserContext | null> {
  if (context) {
    return context;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return { client: supabase, userId: user.id };
}
