import type { EmpDayRow } from "./schedule";
import type { Confidence, Slot } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SalaryRow = {
  date: string;
  hasData: boolean;
  douyinGmv: number;
  douyinRefund: number;
  xhsGmv: number;
  xhsRefund: number;
  netGmv: number; // (抖音GMV-退款)+(小红书GMV-退款)
  baseSalary: number | null; // null = 当日无直播
  commission: number; // 净GMV × 提成比例
  dailyPay: number | null; // 底薪 + 提成；无直播日为 null
  slots: Slot[];
  confidence: Confidence;
};

export type SalaryTotals = {
  douyinGmv: number;
  douyinRefund: number;
  xhsGmv: number;
  xhsRefund: number;
  netGmv: number;
  baseSalary: number;
  commission: number;
  dailyPay: number;
};

export type SalaryResult = {
  rows: SalaryRow[];
  totals: SalaryTotals;
};

/** 由某员工日表 + 提成比例(%) 计算其薪资。纯函数。 */
export function computeSalary(
  dayTable: EmpDayRow[],
  commissionRatePct: number,
): SalaryResult {
  const rate = commissionRatePct / 100;
  const rows: SalaryRow[] = dayTable.map((r) => {
    const dg = r.douyin?.gmv ?? 0;
    const dr = r.douyin?.refund ?? 0;
    const xg = r.xiaohongshu?.gmv ?? 0;
    const xr = r.xiaohongshu?.refund ?? 0;
    const netGmv = round2(dg - dr + xg - xr);
    const baseSalary = r.hasData ? r.baseSalary : null;
    const commission = round2(netGmv * rate);
    const dailyPay = baseSalary == null ? null : round2(baseSalary + commission);
    return {
      date: r.date,
      hasData: r.hasData,
      douyinGmv: dg,
      douyinRefund: dr,
      xhsGmv: xg,
      xhsRefund: xr,
      netGmv,
      baseSalary,
      commission,
      dailyPay,
      slots: r.slots,
      confidence: r.confidence,
    };
  });

  const sum = (sel: (r: SalaryRow) => number) =>
    round2(rows.reduce((s, r) => s + sel(r), 0));
  const sumNullable = (sel: (r: SalaryRow) => number | null) =>
    round2(rows.reduce((s, r) => s + (sel(r) ?? 0), 0));

  const totals: SalaryTotals = {
    douyinGmv: sum((r) => r.douyinGmv),
    douyinRefund: sum((r) => r.douyinRefund),
    xhsGmv: sum((r) => r.xhsGmv),
    xhsRefund: sum((r) => r.xhsRefund),
    netGmv: sum((r) => r.netGmv),
    baseSalary: sumNullable((r) => r.baseSalary),
    commission: sum((r) => r.commission),
    dailyPay: sumNullable((r) => r.dailyPay),
  };

  return { rows, totals };
}
