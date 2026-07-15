import type { Confidence, Slot, EmployeeSchedule } from "./types";
import type { ParsedSchedule } from "./schema";
import type { ConsensusItem } from "./consensus";
import { classifySlot, monthDates, worstConf, aggPlatform, type PlatformAgg } from "./aggregate";

/** 某员工某日行（含其当天工作的时段、底薪）。 */
export type EmpDayRow = {
  date: string;
  douyin: PlatformAgg | null;
  xiaohongshu: PlatformAgg | null;
  slots: Slot[];
  baseSalary: number | null;
  confidence: Confidence;
  imageIds: string[];
  hasData: boolean;
};

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end; // YYYY-MM-DD 字典序即可
}

function matchEntry(emp: EmployeeSchedule, date: string, slot: Slot) {
  return emp.entries.find((e) => e.slot === slot && inRange(date, e.start, e.end));
}

type Attributed = {
  item: ConsensusItem;
  slot: Slot;
  emp: EmployeeSchedule;
  entry: { start: string; end: string; slot: Slot; baseSalary: number };
};

export type Unattributed = { name: string; date: string; slot: Slot };

export type EmployeeDays = {
  schedule: EmployeeSchedule;
  days: EmpDayRow[];
  items: ConsensusItem[]; // 归属到该员工的明细（供 stats 用）
};

export type AttributionResult = {
  perEmployee: EmployeeDays[];
  unattributed: Unattributed[];
};

/** 按排班把每场直播归属到员工，并生成每人整月日表。 */
export function buildEmployeeResults(
  items: ConsensusItem[],
  schedule: ParsedSchedule,
  month?: string,
): AttributionResult {
  const attributed: Attributed[] = [];
  const unattributed: Unattributed[] = [];

  for (const it of items) {
    if (!it.consensus) continue;
    const v = it.consensus.value;
    const slot = classifySlot(v.start_time);
    let hit: { emp: EmployeeSchedule; entry: Attributed["entry"] } | null = null;
    for (const emp of schedule.employees) {
      const entry = matchEntry(emp, v.date, slot);
      if (entry) {
        hit = { emp, entry };
        break;
      }
    }
    if (hit) attributed.push({ item: it, slot, emp: hit.emp, entry: hit.entry });
    else unattributed.push({ name: it.name, date: v.date, slot });
  }

  const perEmployee: EmployeeDays[] = schedule.employees.map((emp) => {
    const mine = attributed.filter((a) => a.emp.name === emp.name);
    return {
      schedule: emp,
      days: buildDays(mine, month),
      items: mine.map((a) => a.item),
    };
  });

  return { perEmployee, unattributed };
}

function buildDays(empItems: Attributed[], month?: string): EmpDayRow[] {
  const byDate = new Map<string, Attributed[]>();
  for (const a of empItems) {
    const d = a.item.consensus!.value.date;
    byDate.set(d, [...(byDate.get(d) ?? []), a]);
  }

  const dates = new Set<string>(byDate.keys());
  if (month) for (const d of monthDates(month)) dates.add(d);

  const rows: EmpDayRow[] = [];
  for (const date of dates) {
    const dayItems = byDate.get(date) ?? [];
    if (dayItems.length === 0) {
      rows.push({
        date,
        douyin: null,
        xiaohongshu: null,
        slots: [],
        baseSalary: null,
        confidence: "high",
        imageIds: [],
        hasData: false,
      });
      continue;
    }
    const slots = [...new Set(dayItems.map((a) => a.slot))];
    // 当天用到的排班段去重后求和作为当日底薪
    const entryKeys = new Set<string>();
    let baseSalary = 0;
    for (const a of dayItems) {
      const k = `${a.entry.start}|${a.entry.end}|${a.entry.slot}|${a.entry.baseSalary}`;
      if (!entryKeys.has(k)) {
        entryKeys.add(k);
        baseSalary += a.entry.baseSalary;
      }
    }
    const items = dayItems.map((a) => a.item);
    rows.push({
      date,
      douyin: aggPlatform(items, "douyin"),
      xiaohongshu: aggPlatform(items, "xiaohongshu"),
      slots,
      baseSalary,
      confidence: worstConf(items.map((it) => it.consensus!.confidence)),
      imageIds: items.map((i) => i.id),
      hasData: true,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
