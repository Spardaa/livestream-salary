import type { Confidence, RichMetrics } from "./types";
import type { Extraction } from "./schema";

/** 一张图的三抽表决结果 */
export type ConsensusResult = {
  value: Extraction; // 采纳值（多数）
  confidence: Confidence; // high(3/3) | medium(2/3) | flagged(无多数)
  draws: Extraction[]; // 全部抽取
  dissents: Extraction[]; // 与采纳值不一致的抽取
};

/** 一张图（带表决结果）——供 validate/aggregate 消费。rich 仅表格导入时存在。 */
export type ConsensusItem = {
  id: string;
  name: string;
  consensus: ConsensusResult | null;
  rich?: RichMetrics;
};

/** 关键字段签名：平台|日期|开播|GMV|退款。日期/时间已在 schema 归一化。 */
function signature(e: Extraction): string {
  return `${e.platform}|${e.date}|${e.start_time}|${e.gmv}|${e.refund}`;
}

/** 对一张图的多次抽取做多数表决。 */
export function vote(draws: Extraction[]): ConsensusResult {
  const groups = new Map<string, Extraction[]>();
  for (const d of draws) {
    const s = signature(d);
    const arr = groups.get(s) ?? [];
    arr.push(d);
    groups.set(s, arr);
  }
  let bestSig = "";
  let bestArr: Extraction[] = [];
  for (const [sig, arr] of groups) {
    if (arr.length > bestArr.length) {
      bestSig = sig;
      bestArr = arr;
    }
  }
  const value = bestArr[0];
  const confidence: Confidence =
    bestArr.length >= 3 ? "high" : bestArr.length === 2 ? "medium" : "flagged";
  const dissents = draws.filter((d) => signature(d) !== bestSig);
  return { value, confidence, draws, dissents };
}
