import { SettingsPanel } from "./components/SettingsPanel";
import { BatchRunner } from "./components/BatchRunner";
import { SalaryPanel } from "./components/SalaryPanel";
import { DetailTable } from "./components/DetailTable";
import { Dashboard } from "./components/Dashboard";
import { ReportExport } from "./components/ReportExport";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          直播间工资结算
          <span className="tag">完整流程 · 抽取→薪资→月报</span>
        </h1>
        <p className="sub">抖音 / 小红书 直播间截图 → 结构化数据 → 工资结算与月报</p>
      </header>

      <SettingsPanel />

      <main className="card">
        <h2>① 批量抽取</h2>
        <p className="hint">
          两种录入（互斥）：截图识图（每张三抽 + 多数表决 + 兜底校验）或 表格导入（解析抖音/小红书明细表，字段更全、无需 API Key、月报更专业）→ 合并成日表。
        </p>
        <BatchRunner />
      </main>

      <main className="card">
        <h2>② 薪资结算 + 三表验证</h2>
        <p className="hint">
          排班(多员工 + 早/下午/晚三时段 + 每人提成) → 每人薪资(底薪 + 净GMV×提成) → Layer3 三表比对 + flagged 升级重抽；存在熔断项时不可导出。
        </p>
        <SalaryPanel />
      </main>

      <main className="card">
        <h2>③ 完整明细（含富指标）</h2>
        <p className="hint">每场直播一行，含人均观播时长、新增粉丝、转化率等。</p>
        <DetailTable />
      </main>

      <main className="card">
        <h2>④ 月报 · 图表 · 导出</h2>
        <Dashboard />
        <ReportExport />
      </main>

      <footer className="foot">确定性流水线 · 三层重复验证 · 纯前端 PWA</footer>
    </div>
  );
}
