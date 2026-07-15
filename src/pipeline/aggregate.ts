import type { Confidence, Platform, Slot } from "./types";
import type { ConsensusItem } from "./consensus";
import { DEFAULTS } from "../config/constants";

export type PlatformAgg = {
  gmv: number;
  refund: number;
  sources: string[]; // imageIds
  confidences: Confidence[];
};

/** 原始按日期的日表行（跨所有员工，用于抽取预览）。 */
export type DayRow = {
  date: string;
  douyin: PlatformAgg | null;
  xiaohongshu: PlatformAgg | null;
  slots: Slot[]; // 当日出现的所有时段
  confidence: Confidence;
  imageIds: string[];
};

/** 开播时间 → 时段：早班(<12:00) / 下午班(12-18) / 晚班(>=18:00) */
export function classifySlot(time: string): Slot {
  const [h, m] = time.split(":").map(Number);
  const minutes = h * 60 + m;
  if (minutes < DEFAULTS.slot.afternoonStart) return "morning";
  if (minutes < DEFAULTS.slot.nightStart) return "afternoon";
  return "night";
}

/** 某月所有日期（YYYY-MM-DD），升序。 */
export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}

export function aggPlatform(dayItems: ConsensusItem[], platform: Platform): PlatformAgg | null {
  const matching = dayItems.filter((it) => it.consensus?.value.platform === platform);
  if (matching.length === 0) return null;
  return {
    gmv: matching.reduce((s, it) => s + it.consensus!.value.gmv, 0),
    refund: matching.reduce((s, it) => s + it.consensus!.value.refund, 0),
    sources: matching.map((it) => it.id),
    confidences: matching.map((it) => it.consensus!.confidence),
  };
}

export function worstConf(c: Confidence[]): Confidence {
  if (c.includes("flagged")) return "flagged";
  if (c.includes("medium")) return "medium";
  return "high";
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** 无任何直播数据的日期行。 */
export function isEmptyDay(r: { douyin: PlatformAgg | null; xiaohongshu: PlatformAgg | null }): boolean {
  return !r.douyin && !r.xiaohongshu;
}

/** 把若干张图的表决结果合并成按日期的日表。给月份则整月补齐空行。 */
export function aggregate(items: ConsensusItem[], month?: string): DayRow[] {
  const byDate = new Map<string, ConsensusItem[]>();
  for (const it of items) {
    if (!it.consensus) continue;
    const d = it.consensus.value.date;
    byDate.set(d, [...(byDate.get(d) ?? []), it]);
  }

  const dates = new Set<string>(byDate.keys());
  if (month) for (const d of monthDates(month)) dates.add(d);

  const rows: DayRow[] = [];
  for (const date of dates) {
    const dayItems = byDate.get(date) ?? [];
    if (dayItems.length === 0) {
      rows.push({ date, douyin: null, xiaohongshu: null, slots: [], confidence: "high", imageIds: [] });
      continue;
    }
    rows.push({
      date,
      douyin: aggPlatform(dayItems, "douyin"),
      xiaohongshu: aggPlatform(dayItems, "xiaohongshu"),
      slots: unique(dayItems.map((it) => classifySlot(it.consensus!.value.start_time))),
      confidence: worstConf(dayItems.map((it) => it.consensus!.confidence)),
      imageIds: dayItems.map((i) => i.id),
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

/** 合计一行（所有日期之和）。 */
export function sumDayRows(rows: DayRow[]) {
  const sum = (sel: (r: DayRow) => PlatformAgg | null, key: "gmv" | "refund") =>
    rows.reduce((s, r) => s + (sel(r)?.[key] ?? 0), 0);
  return {
    douyinGmv: sum((r) => r.douyin, "gmv"),
    douyinRefund: sum((r) => r.douyin, "refund"),
    xhsGmv: sum((r) => r.xiaohongshu, "gmv"),
    xhsRefund: sum((r) => r.xiaohongshu, "refund"),
  };
}
