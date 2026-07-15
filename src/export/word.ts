import { downloadBlob } from "../lib/download";
import { buildReportHtml, mdToHtml } from "./render";
import type { SalaryRow, SalaryTotals } from "../pipeline/salary";
import type { Stats } from "../pipeline/stats";

type ReportOpts = {
  employeeName: string;
  stats: Stats;
  reportMd: string;
  salaryRows: SalaryRow[];
  salaryTotals: SalaryTotals | null;
};

/** 导出单个员工月报为 Word（.doc，HTML 格式，中文无乱码）。 */
export function exportWord(opts: ReportOpts) {
  const html = buildReportHtml({
    employeeName: opts.employeeName,
    stats: opts.stats,
    bodyHtml: mdToHtml(opts.reportMd),
    salaryRows: opts.salaryRows,
    salaryTotals: opts.salaryTotals,
  });
  downloadBlob(
    `月报_${opts.employeeName || "员工"}_${opts.stats.month || "data"}.doc`,
    new Blob([html], { type: "application/msword" }),
  );
}
