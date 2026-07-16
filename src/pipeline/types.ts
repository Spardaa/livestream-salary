export type Platform = "douyin" | "xiaohongshu";

/** 置信度：高(3/3一致) / 中(2/3一致) / 需人工(熔断) */
export type Confidence = "high" | "medium" | "flagged";

/** 数据来源：截图识图(默认) / 表格导入(与截图互斥) */
export type SourceMode = "image" | "table";

/** 时段：早班(12点前) / 下午班(12-18点) / 晚班(18点后) */
export type Slot = "morning" | "afternoon" | "night";

/** 排班：一段日期 + 时段 + 当日底薪 */
export type ScheduleEntry = {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  slot: Slot;
  baseSalary: number;
};

/** 员工排班：姓名 + 提成比例(%) + 若干排班段 */
export type EmployeeSchedule = {
  name: string;
  commissionRatePct: number; // 如 2 表示 2%
  entries: ScheduleEntry[];
};

/**
 * 单场直播的富指标（表格导入归一化后）。所有字段可选——不同平台/导出列略有差异。
 * 比率类字段统一存为「百分数」（如 12.3 表示 12.3%），便于直接展示。
 */
export type RichMetrics = {
  reach?: number; // 曝光人数
  impressions?: number; // 曝光次数
  viewers?: number; // 观看人数
  viewCount?: number; // 观看次数
  avgOnline?: number; // 平均在线
  peakOnline?: number; // 最高在线
  avgWatchMinutes?: number; // 人均观看/停留时长(分钟)
  durationMinutes?: number; // 直播时长(分钟)
  comments?: number; // 评论次数/人数
  interactors?: number; // 互动人数(小红书)
  newFollowers?: number; // 新增粉丝
  unfollows?: number; // 取关粉丝(抖音)
  oldFanViewShare?: number; // 观看老粉占比(%, 抖音)
  productCount?: number; // 带货商品数
  productExposureUV?: number; // 商品曝光人数
  productExposurePV?: number; // 商品曝光次数
  productClickUV?: number; // 商品点击人数
  productClickPV?: number; // 商品点击次数
  clickRate?: number; // 商品点击率(%)
  orders?: number; // 成交/支付订单数
  items?: number; // 成交/支付件数
  buyers?: number; // 成交人数(抖音)
  payers?: number; // 支付人数(小红书)
  payRate?: number; // 观看支付率(%, 小红书)
  conversionRate?: number; // 转化率(%)
  refundOrders?: number; // 退款订单数
  refundPeople?: number; // 退款人数
  refundRate?: number; // 退款率(%)
  adSpend?: number; // 投放消耗(抖音)
};

/** 单场富事实：用于富统计的 top/bottom 场次与每日趋势。 */
export type RichSession = {
  platform: Platform;
  date: string;
  start_time: string;
  slot: Slot;
  gmv: number;
  refund: number;
  conversionRate?: number;
  avgOnline?: number;
  viewers?: number;
};

/** 某时段的富聚合。 */
export type RichSlotStat = {
  sessions: number;
  gmv: number;
  avgOnline: number;
  avgViewers: number;
  avgConversionRate: number;
};

/**
 * 某员工整月富指标聚合（仅表格导入、存在 RichMetrics 时计算）。
 * 比率均为百分数；avg* 为场均；total* 为整月合计。
 */
export type RichStats = {
  sessions: number;
  // 人气与流量
  avgOnline: number;
  peakOnline: number;
  avgViewers: number;
  totalReach: number;
  avgWatchMinutes: number;
  avgDurationMinutes: number;
  // 粉丝
  totalNewFollowers: number;
  totalUnfollows: number;
  netFollowers: number;
  // 转化漏斗（场均人数 + GMV 总额）
  funnel: {
    reach: number;
    viewers: number;
    productClickUV: number;
    buyers: number;
    gmv: number;
    steps: { name: string; value: number; fromPrev: number | null }[];
  };
  avgClickRate: number;
  avgConversionRate: number;
  avgPayRate: number;
  // 退款
  avgRefundRate: number;
  totalRefundPeople: number;
  // 广告（抖音）
  totalAdSpend: number;
  roas: number | null; // GMV / 投放消耗
  // 时段
  bySlot: Record<Slot, RichSlotStat>;
  // 每日趋势
  daily: {
    date: string;
    viewers: number;
    avgOnline: number;
    newFollowers: number;
    gmv: number;
  }[];
  // 最佳/最差场次
  topSessions: RichSession[];
  bottomSessions: RichSession[];
};
