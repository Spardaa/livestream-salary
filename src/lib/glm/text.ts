import { getSettings } from "../storage";
import { chat } from "./client";
import {
  ScheduleSchema,
  parseJsonLenient,
  type ParsedSchedule,
} from "../../pipeline/schema";
import type { Stats } from "../../pipeline/stats";
import type { Insights } from "../../pipeline/insights";

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

/**
 * 节点③：基于某员工的统计数据 + 确定性洞察，生成分析师级 Markdown 月报。
 * insights 内数字为纯函数计算结果（已校验事实），prompt 强制原样引用、禁止臆测。
 */
export async function generateReport(
  stats: Stats,
  insights: Insights,
  employeeName: string,
  signal?: AbortSignal,
): Promise<string> {
  const { textModel } = getSettings();
  const rich = stats.rich;
  const prompt = [
    "你是资深直播间运营分析师。根据下方「已校验事实」为某员工撰写本月运营月报（中文 Markdown）。",
    "",
    "【硬约束 · 必须遵守】",
    "1. 下方 JSON 内所有数字均为确定性计算结果、准确无误——必须原样引用，严禁改写、四舍五入或臆测任何未给出的数字。",
    "2. 未在事实中提供的数据一律不得编造；若无相关数据，直接说明「数据不足」并略过该角度。",
    "3. 「行动建议」必须可执行，且每一条都要绑定上文至少一个具体事实（日期或数值），不要空泛口号。",
    "4. 直接输出 Markdown 正文：用 `##` 分节，不要包在代码块里，不要前后多余说明。",
    "5. 强调关键数据：所有关键数字（金额、净营收、GMV、退款额/退款率、环比%、在线人数、转化率%、场次、日期等）一律用 **加粗** 标注，使其一眼可见；普通描述性文字不加粗。",
    rich
      ? "6. 本月数据来自平台明细表（含在线人数、转化漏斗、粉丝等富指标）。stats.rich 内所有字段均真实可用，按下方「富指标结构」逐节分析并引用具体数字；任一字段缺失（值为 0 或不存在）时说明「数据不足」即可，切勿臆测。"
      : "6. 本月数据来自截图识别，仅有 GMV/退款；不得出现在线人数、转化漏斗等富指标。",
    "",
    "【固定结构 · 按此顺序】",
    "## 一、执行摘要",
    "3–5 句：本月净营收总额、动量方向（上升/平稳/下降）、最关键的 1 个亮点与 1 个风险。",
    "## 二、关键指标",
    "总 GMV、净营收、退款率、日均净营收、直播场次（取自 stats）。简短列表即可。",
    "## 三、趋势与动能",
    "基于 insights.trend：周环比变化、峰值日/谷值日、连续涨/跌天数、月初到月末动量。引用具体日期与净额。",
    "## 四、平台对比",
    "基于 insights.platform：抖音 vs 小红书的净营收、单场产出、退款率；谁是主力、是否存在高退款平台。引用数值。",
    "## 五、风险与异常",
    "基于 insights.anomalies：高退款日、低产出日。每条带日期+数值，并给可能原因假设与排查方向。",
    "## 六、亮点与最佳实践",
    "基于 stats.topSessions：表现最好的场次，提炼可复制经验。",
    "## 七、行动建议",
    "3–5 条具体可执行建议，每条绑定上文一个事实。",
    ...(rich
      ? [
          "",
          "【富指标结构 · 仅当 stats.rich 存在时输出，紧接第七节之后】",
          "## 八、流量质量与人气",
          "场均在线人数、峰值在线、场均观看人数、人均观看时长、场均直播时长（取自 stats.rich）。评价人气是否健康、观众黏性。",
          "## 九、转化漏斗分析",
          "基于 stats.rich.funnel.steps（曝光→观看→商品点击→成交，各步给出 fromPrev 留存%）、avgClickRate、avgConversionRate、avgPayRate。明确指出漏斗最薄弱环节并给出优化方向。",
          "## 十、退款与粉丝",
          "avgRefundRate、totalRefundPeople（stats.rich）结合 finance 退款率评估退款风险；totalNewFollowers、totalUnfollows、netFollowers 评估粉丝沉淀。",
          "## 十一、时段效率对比",
          "基于 stats.rich.bySlot（早班/下午班/晚班的场次、GMV、场均在线、场均观看、场均转化率）。指出产出与转化最佳的时段。",
          "## 十二、最佳/最差场次与投放",
          "基于 stats.rich.topSessions 与 bottomSessions（含日期、GMV、转化率、场均在线）：提炼可复制经验与教训；若 totalAdSpend>0，给出 ROAS（stats.rich.roas）并评估投放效率。",
        ]
      : []),
    "",
    "（薪资日表由系统自动附在文末，你无需输出。）",
    "",
    `员工：${employeeName || "（未填）"}　月份：${stats.month || ""}`,
    "",
    "===== stats（精简） =====",
    "```json",
    JSON.stringify(
      rich
        ? {
            month: stats.month,
            days: stats.days,
            sessions: stats.sessions,
            finance: stats.finance,
            topSessions: stats.topSessions,
            rich,
          }
        : {
            month: stats.month,
            days: stats.days,
            sessions: stats.sessions,
            finance: stats.finance,
            topSessions: stats.topSessions,
          },
    ),
    "```",
    "",
    "===== insights（已校验事实） =====",
    "```json",
    JSON.stringify(insights),
    "```",
  ].join("\n");

  const raw = await chat({
    model: textModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    maxTokens: rich ? 7168 : 4096,
    signal,
  });
  return raw.trim();
}
