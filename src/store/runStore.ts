import { create } from "zustand";
import { DEFAULTS } from "../config/constants";
import {
  getApiKey,
  getSettings,
  setApiKey as persistApiKey,
  setSettings as persistSettings,
  type Settings,
} from "../lib/storage";
import { fileToCompressedDataUrl } from "../lib/image";
import { extractImage } from "../lib/glm/vision";
import { parseSchedule, generateReport } from "../lib/glm/text";
import { asyncPool } from "../lib/async-pool";
import { resetRateLimited, getRateLimited } from "../lib/glm/client";
import { vote, type ConsensusResult } from "../pipeline/consensus";
import { validateBatch, type ValidationIssue } from "../pipeline/validate";
import { aggregate, type DayRow } from "../pipeline/aggregate";
import { buildEmployeeResults, type EmpDayRow, type Unattributed } from "../pipeline/schedule";
import { computeSalary, type SalaryRow, type SalaryTotals } from "../pipeline/salary";
import { computeStats, type Stats } from "../pipeline/stats";
import { computeInsights, type Insights } from "../pipeline/insights";
import { verifyE2E, unresolvedImageIds, type E2EVerification } from "../pipeline/verify-e2e";
import type { ParsedSchedule, Extraction } from "../pipeline/schema";

export type ImageItem = {
  id: string;
  name: string;
  dataUrl: string;
  status: "pending" | "extracting" | "done" | "error";
  draws: Extraction[];
  consensus: ConsensusResult | null;
  error?: string;
};

export type SalaryVerification = E2EVerification & { unresolved: string[] };

export type EmployeeResult = {
  name: string;
  commissionRatePct: number;
  dayTable: EmpDayRow[];
  salaryRows: SalaryRow[];
  salaryTotals: SalaryTotals;
  stats: Stats;
  insights: Insights;
  items: { id: string; name: string; consensus: ConsensusResult | null }[];
  reportMarkdown: string | null;
};

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type Store = {
  apiKey: string;
  settings: Settings;
  setApiKey: (k: string) => void;
  setSettings: (patch: Partial<Settings>) => void;

  month: string;
  setMonth: (m: string) => void;

  items: ImageItem[];
  dayTable: DayRow[]; // 原始按日期日表（跨员工，抽取预览用）
  issues: ValidationIssue[];
  running: boolean;
  progress: { done: number; total: number };
  rateLimited: number; // 本次任务遇到的 429 次数（含已重试成功）

  addFiles: (files: FileList | File[]) => Promise<void>;
  removeItem: (id: string) => void;
  clear: () => void;
  runExtraction: () => Promise<void>;

  // 排班 + 多员工
  scheduleText: string;
  setScheduleText: (s: string) => void;
  schedule: ParsedSchedule | null;
  scheduleError?: string;
  employees: EmployeeResult[];
  activeEmployee: string;
  setActiveEmployee: (name: string) => void;
  unattributed: Unattributed[];
  verification: SalaryVerification | null;
  salaryRunning: boolean;
  runSalary: () => Promise<void>;

  // 月报（全员）
  reportRunning: boolean;
  reportError?: string;
  runReport: () => Promise<void>;
};

