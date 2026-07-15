import type { SalaryRow } from "./salary";
import type { Extraction } from "./schema";
import type { Confidence, Platform, Slot } from "./types";
import { classifySlot } from "./aggregate";

type ItemLike = {
  consensus: { value: Extraction; confidence: Confidence } | null;
};

export type PlatformStat = {
  gmv: number;
  refund: number;
  net: number;
  refundRate: number;
  sessions: number;
};

export type Stats = {
  month?: string;
  days: number; // 有直播的天数
  sessions: number;
  finance: {
    douyin: PlatformStat;
    xhs: PlatformStat;
    total: PlatformStat;
    avgDailyNet: number;
  };
  slots: Record<Slot, PlatformStat>;
  daily: { date: string; douyinNet: number; xhsNet: number; net: number }[];
  topSessions: { platform: Platform; date: string; gmv: number; refund: number }[];
  metrics: Record<Platform, Record<string, { avg: number; count: number }>>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseNumber(v: string | number): number | null {
  if (typeof v === "number") return v;
  const m = v.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function emptyStat(): PlatformStat {
  return { gmv: 0, refund: 0, net: 0, refundRate: 0, sessions: 0 };
}

function finalize(s: PlatformStat): PlatformStat {
  s.net = round2(s.gmv - s.refund);
  s.refundRate = s.gmv > 0 ? round2((s.refund / s.gmv) * 100) : 0;
  return s;
}

const SLOT_KEYS: Slot[] = ["morning", "afternoon", "night"];

/** 由某员工薪资行 + 其名下明细项计算月报统计。纯函数。 */
export function computeStats(
  salaryRows: SalaryRow[],
  items: ItemLike[],
  month?: string,
): Stats {
  const done = items.filter((it) => it.consensus);
  const douyin = emptyStat();
  const xhs = emptyStat();
  const slotStat: Record<Slot, PlatformStat> = {
    morning: emptyStat(),
    afternoon: emptyStat(),
    night: emptyStat(),
  };
  const metrics: Record<Platform, Record<string, { sum: number; count: number }>> = {
    douyin: {},
    xiaohongshu: {},
  };

  for (const it of done) {
    const v = it.consensus!.value;
    const target = v.platform === "douyin" ? douyin : xhs;
    target.gmv += v.gmv;
    target.refund += v.refund;
    target.sessions += 1;

    // 时段归属按开播时间
    const slot = classifySlot(v.start_time);
    slotStat[slot].gmv += v.gmv;
    slotStat[slot].refund += v.refund;
    slotStat[slot].sessions += 1;

    for (const [k, val] of Object.entries(v.metrics)) {
      const n = parseNumber(val);
      if (n == null) continue;
      const bin = metrics[v.platform][k] ?? { sum: 0, count: 0 };
      bin.sum += n;
      bin.count += 1;
      metrics[v.platform][k] = bin;
    }
  }

  finalize(douyin);
  finalize(xhs);
  for (const k of SLOT_KEYS) finalize(slotStat[k]);

  const total: PlatformStat = {
    gmv: round2(douyin.gmv + xhs.gmv),
    refund: round2(douyin.refund + xhs.refund),
    net: 0,
    refundRate: 0,
    sessions: douyin.sessions + xhs.sessions,
  };
  total.net = round2(total.gmv - total.refund);
  total.refundRate = total.gmv > 0 ? round2((total.refund / total.gmv) * 100) : 0;

  const workedDates = new Set(done.map((it) => it.consensus!.value.date));
  const workedDays = workedDates.size;
  const avgDailyNet = workedDays > 0 ? round2(total.net / workedDays) : 0;

  const daily = salaryRows.map((r) => ({
    date: r.date,
    douyinNet: round2(r.douyinGmv - r.douyinRefund),
    xhsNet: round2(r.xhsGmv - r.xhsRefund),
    net: r.netGmv,
  }));

  const topSessions = done
    .map((it) => ({
      platform: it.consensus!.value.platform,
      date: it.consensus!.value.date,
      gmv: it.consensus!.value.gmv,
      refund: it.consensus!.value.refund,
    }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  const metricsAvg: Record<Platform, Record<string, { avg: number; count: number }>> = {
    douyin: {},
    xiaohongshu: {},
  };
  for (const p of ["douyin", "xiaohongshu"] as Platform[]) {
    for (const [k, bin] of Object.entries(metrics[p])) {
      metricsAvg[p][k] = { avg: round2(bin.sum / bin.count), count: bin.count };
    }
  }

  return {
    month,
    days: workedDays,
    sessions: done.length,
    finance: { douyin, xhs, total, avgDailyNet },
    slots: slotStat,
    daily,
    topSessions,
    metrics: metricsAvg,
  };
}
