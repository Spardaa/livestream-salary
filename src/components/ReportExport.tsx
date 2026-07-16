import { useStore } from "../store/runStore";
import { exportExcel } from "../export/excel";
import { exportPdf } from "../export/pdf";
import { renderChartsSvg, chartsBlockHtml } from "../export/charts";

export function ReportExport() {
  const employees = useStore((s) => s.employees);
  const activeEmployee = useStore((s) => s.activeEmployee);
  const setActiveEmployee = useStore((s) => s.setActiveEmployee);
  const reportRunning = useStore((s) => s.reportRunning);
  const reportError = useStore((s) => s.reportError);
  const runReport = useStore((s) => s.runReport);
  const issues = useStore((s) => s.issues);
  const month = useStore((s) => s.month);
  const verification = useStore((s) => s.verification);

  const unresolved = verification?.unresolved ?? [];
  const finalized = employees.length > 0 && unresolved.length === 0;
  const active = employees.find((e) => e.name === activeEmployee) ?? employees[0];

  function reportOpts(name: string) {
    const e = employees.find((x) => x.name === name)!;
    return {
      employeeName: e.name,
      stats: e.stats,
      reportMd: e.reportMarkdown ?? "",
      chartsHtml: chartsBlockHtml(renderChartsSvg(e.stats, e.insights)),
      salaryRows: e.salaryRows,
      salaryTotals: e.salaryTotals,
    };
  }
  function exportOneExcel(name: string) {
    const e = employees.find((x) => x.name === name);
    if (!e) return;
    exportExcel({
      employeeName: e.name,
      month,
      commissionRatePct: e.commissionRatePct,
      salaryRows: e.salaryRows,
      salaryTotals: e.salaryTotals,
      dayTable: e.dayTable,
      items: e.items,
      issues,
    });
  }
  function exportAll() {
    for (const e of employees) {
      exportOneExcel(e.name);
    }
  }

  if (employees.length === 0) return null;

  return (
    <div className="report-export">
      <div className="actions">
        <button className="primary" onClick={runReport} disabled={reportRunning || !finalized}>
          {reportRunning ? "生成月报中…" : `✎ 生成全员月报（${employees.length} 人）`}
        </button>
        {!finalized && (
          <span className="err-text">🔴 存在熔断项，薪资未定稿，暂不可导出</span>
        )}
      </div>
      {reportError && <div className="error-box">❌ 月报生成失败：{reportError}</div>}

      {employees.length > 1 && (
        <div className="emp-tabs">
          {employees.map((e) => (
            <button
              key={e.name}
              className={`emp-tab ${e.name === activeEmployee ? "emp-tab-active" : ""}`}
              onClick={() => setActiveEmployee(e.name)}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="export-bar" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div className="muted">{active.name}：应发 ¥{active.salaryTotals.dailyPay}　提成 {active.commissionRatePct}%</div>
          <div className="actions">
            <button className="primary" onClick={() => exportOneExcel(active.name)} disabled={!finalized}>
              ⬇ Excel
            </button>
            <button className="primary" onClick={() => exportPdf(reportOpts(active.name))} disabled={!active.reportMarkdown}>
              ⬇ PDF（打印另存）
            </button>
          </div>
          {active.reportMarkdown ? (
            <details className="md-wrap">
              <summary>{active.name} 月报预览</summary>
              <pre className="md-preview">{active.reportMarkdown}</pre>
            </details>
          ) : (
            <div className="muted">该员工尚未生成月报，点上方「生成全员月报」。</div>
          )}
        </div>
      )}

      <div className="actions" style={{ marginTop: 12 }}>
        <button className="primary" onClick={exportAll} disabled={!finalized}>
          ⬇ 一键导出全员（每人一个 Excel）
        </button>
        <span className="muted">PDF 需逐人点（每次会打开打印窗口）。</span>
      </div>
    </div>
  );
}
