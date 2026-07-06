import type { Env } from "./types";

export async function audit(
  env: Env,
  action: string,
  metadata: Record<string, string | number | boolean | null | undefined>,
  actorUserId: string | null = null
): Promise<void> {
  if (!env.DB) return;
  const safeMetadata = JSON.stringify(metadata);
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(crypto.randomUUID(), actorUserId, action, "auth", actorUserId, safeMetadata)
      .run();
  } catch (cause) {
    console.warn(JSON.stringify({ event: "audit_write_failed", action, cause: String(cause) }));
  }
}
