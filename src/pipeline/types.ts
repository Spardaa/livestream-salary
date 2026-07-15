export type Platform = "douyin" | "xiaohongshu";

/** 置信度：高(3/3一致) / 中(2/3一致) / 需人工(熔断) */
export type Confidence = "high" | "medium" | "flagged";

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
