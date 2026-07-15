import ExcelJS from "exceljs";
import { downloadBlob } from "../lib/download";
import type { EmpDayRow } from "../pipeline/schedule";
import type { SalaryRow, SalaryTotals } from "../pipeline/salary";
import type { ValidationIssue } from "../pipeline/validate";
import type { ConsensusResult } from "../pipeline/consensus";
import type { Slot } from "../pipeline/types";

type DetailItem = { name: string; consensus: ConsensusResult | null };

const SLOT_LABEL: Record<Slot, string> = { morning: "早班", afternoon: "下午班", night: "晚班" };
const slotsText = (slots: Slot[]) => (slots.length ? slots.map((s) => SLOT_LABEL[s]).join("/") : "");
const confLabel = (c: string) => (c === "high" ? "高" : c === "medium" ? "中" : "需人工");

const C = {
  header: "FF1E5CB3", // 表头深蓝
  headerFont: "FFFFFFFF", // 白字
  bandGray: "FFF0F0F0", // 隔行浅灰
  bandLavender: "FFE6E6FA", // 隔行淡紫
  total: "FFD9D9F0", // 合计行浅蓝灰
  totalFont: "FF000000", // 黑字
  border: "FF000000", // 黑边框
};

function thin(color = C.border) {
  return { style: "thin" as const, color: { argb: color } };
}
function borderAll() {
  return { top: thin(), left: thin(), bottom: thin(), right: thin() };
}
function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

type SheetOpts = { widths?: number[]; totalsRow?: (string | number)[]; moneyCols?: number[] };

function fillSheet(
  ws: ExcelJS.Worksheet,
  columns: string[],
  rows: (string | number)[][],
  opts: SheetOpts = {},
) {
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getRow(1).height = 20;
  const hr = ws.addRow(columns);
  hr.height = 20;
  hr.eachCell((cell) => {
    cell.fill = solidFill(C.header);
    cell.font = { bold: true, color: { argb: C.headerFont }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = borderAll();
  });

  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    const bandFill = i % 2 === 0 ? C.bandGray : C.bandLavender;
    row.eachCell((cell, colNumber) => {
      cell.border = borderAll();
      cell.fill = solidFill(bandFill);
      const isNum = typeof cell.value === "number";
      if (isNum && opts.moneyCols?.includes(colNumber)) cell.numFmt = "#,##0.00";
      cell.alignment = { vertical: "middle", horizontal: isNum ? "right" : "left" };
    });
  });

  if (opts.totalsRow) {
    const tr = ws.addRow(opts.totalsRow);
    tr.eachCell((cell, colNumber) => {
      cell.fill = solidFill(C.total);
      cell.font = { bold: true, color: { argb: C.totalFont } };
      cell.border = borderAll();
      if (typeof cell.value === "number" && opts.moneyCols?.includes(colNumber))
        cell.numFmt = "#,##0.00";
      cell.alignment = { vertical: "middle", horizontal: typeof cell.value === "number" ? "right" : "left" };
    });
  }

  columns.forEach((_, i) => {
    ws.getColumn(i + 1).width = opts.widths?.[i] ?? 12;
  });
}

