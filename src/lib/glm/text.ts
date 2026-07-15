import { getSettings } from "../storage";
import { chat } from "./client";
import {
  ScheduleSchema,
  parseJsonLenient,
  type ParsedSchedule,
} from "../../pipeline/schema";
import type { Stats } from "../../pipeline/stats";

/**
 * 节点②：自然语言多员工排班 → 结构化 ParsedSchedule。
 * 输入示例：
 *   员工A：提成2%，6.1-6.7 早班100，6.8-6.14 晚班140，6.15-6.21 下午班140
 *   员工B：提成3%，6.1-6.7 晚班140，6.8-6.14 早班100
 */
export async function parseSchedule(
  text: string,
  month: string,
  signal?: AbortSignal,
): Promise<ParsedSchedule> {
  const { textModel } = getSettings();
  const [y, m] = month.split("-").map(Number);
  const prompt = [
    "你是直播间接班排班解析助手。把用户用自然语言写的「多员工排班 + 底薪 + 提成」解析成严格 JSON。",
    "时段关键词映射：早班(12点前)=morning；下午班(12-18点)=afternoon；晚班(18点后)=night。",
    `本月为 ${y}年${m}月，所有日期区间都要补全为完整 YYYY-MM-DD（年份 ${y}）。`,
    "输出格式：{ employees: [ { name, commissionRatePct(提成百分比数字,如2表示2%), entries: [ { start, end, slot, baseSalary } ] } ] }。",
    "要求：",
    "- 每个员工的 entries 至少一条；同一天同一时段只属于一个员工。",
    "- commissionRatePct 为纯数字百分比（2 表示 2%）；若某员工未写提成，默认 2。",
    "- 若员工未写姓名，用「员工1/员工2」占位。",
    "- 只返回 JSON，不要解释。",
    "",
    "用户输入：",
    text || "（空）",
  ].join("\n");

  const raw = await chat({
    model: textModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    jsonMode: true,
    signal,
  });
  return parseJsonLenient(raw, ScheduleSchema);
}

/** 节点③：基于某员工的统计数据生成 Markdown 月报 + 工作建议。 */
export async function generateReport(
  stats: Stats,
  employeeName: string,
  signal?: AbortSignal,
): Promise<string> {
  const { textModel } = getSettings();
  const prompt = [
    "你是直播间运营数据分析师。根据下面某员工本月数据统计（JSON），写一份 Markdown 月报。",
    "要求：",
    "1. 中文，结构清晰，用 ## 小标题分节。",
    "2. 包含：总览（GMV/退款/净营收/退款率/日均）、平台对比（抖音 vs 小红书）、时段对比（早班/下午班/晚班）、按日趋势、亮点、问题、工作建议（具体可执行）。",
    "3. 工作建议要结合数据，指出可改进点（如某平台退款率偏高、某时段表现弱等）。",
    "4. 可引用富指标（人均观播时长、新增粉丝、转化率等）辅助分析；metrics 里是各指标的平均值与样本数。",
    "5. 直接输出 Markdown 正文，不要包在代码块里，不要前后多余说明。",
    "",
    `员工：${employeeName || "（未填）"}　月份：${stats.month || ""}`,
    "数据统计 JSON：",
    "```json",
    JSON.stringify(stats),
    "```",
  ].join("\n");

  const raw = await chat({
    model: textModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    maxTokens: 4096,
    signal,
  });
  return raw.trim();
}
