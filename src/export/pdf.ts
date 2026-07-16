import { buildReportHtml, mdToHtml } from "./render";
import type { SalaryRow, SalaryTotals } from "../pipeline/salary";
import type { Stats } from "../pipeline/stats";

type ReportOpts = {
  employeeName: string;
  stats: Stats;
  reportMd: string;
  chartsHtml?: string;
  salaryRows: SalaryRow[];
  salaryTotals: SalaryTotals | null;
};

/**
 * 导出 PDF：在新窗口打开带样式的报告，调用浏览器打印；
 * 用户在打印对话框选「另存为 PDF」。浏览器原生渲染，中文完美。
 */
export function exportPdf(opts: ReportOpts) {
  const html = buildReportHtml({
    employeeName: opts.employeeName,
    stats: opts.stats,
    bodyHtml: mdToHtml(opts.reportMd),
    chartsHtml: opts.chartsHtml,
    salaryRows: opts.salaryRows,
    salaryTotals: opts.salaryTotals,
  });
  const w = window.open("", "_blank");
  if (!w) {
    alert("请允许本站弹出窗口，以便导出 PDF。");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const doPrint = () => {
    w.focus();
    w.print();
  };
  w.onload = doPrint;
  // 兜底：某些浏览器 onload 不触发
  setTimeout(doPrint, 500);
}
