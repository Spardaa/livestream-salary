import { marked } from "marked";
import type { SalaryRow, SalaryTotals } from "../pipeline/salary";
import type { Stats } from "../pipeline/stats";
import type { Slot } from "../pipeline/types";

const SLOT_LABEL: Record<Slot, string> = { morning: "早班", afternoon: "下午班", night: "晚班" };
const slotsText = (s: Slot[]) => (s.length ? s.map((x) => SLOT_LABEL[x]).join("/") : "—");

/** Markdown → HTML 片段。 */
export function mdToHtml(md: string): string {
  return marked.parse(md ?? "", { async: false }) as string;
}

/** 薪资日表 HTML。 */
export function salaryTableHtml(rows: SalaryRow[], totals: SalaryTotals | null): string {
  const head =
    "<tr><th>日期</th><th>抖音GMV</th><th>抖音退款</th><th>小红书GMV</th><th>小红书退款</th><th>净GMV</th><th>底薪</th><th>时段</th><th>提成</th><th>日工资</th></tr>";
  const body = rows
    .map((r) => {
      if (!r.hasData) return `<tr class="empty"><td>${r.date}</td><td colspan="9"></td></tr>`;
      return `<tr>
        <td>${r.date}</td>
        <td>${r.douyinGmv}</td><td>${r.douyinRefund}</td>
        <td>${r.xhsGmv}</td><td>${r.xhsRefund}</td>
        <td>${r.netGmv}</td><td>${r.baseSalary ?? ""}</td>
        <td>${slotsText(r.slots)}</td><td>${r.commission}</td><td>${r.dailyPay ?? ""}</td>
      </tr>`;
    })
    .join("");
  const foot = totals
    ? `<tr class="total"><td>合计</td>
        <td>${totals.douyinGmv}</td><td>${totals.douyinRefund}</td>
        <td>${totals.xhsGmv}</td><td>${totals.xhsRefund}</td>
        <td>${totals.netGmv}</td><td>${totals.baseSalary}</td>
        <td></td><td>${totals.commission}</td><td>${totals.dailyPay}</td></tr>`
    : "";
  return `<table class="sal"><thead>${head}</thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ""}</table>`;
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", Arial, sans-serif; color: #0b1220; background: #f6f7fb; margin: 0; padding: 32px; }
.sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 36px 40px; border-radius: 10px; box-shadow: 0 2px 18px rgba(0,0,0,.06); }
h1 { font-size: 24px; margin: 0 0 4px; }
.sub { color: #64748b; font-size: 13px; margin: 0 0 18px; }
h2 { font-size: 17px; margin: 22px 0 8px; border-left: 4px solid #6366f1; padding-left: 8px; }
h3 { font-size: 15px; margin: 16px 0 6px; }
p, li { font-size: 13.5px; line-height: 1.7; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 8px 0 14px; }
th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: right; }
th:first-child, td:first-child { text-align: left; }
thead th { background: #0f172a; color: #fff; font-weight: 600; }
tbody tr:nth-child(even) { background: #f8fafc; }
tbody tr.empty { color: #cbd5e1; }
tfoot tr.total { background: #1f3a5f; color: #fff; font-weight: 700; }
strong { color: #0b1220; }
@media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; max-width: none; border-radius: 0; padding: 0; } }
`;

/** 组装完整的（带样式）报告 HTML 文档，供 Word/PDF 共用。 */
export function buildReportHtml(opts: {
  employeeName: string;
  stats: Stats;
  bodyHtml: string;
  salaryRows: SalaryRow[];
  salaryTotals: SalaryTotals | null;
}): string {
  const { employeeName, stats, bodyHtml, salaryRows, salaryTotals } = opts;
  const kpi = `
    <div class="sub">
      员工：<b>${employeeName || "—"}</b>　·　月份：${stats.month || "—"}　·
      总GMV ¥${stats.finance.total.gmv}　·　净营收 ¥${stats.finance.total.net}　·
      退款率 ${stats.finance.total.refundRate}%　·　场次 ${stats.sessions}
    </div>`;
  return `<!doctype html><html lang="zh-CN" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/>
<title>${employeeName || "员工"} ${stats.month || ""} 月报</title>
<style>${STYLE}</style></head>
<body><div class="sheet">
<h1>${employeeName || "员工"} ${stats.month || ""} 直播间月报</h1>
${kpi}
${bodyHtml}
<h2>附：薪资日表</h2>
${salaryTableHtml(salaryRows, salaryTotals)}
</div></body></html>`;
}
