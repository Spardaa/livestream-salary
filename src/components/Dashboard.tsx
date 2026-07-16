import ReactECharts from "echarts-for-react";
import { useStore } from "../store/runStore";

const BASE = "#c7d2e4";
const DOUYIN = "#3b82f6";
const XHS = "#ff4d6d";
const TOTAL = "#22d3ee";

function commonGrid() {
  return {
    textStyle: { color: BASE, fontFamily: "inherit" },
    grid: { left: 48, right: 24, top: 40, bottom: 40 },
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: BASE }, top: 6 },
  };
}

export function Dashboard() {
  const employees = useStore((s) => s.employees);
  const activeEmployee = useStore((s) => s.activeEmployee);
  const month = useStore((s) => s.month);

  const active = employees.find((e) => e.name === activeEmployee) ?? employees[0];
  if (!active) return null;
  const stats = active.stats;
  const dates = stats.daily.map((d) => d.date.slice(5));

  const trendOpt = {
    ...commonGrid(),
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: dates, axisLabel: { color: BASE } },
    yAxis: { type: "value", axisLabel: { color: BASE }, splitLine: { lineStyle: { color: "#1f2b45" } } },
    series: [
      { name: "抖音净", type: "line", smooth: true, data: stats.daily.map((d) => d.douyinNet), itemStyle: { color: DOUYIN } },
      { name: "小红书净", type: "line", smooth: true, data: stats.daily.map((d) => d.xhsNet), itemStyle: { color: XHS } },
      { name: "合计净", type: "line", smooth: true, data: stats.daily.map((d) => d.net), itemStyle: { color: TOTAL } },
    ],
  };

  const pieOpt = {
    ...commonGrid(),
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["38%", "68%"],
        center: ["50%", "55%"],
        label: { color: BASE },
        data: [
          { name: "抖音 GMV", value: stats.finance.douyin.gmv, itemStyle: { color: DOUYIN } },
          { name: "小红书 GMV", value: stats.finance.xhs.gmv, itemStyle: { color: XHS } },
        ],
      },
    ],
  };

  const slotOpt = {
    ...commonGrid(),
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: ["早班", "下午班", "晚班"], axisLabel: { color: BASE } },
    yAxis: { type: "value", axisLabel: { color: BASE }, splitLine: { lineStyle: { color: "#1f2b45" } } },
    series: [
      { name: "GMV", type: "bar", data: [stats.slots.morning.gmv, stats.slots.afternoon.gmv, stats.slots.night.gmv], itemStyle: { color: TOTAL } },
      { name: "退款", type: "bar", data: [stats.slots.morning.refund, stats.slots.afternoon.refund, stats.slots.night.refund], itemStyle: { color: "#f87171" } },
    ],
  };

  const refundOpt = {
    ...commonGrid(),
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: ["抖音", "小红书", "合计"], axisLabel: { color: BASE } },
    yAxis: { type: "value", axisLabel: { color: BASE, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#1f2b45" } } },
    series: [
      {
        name: "退款率",
        type: "bar",
        data: [stats.finance.douyin.refundRate, stats.finance.xhs.refundRate, stats.finance.total.refundRate],
        itemStyle: { color: "#fbbf24" },
        label: { show: true, position: "top", color: BASE, formatter: "{c}%" },
      },
    ],
  };

  const rich = stats.rich;

  const richKpis = rich
    ? [
        <div className="kpi" key="online"><b>场均在线</b><span>{rich.avgOnline}</span></div>,
        <div className="kpi" key="conv"><b>场均转化</b><span>{rich.avgConversionRate}%</span></div>,
        <div className="kpi" key="fans"><b>净增粉</b><span>{rich.netFollowers}</span></div>,
      ]
    : [];

  const funnelOpt = rich && rich.funnel.steps.length > 0
    ? {
        ...commonGrid(),
        tooltip: { trigger: "axis" },
        xAxis: { type: "value", axisLabel: { color: BASE }, splitLine: { lineStyle: { color: "#1f2b45" } } },
        yAxis: {
          type: "category",
          data: rich.funnel.steps.map((s) => (s.fromPrev != null ? `${s.name} (${s.fromPrev}%)` : s.name)),
          axisLabel: { color: BASE, fontSize: 11 },
        },
        series: [
          { name: "场均人数", type: "bar", data: rich.funnel.steps.map((s) => s.value), itemStyle: { color: "#a78bfa" }, label: { show: true, position: "right", color: BASE } },
        ],
      }
    : null;

  const viewersOpt = rich && rich.daily.length > 0
    ? {
        ...commonGrid(),
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: rich.daily.map((d) => d.date.slice(5)), axisLabel: { color: BASE } },
        yAxis: { type: "value", axisLabel: { color: BASE }, splitLine: { lineStyle: { color: "#1f2b45" } } },
        series: [
          { name: "观看人数", type: "bar", data: rich.daily.map((d) => d.viewers), itemStyle: { color: "#a78bfa" } },
          { name: "平均在线", type: "line", smooth: true, data: rich.daily.map((d) => d.avgOnline), itemStyle: { color: "#34d399" } },
        ],
      }
    : null;

  return (
    <div className="dashboard">
      <h3 style={{ marginBottom: 8 }}>{active.name} · 看板</h3>
      <div className="kpis">
        <div className="kpi"><b>总GMV</b><span>¥{stats.finance.total.gmv}</span></div>
        <div className="kpi"><b>净营收</b><span>¥{stats.finance.total.net}</span></div>
        <div className="kpi"><b>退款率</b><span>{stats.finance.total.refundRate}%</span></div>
        <div className="kpi"><b>日均净</b><span>¥{stats.finance.avgDailyNet}</span></div>
        <div className="kpi"><b>场次</b><span>{stats.sessions}</span></div>
        {richKpis}
      </div>
      <div className="charts">
        <div className="chart"><h4>每日净 GMV 趋势</h4><ReactECharts option={trendOpt} style={{ height: 240 }} /></div>
        <div className="chart"><h4>平台 GMV 占比</h4><ReactECharts option={pieOpt} style={{ height: 240 }} /></div>
        <div className="chart"><h4>早班 / 下午班 / 晚班</h4><ReactECharts option={slotOpt} style={{ height: 240 }} /></div>
        <div className="chart"><h4>退款率</h4><ReactECharts option={refundOpt} style={{ height: 240 }} /></div>
        {funnelOpt && <div className="chart"><h4>转化漏斗（场均人数）</h4><ReactECharts option={funnelOpt} style={{ height: 240 }} /></div>}
        {viewersOpt && <div className="chart"><h4>每日观看人数 / 平均在线</h4><ReactECharts option={viewersOpt} style={{ height: 240 }} /></div>}
      </div>
      <p className="muted" style={{ marginTop: 6 }}>月份 {month || "—"} · 共 {employees.length} 人，可在「②」切换查看其他人。</p>
    </div>
  );
}
