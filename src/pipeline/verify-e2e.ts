import type { ConsensusResult } from "./consensus";
import type { Extraction } from "./schema";

/** Layer3 需要的极小 item 形状（避免与 store 循环依赖）。 */
export type E2EItem = {
  id: string;
  name: string;
  draws: Extraction[];
  consensus: ConsensusResult | null;
};

export type E2EStatus = "consistent" | "divergent";

export type E2EVerification = {
  status: E2EStatus;
  divergentDates: string[]; // 三次抽取下数值跳变的日期
  divergentImageIds: string[]; // 这些日期上的图
};

type DayTotals = { dg: number; dr: number; xg: number; xr: number };

/** 用第 drawIndex 次抽取构建 日期→(各平台 GMV/退款) 的原始聚合（不涉及员工/薪资）。 */
function rawByDate(items: E2EItem[], drawIndex: number): Map<string, DayTotals> {
  const m = new Map<string, DayTotals>();
  for (const it of items) {
    const ext = it.draws[drawIndex] ?? it.consensus?.value;
    if (!ext) continue;
    const cur = m.get(ext.date) ?? { dg: 0, dr: 0, xg: 0, xr: 0 };
    if (ext.platform === "douyin") {
      cur.dg += ext.gmv;
      cur.dr += ext.refund;
    } else {
      cur.xg += ext.gmv;
      cur.xr += ext.refund;
    }
    m.set(ext.date, cur);
  }
  return m;
}

/**
 * Layer3：用三次抽取分别构建原始日聚合并逐日比对。
 * 复用已付费的抽取，零额外调用。任一日期三表数值不一致 → divergent。
 */
export function verifyE2E(items: E2EItem[]): E2EVerification {
  const maps = [0, 1, 2].map((k) => rawByDate(items, k)).filter((m) => m.size > 0);
  if (maps.length === 0)
    return { status: "consistent", divergentDates: [], divergentImageIds: [] };

  const dates = new Set<string>();
  maps.forEach((m) => {
    for (const d of m.keys()) dates.add(d);
  });

  const divergentDates: string[] = [];
  for (const date of dates) {
    const keys = maps.map((m) => {
      const c = m.get(date);
      return c ? `${c.dg}|${c.dr}|${c.xg}|${c.xr}` : "";
    });
    if (new Set(keys).size > 1) divergentDates.push(date);
  }

  const divergentImageIds = items
    .filter((it) => it.consensus && divergentDates.includes(it.consensus.value.date))
    .map((it) => it.id);

  return {
    status: divergentDates.length ? "divergent" : "consistent",
    divergentDates,
    divergentImageIds,
  };
}

/** 仍被标记 flagged（熔断）的图——这些会触发硬门禁。 */
export function unresolvedImageIds(items: E2EItem[]): string[] {
  return items.filter((it) => it.consensus?.confidence === "flagged").map((it) => it.id);
}
