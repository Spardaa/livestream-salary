// GLM API（OpenAI 兼容）。CORS 已实测通过：浏览器 fetch 直连可行。
export const GLM_ENDPOINT = "https://api.z.ai/api/paas/v4/chat/completions";

// 模型 ID：默认填用户账号值，可在「设置」里改。
// 若调用报「模型不存在」，文本可改 glm-5，视觉可改 glm-4.5v / glm-4v-plus 等。
export const DEFAULT_MODELS = {
  vision: "glm-5v-turbo", // 视觉抽取节点①
  text: "glm-5.2", // 底薪规则节点② + 月报节点③
};

// 业务默认值
export const DEFAULTS = {
  commissionRate: 0.02, // 提成比例 2%，UI 可调
  /** 时段分界（分钟）：< afternoonStart 为早班；[afternoonStart, nightStart) 为下午班；>= nightStart 为晚班 */
  slot: {
    afternoonStart: 12 * 60, // 12:00
    nightStart: 18 * 60, // 18:00
  },
  consensusDraws: 3, // Layer1 每图独立抽取次数
  maxEscalationRounds: 2, // 分歧升级最多再抽轮数（累计 ≤ 3+2*3=9）
  concurrency: 5, // 并发抽取数
  e2eRuns: 3, // Layer3 端到端独立运行次数
  imageMaxDim: 1568, // 图片压缩最长边
  requestTimeoutMs: 90000,
  defaultYear: 2026, // 截图未显示年份时补全
};

export const STORAGE_KEYS = {
  apiKey: "ls_glm_api_key",
  settings: "ls_settings",
};
