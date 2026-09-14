import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

function verifyCronAuth(authHeader: string | null, expectedSecret: string): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ") || !expectedSecret) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const tokenBytes = new TextEncoder().encode(token);
  const secretBytes = new TextEncoder().encode(expectedSecret);

  if (tokenBytes.byteLength !== secretBytes.byteLength) {
    return false;
  }

  try {
    return timingSafeEqual(tokenBytes, secretBytes);
  } catch {
    let mismatch = 0;
    for (let i = 0; i < tokenBytes.byteLength; i++) {
      mismatch |= tokenBytes[i] ^ secretBytes[i];
    }
    return mismatch === 0;
  }
}

function getSupabaseSecretKey(): string {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeysJson) {
    throw new Error("SUPABASE_SECRET_KEYS environment variable is missing.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(secretKeysJson);
  } catch (err) {
    throw new Error(`Failed to parse SUPABASE_SECRET_KEYS JSON: ${(err as Error).message}`);
  }

  const key = parsed["default"] ?? parsed["service_role"];
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("SUPABASE_SECRET_KEYS does not contain a valid 'default' or 'service_role' key.");
  }

  return key;
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured in Edge Function environment.");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!verifyCronAuth(authHeader, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let secretKey: string;
  try {
    secretKey = getSupabaseSecretKey();
  } catch (err: unknown) {
    console.error("Database configuration error:", err);
    return new Response(JSON.stringify({ error: "Database configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!supabaseUrl) {
    console.error("Missing SUPABASE_URL");
    return new Response(JSON.stringify({ error: "Database configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let batchLimit = 50;
  try {
    const body = await req.json();
    if (body && typeof body.batch_limit === "number") {
      batchLimit = Math.min(Math.max(body.batch_limit, 1), 50);
    }
  } catch {
    // Default to 50 if body is empty or invalid JSON
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("cron_run_lifecycle_sweep", {
    p_batch_limit: batchLimit,
  });

  const executionTimeMs = Date.now() - startTime;

  if (error) {
    console.error("cron_run_lifecycle_sweep error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        execution_time_ms: executionTimeMs,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ...data,
      execution_time_ms: executionTimeMs,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