/** 导出单个员工的带样式 Excel（多 Sheet）。 */
export async function exportExcel(opts: {
  employeeName: string;
  month: string;
  commissionRatePct: number;
  salaryRows: SalaryRow[];
  salaryTotals: SalaryTotals | null;
  dayTable: EmpDayRow[];
  items: DetailItem[];
  issues: ValidationIssue[];
}) {
  const { employeeName, month, commissionRatePct, salaryRows, salaryTotals, dayTable, items, issues } =
    opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "直播间工资结算";
  wb.created = new Date();

  // Sheet 1: 薪资日表
  const ws1 = wb.addWorksheet("薪资日表");
  fillSheet(
    ws1,
    ["日期", "抖音GMV", "抖音退款", "小红书GMV", "小红书退款", "净GMV", "基本底薪", "时段", `提成${commissionRatePct}%`, "日工资", "置信"],
    salaryRows.map((r) =>
      r.hasData
        ? [r.date, r.douyinGmv, r.douyinRefund, r.xhsGmv, r.xhsRefund, r.netGmv, r.baseSalary ?? "", slotsText(r.slots), r.commission, r.dailyPay ?? "", confLabel(r.confidence)]
        : [r.date, "", "", "", "", "", "", "", "", "", ""],
    ),
    {
      widths: [12, 11, 11, 11, 11, 11, 11, 12, 10, 11, 8],
      moneyCols: [2, 3, 4, 5, 6, 7, 9, 10],
      totalsRow: salaryTotals
        ? ["合计", salaryTotals.douyinGmv, salaryTotals.douyinRefund, salaryTotals.xhsGmv, salaryTotals.xhsRefund, salaryTotals.netGmv, salaryTotals.baseSalary, "", salaryTotals.commission, salaryTotals.dailyPay, ""]
        : undefined,
    },
  );
  if (salaryTotals) {
    const ws2 = wb.addWorksheet("薪资汇总");
    const sumRows: (string | number)[][] = [
      ["员工", employeeName || ""],
      ["月份", month || ""],
      ["提成比例", `${commissionRatePct}%`],
      ["总GMV", salaryTotals.douyinGmv + salaryTotals.xhsGmv],
      ["抖音GMV", salaryTotals.douyinGmv],
      ["小红书GMV", salaryTotals.xhsGmv],
      ["总退款", salaryTotals.douyinRefund + salaryTotals.xhsRefund],
      ["净GMV", salaryTotals.netGmv],
      ["总底薪", salaryTotals.baseSalary],
      ["总提成", salaryTotals.commission],
      ["应发工资", salaryTotals.dailyPay],
    ];
    fillSheet(ws2, ["项目", "数值"], sumRows, { widths: [16, 16], moneyCols: [2] });
    // 强调应发工资行
    const last = ws2.lastRow;
    if (last) {
      last.eachCell((cell) => {
        cell.fill = solidFill(C.total);
        cell.font = { bold: true, color: { argb: C.totalFont } };
      });
    }
  }

  // Sheet 3: 完整明细
  const ws3 = wb.addWorksheet("完整明细");
  fillSheet(
    ws3,
    ["文件", "平台", "日期", "开播", "时段", "GMV", "退款", "净额", "置信", "富指标"],
    items
      .filter((it) => it.consensus)
      .map((it) => {
        const v = it.consensus!.value;
        return [
          it.name,
          v.platform === "douyin" ? "抖音" : "小红书",
          v.date,
          v.start_time,
          slotsText([slotOf(v.start_time)]),
          v.gmv,
          v.refund,
          Math.round((v.gmv - v.refund) * 100) / 100,
          confLabel(it.consensus!.confidence),
          JSON.stringify(v.metrics),
        ];
      }),
    { widths: [34, 8, 12, 8, 10, 10, 10, 10, 8, 40], moneyCols: [6, 7, 8] },
  );

  // Sheet 4: 日表
  const ws4 = wb.addWorksheet("日表");
  fillSheet(
    ws4,
    ["日期", "抖音GMV", "抖音退款", "小红书GMV", "小红书退款", "时段", "底薪", "置信"],
    dayTable.map((r) =>
      r.hasData
        ? [r.date, r.douyin?.gmv ?? "", r.douyin?.refund ?? "", r.xiaohongshu?.gmv ?? "", r.xiaohongshu?.refund ?? "", slotsText(r.slots), r.baseSalary ?? "", confLabel(r.confidence)]
        : [r.date, "", "", "", "", "", "", ""],
    ),
    { widths: [12, 11, 11, 11, 11, 12, 10, 8], moneyCols: [2, 3, 4, 5, 7] },
  );
  const ws5 = wb.addWorksheet("校验问题");
  fillSheet(
    ws5,
    ["级别", "说明"],
    issues.map((i) => [i.severity, i.message]),
    { widths: [10, 60] },
  );

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    `工资结算_${employeeName || "员工"}_${month || "data"}.xlsx`,
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}

/** 开播时间 → 时段（与 classifySlot 一致，导出处独立实现避免循环依赖）。 */
function slotOf(time: string): Slot {
  const [h, m] = time.split(":").map(Number);
  const minutes = h * 60 + m;
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "night";
}
