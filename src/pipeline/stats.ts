import type { SalaryRow } from "./salary";
import type { Extraction } from "./schema";
import type { Confidence, Platform, RichMetrics, RichSession, RichSlotStat, RichStats, Slot } from "./types";
import { classifySlot } from "./aggregate";

type ItemLike = {
  consensus: { value: Extraction; confidence: Confidence } | null;
  rich?: RichMetrics;
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
  rich?: RichStats; // 仅表格导入（存在 RichMetrics）时计算
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
    rich: computeRichStats(done),
  };
}

const avgOf = (sum: number, count: number): number => (count > 0 ? round2(sum / count) : 0);

/** 由带 RichMetrics 的明细计算富统计；无任何 rich 明细时返回 undefined（image 模式不受影响）。 */
function computeRichStats(items: ItemLike[]): RichStats | undefined {
  const richItems = items.filter((it): it is ItemLike & { consensus: { value: Extraction }; rich: RichMetrics } =>
    Boolean(it.consensus && it.rich),
  );
  if (richItems.length === 0) return undefined;

  const n = richItems.length;
  const acc = {
    sumViewers: 0, cntViewers: 0,
    sumReach: 0, cntReach: 0,
    sumAvgOnline: 0, cntAvgOnline: 0,
    peakOnline: 0,
    sumWatch: 0, cntWatch: 0,
    sumDuration: 0, cntDuration: 0,
    sumFollowers: 0, cntFollowers: 0,
    sumUnfollows: 0, cntUnfollows: 0,
    sumProductClickUV: 0, cntProductClickUV: 0,
    sumBuyers: 0, cntBuyers: 0,
    sumClickRate: 0, cntClickRate: 0,
    sumConversion: 0, cntConversion: 0,
    sumPayRate: 0, cntPayRate: 0,
    sumRefundRate: 0, cntRefundRate: 0,
    sumRefundPeople: 0, cntRefundPeople: 0,
    sumAdSpend: 0, cntAdSpend: 0,
    sumGmv: 0,
  };
  const slots: Record<Slot, { sessions: number; gmv: number; sumAvgOnline: number; cntAvgOnline: number; sumViewers: number; cntViewers: number; sumConv: number; cntConv: number }> = {
    morning: { sessions: 0, gmv: 0, sumAvgOnline: 0, cntAvgOnline: 0, sumViewers: 0, cntViewers: 0, sumConv: 0, cntConv: 0 },
    afternoon: { sessions: 0, gmv: 0, sumAvgOnline: 0, cntAvgOnline: 0, sumViewers: 0, cntViewers: 0, sumConv: 0, cntConv: 0 },
    night: { sessions: 0, gmv: 0, sumAvgOnline: 0, cntAvgOnline: 0, sumViewers: 0, cntViewers: 0, sumConv: 0, cntConv: 0 },
  };
  const dayMap = new Map<string, { sumViewers: number; sumAvgOnline: number; cntAvgOnline: number; sumFollowers: number; cntFollowers: number; gmv: number }>();
  const sessionsList: RichSession[] = [];

  const bump = (val: number | undefined, sumKey: keyof typeof acc, cntKey: keyof typeof acc) => {
    if (val == null) return;
    (acc[sumKey] as number) += val;
    (acc[cntKey] as number) += 1;
  };

  for (const it of richItems) {
    const v = it.consensus.value;
    const r = it.rich;
    acc.sumGmv += v.gmv;
    bump(r.viewers, "sumViewers", "cntViewers");
    bump(r.reach, "sumReach", "cntReach");
    bump(r.avgOnline, "sumAvgOnline", "cntAvgOnline");
    if (r.peakOnline != null) acc.peakOnline = Math.max(acc.peakOnline, r.peakOnline);
    bump(r.avgWatchMinutes, "sumWatch", "cntWatch");
    bump(r.durationMinutes, "sumDuration", "cntDuration");
    bump(r.newFollowers, "sumFollowers", "cntFollowers");
    bump(r.unfollows, "sumUnfollows", "cntUnfollows");
    bump(r.productClickUV, "sumProductClickUV", "cntProductClickUV");
    bump(r.buyers ?? r.payers, "sumBuyers", "cntBuyers");
    bump(r.clickRate, "sumClickRate", "cntClickRate");
    bump(r.conversionRate, "sumConversion", "cntConversion");
    bump(r.payRate, "sumPayRate", "cntPayRate");
    bump(r.refundRate, "sumRefundRate", "cntRefundRate");
    bump(r.refundPeople, "sumRefundPeople", "cntRefundPeople");
    bump(r.adSpend, "sumAdSpend", "cntAdSpend");

    const slot = classifySlot(v.start_time);
    const sb = slots[slot];
    sb.sessions += 1;
    sb.gmv += v.gmv;
    if (r.avgOnline != null) { sb.sumAvgOnline += r.avgOnline; sb.cntAvgOnline += 1; }
    if (r.viewers != null) { sb.sumViewers += r.viewers; sb.cntViewers += 1; }
    if (r.conversionRate != null) { sb.sumConv += r.conversionRate; sb.cntConv += 1; }

    const d = dayMap.get(v.date) ?? { sumViewers: 0, sumAvgOnline: 0, cntAvgOnline: 0, sumFollowers: 0, cntFollowers: 0, gmv: 0 };
    if (r.viewers != null) d.sumViewers += r.viewers;
    if (r.avgOnline != null) { d.sumAvgOnline += r.avgOnline; d.cntAvgOnline += 1; }
    if (r.newFollowers != null) { d.sumFollowers += r.newFollowers; d.cntFollowers += 1; }
    d.gmv += v.gmv;
    dayMap.set(v.date, d);

    sessionsList.push({
      platform: v.platform,
      date: v.date,
      start_time: v.start_time,
      slot,
      gmv: v.gmv,
      refund: v.refund,
      conversionRate: r.conversionRate,
      avgOnline: r.avgOnline,
      viewers: r.viewers,
    });
  }

  const funnelRaw = [
    { name: "曝光人数", value: avgOf(acc.sumReach, acc.cntReach) },
    { name: "观看人数", value: avgOf(acc.sumViewers, acc.cntViewers) },
    { name: "商品点击人数", value: avgOf(acc.sumProductClickUV, acc.cntProductClickUV) },
    { name: "成交人数", value: avgOf(acc.sumBuyers, acc.cntBuyers) },
  ];
  const funnelSteps = funnelRaw.map((s, i) => ({
    name: s.name,
    value: s.value,
    fromPrev: i > 0 && funnelRaw[i - 1].value > 0 ? round2((s.value / funnelRaw[i - 1].value) * 100) : null,
  }));

  const totalNewFollowers = round2(acc.sumFollowers);
  const totalUnfollows = round2(acc.sumUnfollows);
  const totalAdSpend = round2(acc.sumAdSpend);

  const bySlot = (["morning", "afternoon", "night"] as Slot[]).reduce(
    (m, sk) => {
      const s = slots[sk];
      const out: RichSlotStat = {
        sessions: s.sessions,
        gmv: round2(s.gmv),
        avgOnline: avgOf(s.sumAvgOnline, s.cntAvgOnline),
        avgViewers: avgOf(s.sumViewers, s.cntViewers),
        avgConversionRate: avgOf(s.sumConv, s.cntConv),
      };
      m[sk] = out;
      return m;
    },
    {} as Record<Slot, RichSlotStat>,
  );

  const daily = [...dayMap.entries()]
    .map(([date, d]) => ({
      date,
      viewers: round2(d.sumViewers),
      avgOnline: avgOf(d.sumAvgOnline, d.cntAvgOnline),
      newFollowers: round2(d.sumFollowers),
      gmv: round2(d.gmv),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topSessions = [...sessionsList].sort((a, b) => b.gmv - a.gmv).slice(0, 5);
  const bottomSessions = [...sessionsList]
    .filter((s) => s.gmv > 0)
    .sort((a, b) => a.gmv - b.gmv)
    .slice(0, 3);

  return {
    sessions: n,
    avgOnline: avgOf(acc.sumAvgOnline, acc.cntAvgOnline),
    peakOnline: round2(acc.peakOnline),
    avgViewers: avgOf(acc.sumViewers, acc.cntViewers),
    totalReach: round2(acc.sumReach),
    avgWatchMinutes: avgOf(acc.sumWatch, acc.cntWatch),
    avgDurationMinutes: avgOf(acc.sumDuration, acc.cntDuration),
    totalNewFollowers,
    totalUnfollows,
    netFollowers: round2(totalNewFollowers - totalUnfollows),
    funnel: {
      reach: avgOf(acc.sumReach, acc.cntReach),
      viewers: avgOf(acc.sumViewers, acc.cntViewers),
      productClickUV: avgOf(acc.sumProductClickUV, acc.cntProductClickUV),
      buyers: avgOf(acc.sumBuyers, acc.cntBuyers),
      gmv: round2(acc.sumGmv),
      steps: funnelSteps,
    },
    avgClickRate: avgOf(acc.sumClickRate, acc.cntClickRate),
    avgConversionRate: avgOf(acc.sumConversion, acc.cntConversion),
    avgPayRate: avgOf(acc.sumPayRate, acc.cntPayRate),
    avgRefundRate: avgOf(acc.sumRefundRate, acc.cntRefundRate),
    totalRefundPeople: round2(acc.sumRefundPeople),
    totalAdSpend,
    roas: totalAdSpend > 0 ? round2(acc.sumGmv / totalAdSpend) : null,
    bySlot,
    daily,
    topSessions,
    bottomSessions,
  };
}
