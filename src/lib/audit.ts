import { useEffect, useState } from "react";
import { client } from "./client";
import type { Schema } from "../../amplify/data/resource";

export type AuditEntry = Schema["AuditLog"]["type"];

interface WriteAuditInput {
  actorId: string;
  actorLabel?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an audit log entry. Best-effort: failures are logged to console but
 * never thrown — audit failures should not break the user-visible action that
 * spawned them.
 */
export async function writeAudit(input: WriteAuditInput) {
  try {
    await client.models.AuditLog.create({
      actorId:    input.actorId,
      actorLabel: input.actorLabel ?? null,
      action:     input.action,
      targetType: input.targetType ?? null,
      targetId:   input.targetId ?? null,
      summary:    input.summary ?? null,
      before:     input.before  !== undefined ? JSON.stringify(input.before)  : null,
      after:      input.after   !== undefined ? JSON.stringify(input.after)   : null,
      timestamp:  new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Audit write failed (non-fatal):", err);
  }
}

/** Live audit feed, newest first. Capped at the latest 50 entries. */
export function useAuditFeed(limit = 50) {
  const [items, setItems]     = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = client.models.AuditLog.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        const sorted = [...items].sort((a, b) =>
          (b.timestamp ?? "").localeCompare(a.timestamp ?? "")
        );
        setItems(sorted.slice(0, limit));
        if (isSynced) setLoading(false);
      },
      error: (err) => { console.error("AuditLog subscription error", err); setLoading(false); },
    });
    return () => sub.unsubscribe();
  }, [limit]);

  return { items, loading };
}
