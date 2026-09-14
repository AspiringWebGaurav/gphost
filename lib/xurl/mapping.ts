import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface XurlMapping {
  id: string;
  share_link_id: string;
  xurl_id: string | null;
  xurl_short_url: string | null;
  target_url: string;
  status: "pending" | "active" | "failed" | "cooldown";
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export const PENDING_LEASE_TTL_MS = 60_000; // 60 seconds

function getAdminClient(customClient?: SupabaseClient): SupabaseClient {
  if (customClient) return customClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }
  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Executes an atomic reservation for an XURL mapping row using PostgreSQL
 * INSERT ... ON CONFLICT (share_link_id) DO NOTHING.
 *
 * Concurrency & Recovery Invariant:
 * - If row is inserted: caller is the designated creator (isCreator: true).
 * - If conflict occurred: caller is not creator (isCreator: false).
 * - If existing row is stuck in 'pending' for > 60s, it is safely recovered
 *   to 'failed' without making an uncoordinated external API call.
 */
export async function reserveXurlMapping(
  shareLinkId: string,
  targetUrl: string,
  client?: SupabaseClient
): Promise<{ isCreator: boolean; mapping: XurlMapping | null }> {
  const adminClient = getAdminClient(client);

  // 1. Atomic reservation via PostgREST upsert with ignoreDuplicates
  const { data: inserted, error: insertError } = await adminClient
    .from("xurl_mappings")
    .upsert(
      {
        share_link_id: shareLinkId,
        target_url: targetUrl,
        status: "pending",
      },
      { onConflict: "share_link_id", ignoreDuplicates: true }
    )
    .select(
      "id, share_link_id, xurl_id, xurl_short_url, target_url, status, retry_count, last_error, created_at, updated_at"
    );

  if (insertError) {
    console.error("[XURL] Error inserting xurl_mapping reservation:", insertError);
  }

  // If a row was returned, this process won the race and is the designated creator
  if (inserted && inserted.length > 0) {
    return {
      isCreator: true,
      mapping: inserted[0] as XurlMapping,
    };
  }

  // 2. Conflict occurred: fetch the existing row
  const { data: existing, error: selectError } = await adminClient
    .from("xurl_mappings")
    .select(
      "id, share_link_id, xurl_id, xurl_short_url, target_url, status, retry_count, last_error, created_at, updated_at"
    )
    .eq("share_link_id", shareLinkId)
    .single();

  if (selectError || !existing) {
    console.error("[XURL] Error fetching existing xurl_mapping row:", selectError);
    return { isCreator: false, mapping: null };
  }

  const mapping = existing as XurlMapping;

  // 3. Check for stale pending reservation (> 60s)
  if (mapping.status === "pending") {
    const ageMs = Date.now() - new Date(mapping.created_at).getTime();
    if (ageMs > PENDING_LEASE_TTL_MS) {
      console.warn(
        `[XURL] Stale pending reservation detected (${ageMs}ms > ${PENDING_LEASE_TTL_MS}ms) for share ${shareLinkId}. Transitioning to failed.`
      );
      // Atomic conditional update to prevent concurrent double-transitions
      const { data: recovered } = await adminClient
        .from("xurl_mappings")
        .update({
          status: "failed",
          last_error: "Reservation timed out / worker crash",
        })
        .eq("share_link_id", shareLinkId)
        .eq("status", "pending")
        .select()
        .single();

      return {
        isCreator: false,
        mapping: (recovered as XurlMapping) || mapping,
      };
    }
  }

  return {
    isCreator: false,
    mapping,
  };
}

/**
 * Authoritatively updates the status and short URL coordinates of an xurl_mappings row.
 */
export async function updateXurlMapping(
  shareLinkId: string,
  updates: {
    status: "active" | "failed" | "cooldown";
    xurlId?: string | null;
    xurlShortUrl?: string | null;
    lastError?: string | null;
    retryCount?: number;
  },
  client?: SupabaseClient
): Promise<XurlMapping | null> {
  const adminClient = getAdminClient(client);

  const payload: Record<string, unknown> = {
    status: updates.status,
    last_error: updates.lastError ?? null,
  };

  if (updates.xurlId !== undefined) payload.xurl_id = updates.xurlId;
  if (updates.xurlShortUrl !== undefined) payload.xurl_short_url = updates.xurlShortUrl;
  if (updates.retryCount !== undefined) payload.retry_count = updates.retryCount;

  const { data, error } = await adminClient
    .from("xurl_mappings")
    .update(payload)
    .eq("share_link_id", shareLinkId)
    .select(
      "id, share_link_id, xurl_id, xurl_short_url, target_url, status, retry_count, last_error, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error(`[XURL] Failed to update xurl_mapping for share ${shareLinkId}:`, error);
    return null;
  }

  return data as XurlMapping;
}

/**
 * Fetches the current XURL mapping for a given share link.
 */
export async function getXurlMapping(
  shareLinkId: string,
  client?: SupabaseClient
): Promise<XurlMapping | null> {
  const adminClient = getAdminClient(client);
  const { data, error } = await adminClient
    .from("xurl_mappings")
    .select(
      "id, share_link_id, xurl_id, xurl_short_url, target_url, status, retry_count, last_error, created_at, updated_at"
    )
    .eq("share_link_id", shareLinkId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as XurlMapping;
}
