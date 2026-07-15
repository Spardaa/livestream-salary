import { z } from "zod";
import type { Platform } from "./types";

/** 日期归一：接受 YYYY-M-D，输出 YYYY-MM-DD */
const DateStr = z.string().transform((s, ctx) => {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    ctx.addIssue({ code: "custom", message: "date 需为 YYYY-MM-DD" });
    return z.NEVER;
  }
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
});

/** 时间归一：接受 H:MM，输出 HH:MM */
const TimeStr = z.string().transform((s, ctx) => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    ctx.addIssue({ code: "custom", message: "start_time 需为 HH:MM" });
    return z.NEVER;
  }
  return `${m[1].padStart(2, "0")}:${m[2]}`;
});

/** 节点① 单图抽取记录 */
export const ExtractionSchema = z.object({
  platform: z.enum(["douyin", "xiaohongshu"]),
  date: DateStr,
  start_time: TimeStr,
  gmv: z.coerce.number().min(0),
  refund: z.coerce.number().min(0),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])),
  raw_text: z.string(),
});
export type Extraction = z.infer<typeof ExtractionSchema> & { platform: Platform };

/** 节点② 多员工排班（含每人提成） */
const SlotSchema = z.enum(["morning", "afternoon", "night"]);
export const ScheduleSchema = z.object({
  employees: z.array(
    z.object({
      name: z.string().min(1),
      commissionRatePct: z.coerce.number().min(0),
      entries: z.array(
        z.object({
          start: DateStr,
          end: DateStr,
          slot: SlotSchema,
          baseSalary: z.coerce.number().min(0),
        }),
      ),
    }),
  ),
});
export type ParsedSchedule = z.infer<typeof ScheduleSchema>;

/** 从模型返回里提取并校验 JSON */
export function parseJsonLenient<T>(raw: string, schema: z.ZodType<T>): T {
  const jsonStr = extractJsonObject(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    throw new Error("模型返回非合法 JSON：" + raw.slice(0, 200));
  }
  return schema.parse(obj);
}

function extractJsonObject(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return s.slice(start, end + 1);
  return s.trim();
}
