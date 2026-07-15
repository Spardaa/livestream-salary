import type { ConsensusItem } from "./consensus";

export type IssueSeverity = "error" | "warn" | "info";

export type ValidationIssue = {
  severity: IssueSeverity;
  message: string;
  imageIds?: string[];
  date?: string;
};

/** Layer2：确定性兜底校验（不耗 LLM）。 */
export function validateBatch(
  items: ConsensusItem[],
  month?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const it of items) {
    if (!it.consensus) continue;
    const v = it.consensus.value;

    if (it.consensus.confidence === "flagged") {
      issues.push({
        severity: "error",
        message: `${it.name}：三次抽取结果不一致，需人工核对`,
        imageIds: [it.id],
      });
    }
    if (v.refund > v.gmv) {
      issues.push({
        severity: "warn",
        message: `${it.name}：退款(${v.refund}) > GMV(${v.gmv})，疑似识别异常`,
        imageIds: [it.id],
      });
    }
    if (month && v.date.slice(0, 7) !== month) {
      issues.push({
        severity: "info",
        message: `${it.name}：日期 ${v.date} 不在所选月份 ${month}`,
        imageIds: [it.id],
      });
    }
  }

  // 疑似重复截图：同平台同日同时段
  const seen = new Map<string, string[]>();
  for (const it of items) {
    if (!it.consensus) continue;
    const v = it.consensus.value;
    const sig = `${v.platform}|${v.date}|${v.start_time}`;
    seen.set(sig, [...(seen.get(sig) ?? []), it.id]);
  }
  for (const ids of seen.values()) {
    if (ids.length > 1) {
      issues.push({
        severity: "warn",
        message: `疑似重复截图：${ids.length} 张同平台同日同时段`,
        imageIds: ids,
      });
    }
  }

  return issues;
}

export function countBySeverity(issues: ValidationIssue[]) {
  return {
    error: issues.filter((i) => i.severity === "error").length,
    warn: issues.filter((i) => i.severity === "warn").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}
