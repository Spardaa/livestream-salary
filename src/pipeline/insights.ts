import type { Stats } from "./stats";
import type { SalaryRow } from "./salary";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 有直播的工作日（净额）。 */
export type DayFact = { date: string; net: number };

/** 按自然周（周一起算）聚合。 */
export type WeekBucket = {
  weekStart: string; // 周一 YYYY-MM-DD
  net: number;
  days: number; // 当周有直播天数
  wowPct: number | null; // 与上周净额环比 %
};

export type PlatformFact = {
  net: number;
  sessions: number;
  perSession: number; // 净额 / 场次
  refundRate: number; // %
};

export type Insights = {
  trend: {
    workedDays: DayFact[]; // 按日期升序
    weeks: WeekBucket[]; // 按周升序
    momentum: "up" | "flat" | "down"; // 月内后1/3 vs 前1/3
    peakDay: DayFact | null;
    troughDay: DayFact | null;
    longestUpStreak: number; // 连续日环比上升天数
    longestDownStreak: number;
  };
  platform: {
    douyin: PlatformFact;
    xhs: PlatformFact;
    leader: "douyin" | "xiaohongshu" | "tie"; // 按净额
    highRefundPlatform: "douyin" | "xiaohongshu" | null;
  };
  anomalies: {
    highRefundDays: { date: string; refundRate: number; refund: number; gmv: number }[];
    lowOutputDays: DayFact[]; // net < μ−σ
    highlightDays: DayFact[]; // net > μ+σ
  };
};

/** 周一归一：返回该日所属自然周的周一（YYYY-MM-DD）。 */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const offset = (dt.getDay() + 6) % 7; // 0 = 周一
  dt.setDate(dt.getDate() - offset);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** 样本标准差（n<2 时为 0）。 */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function platformFact(p: Stats["finance"]["douyin"]): PlatformFact {
  return {
    net: round2(p.net),
    sessions: p.sessions,
    perSession: p.sessions > 0 ? round2(p.net / p.sessions) : 0,
    refundRate: round2(p.refundRate),
  };
}

/**
 * 由某员工月度统计 + 薪资日表行，确定性计算分析师级洞察事实。
 * 纯函数：相同输入恒定输出，供月报 LLM 原样引用，杜绝数字臆测。
 */
export function computeInsights(
  stats: Stats,
  salaryRows: SalaryRow[],
  _month?: string,
): Insights {
  // ---- trend ----
  const workedDays: DayFact[] = salaryRows
    .filter((r) => r.hasData)
    .map((r) => ({ date: r.date, net: round2(r.netGmv) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekMap = new Map<string, WeekBucket>();
  for (const d of workedDays) {
    const ws = mondayOf(d.date);
    const cur = weekMap.get(ws) ?? { weekStart: ws, net: 0, days: 0, wowPct: null };
    cur.net = round2(cur.net + d.net);
    cur.days += 1;
    weekMap.set(ws, cur);
  }
  const weeks = [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1].net;
    weeks[i].wowPct = prev > 0 ? round2(((weeks[i].net - prev) / prev) * 100) : null;
  }

  // 动量：后 1/3 vs 前 1/3
  let momentum: Insights["trend"]["momentum"] = "flat";
  const n = workedDays.length;
  if (n >= 3) {
    const third = Math.max(1, Math.floor(n / 3));
    const first = workedDays.slice(0, third);
    const last = workedDays.slice(n - third);
    const sumFirst = round2(first.reduce((s, d) => s + d.net, 0));
    const sumLast = round2(last.reduce((s, d) => s + d.net, 0));
    if (sumFirst > 0) {
      const ratio = sumLast / sumFirst;
      momentum = ratio >= 1.05 ? "up" : ratio <= 0.95 ? "down" : "flat";
    } else if (sumLast > 0) {
      momentum = "up";
    }
  }

  let peakDay: DayFact | null = null;
  let troughDay: DayFact | null = null;
  if (workedDays.length > 0) {
    peakDay = workedDays.reduce((a, b) => (b.net > a.net ? b : a));
    troughDay = workedDays.reduce((a, b) => (b.net < a.net ? b : a));
  }

  let longestUpStreak = 0;
  let longestDownStreak = 0;
  let curUp = 0;
  let curDown = 0;
  for (let i = 1; i < workedDays.length; i++) {
    if (workedDays[i].net > workedDays[i - 1].net) {
      curUp += 1;
      curDown = 0;
    } else if (workedDays[i].net < workedDays[i - 1].net) {
      curDown += 1;
      curUp = 0;
    } else {
      curUp = 0;
      curDown = 0;
    }
    longestUpStreak = Math.max(longestUpStreak, curUp);
    longestDownStreak = Math.max(longestDownStreak, curDown);
  }

  // ---- platform ----
  const douyin = platformFact(stats.finance.douyin);
  const xhs = platformFact(stats.finance.xhs);
  const leader: Insights["platform"]["leader"] =
    douyin.net === xhs.net ? "tie" : douyin.net > xhs.net ? "douyin" : "xiaohongshu";
  const highRefundPlatform: Insights["platform"]["highRefundPlatform"] = (() => {
    const dPass = douyin.sessions > 0 && douyin.refundRate > Math.max(10, 1.5 * xhs.refundRate);
    const xPass = xhs.sessions > 0 && xhs.refundRate > Math.max(10, 1.5 * douyin.refundRate);
    if (dPass && xPass) return douyin.refundRate >= xhs.refundRate ? "douyin" : "xiaohongshu";
    if (dPass) return "douyin";
    if (xPass) return "xiaohongshu";
    return null;
  })();

  // ---- anomalies（来自 salaryRows 每日值）----
  const dayRows = salaryRows
    .filter((r) => r.hasData)
    .map((r) => {
      const gmv = r.douyinGmv + r.xhsGmv;
      const refund = r.douyinRefund + r.xhsRefund;
      return {
        date: r.date,
        gmv,
        refund,
        refundRate: gmv > 0 ? round2((refund / gmv) * 100) : 0,
        net: round2(r.netGmv),
      };
    });

  const refundRates = dayRows.filter((d) => d.gmv > 0).map((d) => d.refundRate);
  const meanRefund = mean(refundRates);
  const highRefundDays = dayRows
    .filter((d) => d.gmv > 0 && d.refundRate > Math.max(10, 1.5 * meanRefund))
    .sort((a, b) => b.refundRate - a.refundRate)
    .slice(0, 5)
    .map((d) => ({
      date: d.date,
      refundRate: d.refundRate,
      refund: round2(d.refund),
      gmv: round2(d.gmv),
    }));

  const nets = dayRows.map((d) => d.net);
  const m = mean(nets);
  const sd = stdev(nets);
  const lowOutputDays = dayRows
    .filter((d) => sd > 0 && d.net < m - sd)
    .sort((a, b) => a.net - b.net)
    .slice(0, 5)
    .map((d) => ({ date: d.date, net: d.net }));
  const highlightDays = dayRows
    .filter((d) => sd > 0 && d.net > m + sd)
    .sort((a, b) => b.net - a.net)
    .slice(0, 5)
    .map((d) => ({ date: d.date, net: d.net }));

  return {
    trend: { workedDays, weeks, momentum, peakDay, troughDay, longestUpStreak, longestDownStreak },
    platform: { douyin, xhs, leader, highRefundPlatform },
    anomalies: { highRefundDays, lowOutputDays, highlightDays },
  };
}
