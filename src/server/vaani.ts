import "server-only";

/** Read-only client for the VaaniVoice API (https://docs.vaanivoice.ai). Auth: X-API-Key header. */
const BASE = "https://api.vaanivoice.ai";

async function vv(path: string): Promise<unknown> {
  const key = process.env.VAANIVOICE_API_KEY;
  if (!key) throw new Error("VaaniVoice API key is not configured.");
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("VaaniVoice did not respond (network problem or timeout).");
  }
  if (res.status === 401 || res.status === 403) throw new Error("VaaniVoice rejected the API key.");
  if (!res.ok) throw new Error(`VaaniVoice returned an error (${res.status}).`);
  return res.json();
}

export type AgentInfo = { connected: boolean; agentName?: string; agentId?: string; status?: string; inboundNumber?: string | null; error?: string };

export async function getAgentInfo(): Promise<AgentInfo> {
  try {
    const r = (await vv("/api/agents")) as unknown;
    const list = (Array.isArray(r) ? r : (r as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[];
    const wanted = process.env.VAANIVOICE_AGENT_ID;
    const a = list.find((x) => x.id === wanted) ?? list[0];
    if (!a) return { connected: true, error: "No agent found in the VaaniVoice account." };
    const cfg = (a.deployment_config ?? {}) as { deployment?: { phone?: { call_type?: { Inbound?: string } } } };
    return {
      connected: true, agentName: String(a.display_name ?? a.agent_name ?? "agent"), agentId: String(a.id), status: String(a.status ?? "unknown"),
      inboundNumber: cfg.deployment?.phone?.call_type?.Inbound || null,
    };
  } catch (e) {
    return { connected: false, error: (e as Error).message };
  }
}

export type CallDetails = { transcript: string | null; summary: string | null; entities: unknown };

/** Used only when the webhook did not include the transcript. */
export async function getCallDetails(callId: string): Promise<CallDetails | null> {
  try {
    const d = (await vv(`/api/call_details/${encodeURIComponent(callId)}`)) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" && !/not available/i.test(v) && v.trim() ? v.trim() : null);
    return { transcript: s(d.transcription), summary: s(d.summary), entities: d.entity ?? null };
  } catch {
    return null;
  }
}
