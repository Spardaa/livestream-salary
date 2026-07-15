import { DEFAULTS } from "../../config/constants";
import { getSettings } from "../storage";
import { chat, type ContentPart } from "./client";
import { ExtractionSchema, parseJsonLenient, type Extraction } from "../../pipeline/schema";

function buildPrompt(year: number): string {
  return [
    "你是直播间数据抽取助手。看这张直播后台截图，抽取成严格 JSON，字段如下：",
    "",
    "【平台判定 · 最重要】先看页面顶部标题文字：",
    '- 标题为「直播详情」 → platform = "douyin"（抖音）',
    '- 标题为「单直播间表现」、或页面任何位置含「小红书号」 → platform = "xiaohongshu"（小红书）',
    "- 两类截图版式相近，必须以标题文字 / 「小红书号」为准，切勿凭版式或感觉猜测。",
    "",
    "其余字段：",
    `- date: 开播日期，格式 YYYY-MM-DD；若截图未显示年份，按 ${year} 补全`,
    "- start_time: 开播时间 HH:MM（24小时制）",
    "- gmv: 支付金额 / GMV（去掉 ¥、千分位逗号，纯数字，单位元；找不到填 0）",
    "- refund: 退款金额（纯数字，单位元；找不到填 0）",
    "- metrics: 抓取页面所有其他指标的键值对（如 人均观播时长、新增粉丝、观看支付转化率、支付订单数、最高在线、商品点击 等），原样保留",
    "- raw_text: 页面关键文字备份（简短）",
    "要求：只返回一个 JSON 对象，不要解释、不要 markdown。数值必须为 number 类型，不要带引号。",
  ].join("\n");
}

/** 节点①：单图 → 结构化抽取记录。 */
export async function extractImage(
  dataUrl: string,
  opts?: { temperature?: number; signal?: AbortSignal; year?: number },
): Promise<Extraction> {
  const { visionModel } = getSettings();
  const year = opts?.year ?? DEFAULTS.defaultYear;
  const content: ContentPart[] = [
    { type: "text", text: buildPrompt(year) },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  const raw = await chat({
    model: visionModel,
    messages: [{ role: "user", content }],
    temperature: opts?.temperature ?? 0.3,
    jsonMode: true,
    signal: opts?.signal,
  });
  return parseJsonLenient(raw, ExtractionSchema);
}

export { parseJsonLenient };
