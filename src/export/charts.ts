import * as echarts from "echarts";
import type { Stats } from "../pipeline/stats";
import type { Insights } from "../pipeline/insights";

// 浅色主题（报告为白底打印场景，区别于 Dashboard 的暗色看板）
const TXT = "#334155";
const SPLIT = "#e2e8f0";
const AXIS = "#94a3b8";
const DOUYIN = "#2563eb";
const XHS = "#e11d48";
const NET = "#6366f1";
const REFUND = "#f59e0b";

const W = 720;
const H = 260;

function base() {
  return {
    textStyle: { color: TXT, fontFamily: "inherit" },
    grid: { left: 52, right: 24, top: 36, bottom: 40 },
    legend: { textStyle: { color: TXT }, top: 4 },
  };
}

function xAxis(category: string[]) {
  return {
    type: "category" as const,
    data: category,
    axisLabel: { color: TXT, fontSize: 10 },
    axisLine: { lineStyle: { color: AXIS } },
    axisTick: { show: false },
  };
}

function yAxisPct(perc: boolean) {
  return {
    type: "value" as const,
    axisLabel: { color: TXT, formatter: perc ? "{value}%" : undefined },
    splitLine: { lineStyle: { color: SPLIT } },
  };
}

/** 用 ECharts SSR 头部渲染（无 DOM）成 SVG 字符串。 */
function renderSvg(option: Record<string, unknown>): string {
  const chart = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: W,
    height: H,
  });
  chart.setOption(option);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

export type ChartSvg = { title: string; svg: string };

/** 由月度统计 + 洞察渲染 4 张浅色 SVG 图（数据不足的自动省略）。 */
export function renderChartsSvg(stats: Stats, insights: Insights): ChartSvg[] {
  const charts: ChartSvg[] = [];
  const f = stats.finance;

  // 1. 每日净 GMV 趋势
  if (stats.daily.length > 0) {
    const dates = stats.daily.map((d) => d.date.slice(5));
    charts.push({
      title: "每日净 GMV 趋势",
      svg: renderSvg({
        ...base(),
        tooltip: { trigger: "axis" },
        xAxis: xAxis(dates),
        yAxis: yAxisPct(false),
        series: [
          { name: "抖音净", type: "line", smooth: true, data: stats.daily.map((d) => d.douyinNet), itemStyle: { color: DOUYIN } },
          { name: "小红书净", type: "line", smooth: true, data: stats.daily.map((d) => d.xhsNet), itemStyle: { color: XHS } },
          { name: "合计净", type: "line", smooth: true, data: stats.daily.map((d) => d.net), itemStyle: { color: NET }, areaStyle: { opacity: 0.06 } },
        ],
      }),
    });
  }

  // 2. 周净 GMV 环比
  if (insights.trend.weeks.length > 0) {
    const weeks = insights.trend.weeks;
    charts.push({
      title: "周净 GMV（环比）",
      svg: renderSvg({
        ...base(),
        tooltip: { trigger: "axis" },
        xAxis: xAxis(weeks.map((w) => w.weekStart.slice(5))),
        yAxis: yAxisPct(false),
        series: [
          {
            name: "周净GMV",
            type: "bar",
            data: weeks.map((w) => w.net),
            itemStyle: { color: NET },
            label: { show: true, position: "top", color: TXT, fontSize: 10 },
          },
        ],
      }),
    });
  }

  // 3. 平台 GMV 占比
  if (f.douyin.gmv > 0 || f.xhs.gmv > 0) {
    charts.push({
      title: "平台 GMV 占比",
      svg: renderSvg({
        ...base(),
        tooltip: { trigger: "item" },
        series: [
          {
            type: "pie",
            radius: ["40%", "68%"],
            center: ["50%", "55%"],
            label: { color: TXT, fontSize: 11 },
            data: [
              { name: "抖音 GMV", value: f.douyin.gmv, itemStyle: { color: DOUYIN } },
              { name: "小红书 GMV", value: f.xhs.gmv, itemStyle: { color: XHS } },
            ],
          },
        ],
      }),
    });
  }

  // 4. 退款率对比
  charts.push({
    title: "退款率对比",
    svg: renderSvg({
      ...base(),
      tooltip: { trigger: "axis" },
      xAxis: xAxis(["抖音", "小红书", "合计"]),
      yAxis: yAxisPct(true),
      series: [
        {
          name: "退款率",
          type: "bar",
          data: [f.douyin.refundRate, f.xhs.refundRate, f.total.refundRate],
          itemStyle: { color: REFUND },
          label: { show: true, position: "top", color: TXT, fontSize: 11, formatter: "{c}%" },
        },
      ],
    }),
  });

  // 5. 转化漏斗（仅表格导入）
  if (stats.rich && stats.rich.funnel.steps.length > 0) {
    const steps = stats.rich.funnel.steps;
    charts.push({
      title: "转化漏斗（场均人数）",
      svg: renderSvg({
        ...base(),
        tooltip: { trigger: "axis" },
        grid: { left: 96, right: 40, top: 30, bottom: 30 },
        xAxis: {
          type: "value",
          axisLabel: { color: TXT },
          splitLine: { lineStyle: { color: SPLIT } },
        },
        yAxis: {
          type: "category",
          data: steps.map((s) => (s.fromPrev != null ? `${s.name} (${s.fromPrev}%)` : s.name)),
          axisLabel: { color: TXT, fontSize: 10 },
          axisLine: { lineStyle: { color: AXIS } },
          axisTick: { show: false },
        },
        series: [
          {
            name: "场均人数",
            type: "bar",
            data: steps.map((s) => s.value),
            itemStyle: { color: "#8b5cf6" },
            label: { show: true, position: "right", color: TXT, fontSize: 10 },
          },
        ],
      }),
    });
  }

  // 6. 每日观看人数 / 平均在线（仅表格导入）
  if (stats.rich && stats.rich.daily.length > 0) {
    const d = stats.rich.daily;
    charts.push({
      title: "每日观看人数 / 平均在线",
      svg: renderSvg({
        ...base(),
        tooltip: { trigger: "axis" },
        xAxis: xAxis(d.map((x) => x.date.slice(5))),
        yAxis: yAxisPct(false),
        series: [
          { name: "观看人数", type: "bar", data: d.map((x) => x.viewers), itemStyle: { color: "#8b5cf6" } },
          { name: "平均在线", type: "line", smooth: true, data: d.map((x) => x.avgOnline), itemStyle: { color: "#10b981" } },
        ],
      }),
    });
  }

  return charts;
}

/** 把若干 SVG 图包成报告内嵌的 HTML 块（自适应、分栏）。 */
export function chartsBlockHtml(charts: ChartSvg[]): string {
  if (charts.length === 0) return "";
  const items = charts
    .map(
      (c) =>
        `<div class="chart"><h4>${c.title}</h4><div class="chart-svg">${c.svg}</div></div>`,
    )
    .join("");
  return `<div class="charts">${items}</div>`;
}