export const useStore = create<Store>((set, get) => {
  /** 对 flagged 图追加抽取并重新表决。 */
  async function escalate(ids: string[], year: number) {
    const tasks: { id: string }[] = [];
    for (const id of ids)
      for (let i = 0; i < DEFAULTS.maxEscalationRounds; i++) tasks.push({ id });
    if (tasks.length === 0) return;
    await asyncPool(tasks, get().settings.concurrency, async (task) => {
      const it = get().items.find((i) => i.id === task.id);
      if (!it) return;
      try {
        const ext = await extractImage(it.dataUrl, { temperature: 0.5, year });
        set((s) => ({
          items: s.items.map((i) =>
            i.id === task.id ? { ...i, draws: [...i.draws, ext] } : i,
          ),
        }));
      } catch {
        /* 保留已有抽取 */
      }
    });
    set((s) => ({
      items: s.items.map((it) =>
        ids.includes(it.id) && it.draws.length > 0
          ? { ...it, consensus: vote(it.draws) }
          : it,
      ),
    }));
  }

  return {
    apiKey: getApiKey(),
    settings: getSettings(),
    setApiKey: (k) => {
      persistApiKey(k);
      set({ apiKey: k });
    },
    setSettings: (patch) => {
      const next = { ...get().settings, ...patch };
      persistSettings(next);
      set({ settings: next });
    },

    month: "",
    setMonth: (m) => set({ month: m }),

    items: [],
    dayTable: [],
    issues: [],
    running: false,
    progress: { done: 0, total: 0 },
    rateLimited: 0,

    addFiles: async (files) => {
      const newItems: ImageItem[] = [];
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue;
        try {
          const dataUrl = await fileToCompressedDataUrl(f);
          newItems.push({
            id: uid(),
            name: f.name,
            dataUrl,
            status: "pending",
            draws: [],
            consensus: null,
          });
        } catch {
          /* skip unreadable file */
        }
      }
      if (newItems.length) set({ items: [...get().items, ...newItems] });
    },

    removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
    clear: () =>
      set({
        items: [],
        dayTable: [],
        issues: [],
        progress: { done: 0, total: 0 },
        rateLimited: 0,
        schedule: null,
        scheduleError: undefined,
        employees: [],
        activeEmployee: "",
        unattributed: [],
        verification: null,
      }),

    runExtraction: async () => {
      const { items, apiKey, month, running } = get();
      if (running || !apiKey || items.length === 0) return;
      const draws = get().settings.consensusDraws;
      const concurrency = get().settings.concurrency;

      set({
        items: items.map((it) => ({
          ...it,
          status: "pending",
          draws: [],
          consensus: null,
          error: undefined,
        })),
        dayTable: [],
        issues: [],
        running: true,
        progress: { done: 0, total: items.length * draws },
        schedule: null,
        employees: [],
        unattributed: [],
        verification: null,
      });

      const year = month ? Number(month.slice(0, 4)) : DEFAULTS.defaultYear;
      const ids = get().items.map((i) => i.id);
      const tasks: { itemId: string }[] = [];
      for (const id of ids)
        for (let d = 0; d < draws; d++) tasks.push({ itemId: id });

      let done = 0;
      const bump = () => {
        done += 1;
        set({ progress: { done, total: tasks.length } });
      };

      resetRateLimited();

      await asyncPool(tasks, concurrency, async (task) => {
        const item = get().items.find((i) => i.id === task.itemId);
        if (!item) {
          bump();
          return;
        }
        const dataUrl = item.dataUrl;
        try {
          const ext = await extractImage(dataUrl, { temperature: 0.3, year });
          set((s) => ({
            items: s.items.map((i) =>
              i.id === task.itemId
                ? { ...i, status: "extracting", draws: [...i.draws, ext] }
                : i,
            ),
          }));
        } catch (e) {
          const msg = (e as Error).message;
          set((s) => ({
            items: s.items.map((i) =>
              i.id === task.itemId ? { ...i, error: msg } : i,
            ),
          }));
        } finally {
          bump();
        }
      });

      const finalItems: ImageItem[] = get().items.map((it) => {
        if (it.draws.length === 0) return { ...it, status: "error" };
        return { ...it, status: "done", consensus: vote(it.draws) };
      });
      set({ items: finalItems });

      const consItems = finalItems.map((it) => ({
        id: it.id,
        name: it.name,
        consensus: it.consensus,
      }));
      set({
        dayTable: aggregate(consItems, month || undefined),
        issues: validateBatch(consItems, month || undefined),
        rateLimited: getRateLimited(),
        running: false,
      });
    },

    // ---- 排班 + 多员工 ----
    scheduleText: "",
    setScheduleText: (s) => set({ scheduleText: s }),
    schedule: null,
    scheduleError: undefined,
    employees: [],
    activeEmployee: "",
    setActiveEmployee: (name) => set({ activeEmployee: name }),
    unattributed: [],
    verification: null,
    salaryRunning: false,

    runSalary: async () => {
      const { items, scheduleText, month, salaryRunning } = get();
      if (salaryRunning) return;
      if (!items.some((it) => it.consensus)) return;
      if (!month) {
        set({ scheduleError: "请先在上方选择「月份」，排班与整月铺齐都需要月份。" });
        return;
      }
      resetRateLimited();
      set({ salaryRunning: true, scheduleError: undefined, verification: null });

      try {
        const year = Number(month.slice(0, 4));

        // 1. 升级 flagged 图
        const flaggedIds = items
          .filter((it) => it.consensus?.confidence === "flagged")
          .map((it) => it.id);
        if (flaggedIds.length > 0) await escalate(flaggedIds, year);

        // 2. 重新原始聚合（抽取预览）
        const consItems = get().items.map((it) => ({
          id: it.id,
          name: it.name,
          consensus: it.consensus,
        }));
        set({
          dayTable: aggregate(consItems, month),
          issues: validateBatch(consItems, month),
        });

        // 3. 节点②：解析排班
        let schedule: ParsedSchedule | null = null;
        let scheduleError: string | undefined;
        try {
          schedule = await parseSchedule(scheduleText, month);
        } catch (e) {
          scheduleError = (e as Error).message;
        }
        if (!schedule) {
          set({ schedule: null, scheduleError, salaryRunning: false, employees: [], rateLimited: getRateLimited() });
          return;
        }

        // 4. 归属 + 每人薪资/统计
        const { perEmployee, unattributed } = buildEmployeeResults(consItems, schedule, month);
        const employees: EmployeeResult[] = perEmployee.map((ed) => {
          const { rows, totals } = computeSalary(ed.days, ed.schedule.commissionRatePct);
          const stats = computeStats(rows, ed.items, month);
          const insights = computeInsights(stats, rows, month);
          return {
            name: ed.schedule.name,
            commissionRatePct: ed.schedule.commissionRatePct,
            dayTable: ed.days,
            salaryRows: rows,
            salaryTotals: totals,
            stats,
            insights,
            items: ed.items,
            reportMarkdown: null,
          };
        });

        // 5. Layer3 抽取稳定性 + 熔断
        const e2eItems = get().items.map((it) => ({
          id: it.id,
          name: it.name,
          draws: it.draws,
          consensus: it.consensus,
        }));
        const ver = verifyE2E(e2eItems);
        const unresolved = unresolvedImageIds(e2eItems);

        set({
          schedule,
          scheduleError: undefined,
          employees,
          activeEmployee: employees[0]?.name ?? "",
          unattributed,
          verification: { ...ver, unresolved },
          rateLimited: getRateLimited(),
          salaryRunning: false,
        });
      } catch (e) {
        set({ salaryRunning: false, scheduleError: (e as Error).message, rateLimited: getRateLimited() });
      }
    },

    // ---- 月报（全员）----
    reportRunning: false,
    reportError: undefined,

    runReport: async () => {
      const { employees, reportRunning } = get();
      if (reportRunning || employees.length === 0) return;
      set({ reportRunning: true, reportError: undefined });
      try {
        const results = await asyncPool(employees, 2, async (e) => {
          const md = await generateReport(e.stats, e.insights, e.name);
          return { name: e.name, md };
        });
        const map = new Map(results.map((r) => [r.name, r.md]));
        set({
          employees: get().employees.map((e) => ({
            ...e,
            reportMarkdown: map.get(e.name) ?? e.reportMarkdown,
          })),
          reportRunning: false,
        });
      } catch (e) {
        set({ reportRunning: false, reportError: (e as Error).message });
      }
    },
  };
});
