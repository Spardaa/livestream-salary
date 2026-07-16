import { useStore } from "../store/runStore";
import { SalaryTable } from "./SalaryTable";
import type { Slot } from "../pipeline/types";

const SLOT_LABEL: Record<Slot, string> = {
  morning: "早班",
  afternoon: "下午班",
  night: "晚班",
};

export function SalaryPanel() {
  const scheduleText = useStore((s) => s.scheduleText);
  const setScheduleText = useStore((s) => s.setScheduleText);
  const salaryRunning = useStore((s) => s.salaryRunning);
  const runSalary = useStore((s) => s.runSalary);
  const items = useStore((s) => s.items);
  const employees = useStore((s) => s.employees);
  const activeEmployee = useStore((s) => s.activeEmployee);
  const setActiveEmployee = useStore((s) => s.setActiveEmployee);
  const scheduleError = useStore((s) => s.scheduleError);
  const unattributed = useStore((s) => s.unattributed);
  const verification = useStore((s) => s.verification);
  const apiKey = useStore((s) => s.apiKey);
  const month = useStore((s) => s.month);
  const rateLimited = useStore((s) => s.rateLimited);
  const source = useStore((s) => s.source);
  const tableItems = useStore((s) => s.tableItems);

  // 表格模式下 image items 为空，需按 source 判断是否有可结算数据
  const hasItems = source === "table" ? tableItems.length > 0 : items.some((it) => it.consensus);
  const unresolved = verification?.unresolved ?? [];
  const active = employees.find((e) => e.name === activeEmployee) ?? employees[0];

  return (
    <div className="salary-panel">
      <label className="field">
        <span>排班 + 底薪 + 提成（自然语言，每人一行，GLM 解析）</span>
        <textarea
          className="rule-input"
          rows={4}
          value={scheduleText}
          onChange={(e) => setScheduleText(e.target.value)}
          placeholder={
            "员工A：提成2%，6.1-6.7 早班100，6.8-6.14 晚班140，6.15-6.21 下午班140\n" +
            "员工B：提成3%，6.1-6.7 晚班140，6.8-6.14 早班100"
          }
        />
        <small>
          时段用 早班(12点前)/下午班(12-18)/晚班(18后)。每场直播按开播时间定时段，再按(日期+时段)归属到排班匹配的员工。
        </small>
      </label>

      <div className="actions">
        <button
          className="primary"
          onClick={runSalary}
          disabled={salaryRunning || !hasItems || !apiKey || !month}
        >
          {salaryRunning ? "计算中…" : "▶ 解析排班 + 计算每人薪资"}
        </button>
        {!apiKey && <span className="err-text">请先填 API Key</span>}
        {!month && apiKey && <span className="err-text">请先选月份</span>}
        {!hasItems && apiKey && month && (
          <span className="muted">{source === "table" ? "先在上方导入表格" : "先完成上方抽取"}</span>
        )}
      </div>

      {salaryRunning && (
        <div className="muted">
          {source === "table" ? "解析排班 → 归属 → 计算每人薪资 → Layer3 比对…" : "升级 flagged 图 → 解析排班 → 归属 → 计算每人薪资 → Layer3 比对…"}
        </div>
      )}

      {scheduleError && <div className="error-box">❌ 排班解析失败：{scheduleError}</div>}

      {rateLimited > 0 && (
        <div className="warn-box">
          ⚠ 本次升级重抽遇到 {rateLimited} 次 429 限速（已自动退避重试）。频繁出现可在「设置」降低并发数。
        </div>
      )}

      {unattributed.length > 0 && (
        <div className="warn-box">
          ⚠ {unattributed.length} 场直播未匹配到任何员工的排班（日期+时段无人值班）：
          {unattributed.map((u) => `${u.date.slice(5)} ${SLOT_LABEL[u.slot]}`).join("、")}。请补全排班或检查时段。
        </div>
      )}

      {verification && (
        <div className="verify-summary">
          {verification.status === "consistent" ? (
            <span className="chip chip-err-ok">✅ Layer3 三表完全一致</span>
          ) : (
            <span className="chip chip-warn">⚠ 三表有差异（已采纳多数值，请看校验）</span>
          )}
          {unresolved.length > 0 && (
            <span className="chip chip-err">🔴 {unresolved.length} 张图熔断，需人工核对，不可导出</span>
          )}
          {employees.length > 0 && unresolved.length === 0 && (
            <span className="chip chip-err-ok">✅ {employees.length} 人薪资已定稿，可导出</span>
          )}
        </div>
      )}

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
        <>
          <div className="muted" style={{ marginTop: 8 }}>
            当前：{active.name}　提成 {active.commissionRatePct}%　应发 ¥{active.salaryTotals.dailyPay}
          </div>
          <SalaryTable rows={active.salaryRows} totals={active.salaryTotals} />
        </>
      )}
    </div>
  );
}
