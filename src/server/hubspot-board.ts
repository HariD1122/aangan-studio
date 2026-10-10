import "server-only";
import { hs } from "./hubspot";
import type { Deal, StageInfo } from "@/lib/board";

type Cache = { at: number; data: { deals: Deal[]; stages: StageInfo[] } };
let cache: Cache | null = null;
const TTL_MS = 30_000; // no need to call HubSpot on every refresh

/** Reads every deal and the pipeline stages from HubSpot (read-only). */
export async function fetchBoardData(): Promise<{ deals: Deal[]; stages: StageInfo[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const pipeline = await hs("GET", "/crm/v3/pipelines/deals/default");
  const stages: StageInfo[] = (pipeline.stages as { id: string; metadata?: { isClosed?: string | boolean; probability?: string } }[]).map((s) => {
    const closed = String(s.metadata?.isClosed) === "true";
    return { id: s.id, closed, won: closed && Number(s.metadata?.probability) >= 1 };
  });

  const deals: Deal[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) { // up to 2,000 deals
    const r = await hs("POST", "/crm/v3/objects/deals/search", {
      filterGroups: [], limit: 100, after,
      properties: ["dealname", "amount", "dealstage", "aangan_is_demo", "createdate"],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    });
    for (const x of r.results as { id: string; properties: Record<string, string | null> }[]) {
      const p = x.properties;
      const amount = p.amount === null || p.amount === undefined || p.amount === "" ? null : Number(p.amount);
      deals.push({
        id: x.id, name: p.dealname ?? "(no name)", amount: Number.isFinite(amount) ? amount : null,
        stageId: p.dealstage ?? "", demo: p.aangan_is_demo === "true",
        createdYear: new Date(p.createdate ?? Date.now()).getUTCFullYear(),
      });
    }
    after = r.paging?.next?.after;
    if (!after) break;
  }
  cache = { at: Date.now(), data: { deals, stages } };
  return cache.data;
}
