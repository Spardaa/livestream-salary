// GLM API（OpenAI 兼容）。CORS 已实测通过：浏览器 fetch 直连可行。
// 默认智谱国内端点，可在「设置」里改为国际（api.z.ai）等 OpenAI 兼容端点。
export const DEFAULT_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

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

/**
 * 表格列映射：语义键 → 导出表头中文（值可为数组表示「多列求和」，如抖音投放消耗）。
 * 键名与 RichMetrics 字段一一对应；anchor/startDateTime/gmv/refund/netGmvCheck 为非富的必填/校验列。
 * gmv 头文字平台互斥（抖音「直播间成交金额」vs 小红书「支付金额」），据此自动判定平台。
 */
export type ColumnMap = {
  anchor: string;
  startDateTime: string;
  gmv: string;
  refund: string;
  netGmvCheck?: string;
  [richKey: string]: string | string[] | undefined;
};

export const DOUYIN_COLUMN_MAP: ColumnMap = {
  anchor: "主播昵称",
  startDateTime: "直播开始时间",
  gmv: "直播间成交金额",
  refund: "直播间退款金额",
  reach: "直播间曝光人数",
  impressions: "直播间曝光次数",
  viewers: "直播间观看人数",
  viewCount: "直播间观看次数",
  peakOnline: "最高在线人数",
  avgOnline: "平均在线人数",
  avgWatchMinutes: "人均观看时长(分钟)",
  durationMinutes: "直播时长(分钟)",
  comments: "评论次数",
  newFollowers: "新增粉丝数",
  unfollows: "取关粉丝数",
  oldFanViewShare: "观看老粉占比",
  productCount: "带货商品数",
  productExposureUV: "直播间商品曝光人数",
  productClickUV: "直播间商品点击人数",
  productExposurePV: "直播间商品曝光次数",
  productClickPV: "直播间商品点击次数",
  orders: "直播间成交订单数",
  items: "直播间成交件数",
  buyers: "直播间成交人数",
  refundOrders: "直播间退款订单数",
  refundPeople: "直播间退款人数",
  clickRate: "商品曝光-点击率(人数)",
  conversionRate: "商品点击-成交率(人数)",
  adSpend: ["投放消耗(店铺绑定)", "投放消耗(店铺被投)"],
};

export const XHS_COLUMN_MAP: ColumnMap = {
  anchor: "主播昵称",
  startDateTime: "直播开始时间",
  gmv: "支付金额",
  refund: "退款金额",
  reach: "直播间曝光人数",
  impressions: "直播间曝光次数",
  viewers: "直播间观看人数",
  viewCount: "直播间观看次数",
  avgOnline: "平均在线人数",
  avgWatchMinutes: "人均停留时长",
  durationMinutes: "直播时长（分钟）",
  interactors: "互动人数",
  comments: "评论人数",
  productExposureUV: "商品曝光人数",
  productClickUV: "商品点击人数",
  productExposurePV: "商品曝光次数",
  productClickPV: "商品点击次数",
  clickRate: "商品点击率（人数）",
  payers: "支付人数",
  orders: "支付订单数",
  items: "支付件数",
  payRate: "观看支付率",
  conversionRate: "支付转化率",
  refundOrders: "退款订单数",
  refundPeople: "退款人数",
  refundRate: "退款率",
  newFollowers: "新增粉丝数",
};
