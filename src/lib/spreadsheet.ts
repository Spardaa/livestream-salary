import { Workbook } from "exceljs";
import { ExtractionSchema } from "../pipeline/schema";
import type { Extraction } from "../pipeline/schema";
import { DOUYIN_COLUMN_MAP, XHS_COLUMN_MAP, type ColumnMap } from "../config/constants";
import type { Platform, RichMetrics } from "../pipeline/types";

/** 一张表解析出的若干行（每行 = 一场直播）。 */
export type ParsedRow = {
  extraction: Extraction;
  rich: RichMetrics;
  anchor: string;
};

export type ParsedSpreadsheet = {
  platform: Platform;
  fileName: string;
  rows: ParsedRow[];
  dropped: number; // 因开播时间不可解析而跳过的行（合计/空行/异常）
};

/** 比率类语义键：原始可能是小数(0.123)或百分数字符串("12.3%")，统一归一为百分数(12.3)。 */
const RATE_KEYS: ReadonlySet<keyof RichMetrics> = new Set([
  "clickRate",
  "conversionRate",
  "refundRate",
  "payRate",
  "oldFanViewShare",
]);

/** 镜像进 Extraction.metrics 的「头条级」富键，供旧版明细表/Stats.metrics 直接展示。 */
const METRIC_MIRROR_KEYS: (keyof RichMetrics)[] = [
  "viewers",
  "viewCount",
  "avgOnline",
  "peakOnline",
  "avgWatchMinutes",
  "conversionRate",
  "refundRate",
  "newFollowers",
  "clickRate",
  "payRate",
  "orders",
  "items",
];

type Scalar = string | number | Date | null;

/** 把 ExcelJS 单元格联合类型一次性收窄为干净标量。 */
function readScalar(v: unknown): Scalar {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return readScalar(o.result);
    if (typeof o.text === "string") return o.text;
  }
  return null;
}

/** 全/半角括号与空白归一，避免表头宽度差异导致匹配失败。 */
function norm(s: string): string {
  return s.replace(/（/g, "(").replace(/）/g, ")").replace(/\s+/g, "").trim();
}

/** 数值字段：剥 ¥ , % 万 等修饰，返回纯数字；无法解析返回 undefined。 */
function toNumber(v: Scalar): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const raw = String(v).trim();
  if (!raw || raw === "-" || raw === "—") return undefined;
  const wan = /万$/.test(raw);
  const cleaned = raw.replace(/[¥￥,，%\s]/g, "");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]) * (wan ? 10000 : 1);
  return Number.isFinite(n) ? n : undefined;
}

/** 比率字段：小数(≤1)→×100，百分数字符串→取数字，已是百分数(>1)→原样。返回百分数。 */
function toPercent(v: Scalar): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? (v <= 1 ? v * 100 : v) : undefined;
  const s = String(v).trim();
  if (!s || s === "-") return undefined;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  return Number(m[0]);
}

/**
 * 开播时间单元格 → {date, time}。支持三种返回形态：
 *  - JS Date（ExcelJS 对日期格式单元格可能给出）
 *  - Excel 序列号（数字）
 *  - 字符串（"2026/06/03 20:00:22" / "2026-06-08 14:00:05"）
 * 跨午夜场次按「开播日」记，故只用开始时间列。
 */
function readDateTimeCell(v: Scalar): { date: string; time: string } | null {
  if (v == null) return null;
  if (v instanceof Date) {
    return {
      date: `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`,
      time: `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`,
    };
  }
  if (typeof v === "number") {
    // Excel 序列号 → UTC
    const ms = Math.round((v - 25569) * 86400 * 1000);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return {
      date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    };
  }
  const m = String(v).match(
    /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
    time: `${(m[4] ?? "0").padStart(2, "0")}:${m[5] ?? "00"}`,
  };
}

type HeaderMap = Map<string, number>;

/** 扫描前若干行，定位含「直播开始时间」的表头行并建立 表头→列号 映射。 */
function scanHeader(
  getRowValues: (rowNum: number) => Scalar[],
  rowCount: number,
): { rowNum: number; map: HeaderMap } | null {
  const max = Math.min(8, Math.max(rowCount, 0));
  for (let r = 1; r <= max; r++) {
    const values = getRowValues(r);
    const map: HeaderMap = new Map();
    let isHeader = false;
    for (let c = 1; c < values.length; c++) {
      const s = values[c];
      if (typeof s === "string") {
        const n = norm(s);
        if (n) map.set(n, c);
        if (n === "直播开始时间") isHeader = true;
      }
    }
    if (isHeader) return { rowNum: r, map };
  }
  return null;
}

function headersFor(map: ColumnMap, key: string): string[] {
  const v = map[key];
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function colOf(map: HeaderMap, header: string): number | undefined {
  const n = norm(header);
  return map.has(n) ? map.get(n) : undefined;
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const buf = await file.arrayBuffer();
  const wb = new Workbook();
  await wb.xlsx.load(buf);

  // 在所有工作表里找第一张能命中某平台 gmv 表头的数据表
  for (const ws of wb.worksheets) {
    const rowCount = ws.rowCount || 0;
    const getRowValues = (rowNum: number): Scalar[] => {
      const out: Scalar[] = [null]; // 1-indexed 占位
      ws.getRow(rowNum).eachCell({ includeEmpty: false }, (cell, colNumber) => {
        out[colNumber] = readScalar(cell.value);
      });
      return out;
    };
    const header = scanHeader(getRowValues, rowCount);
    if (!header) continue;

    const { platform, colMap } = detectPlatform(header.map);
    if (!platform) continue;

    const rows: ParsedRow[] = [];
    let dropped = 0;
    for (let r = header.rowNum + 1; r <= rowCount; r++) {
      const values = getRowValues(r);
      const startCol = colOf(header.map, colMap.startDateTime);
      const dt = startCol != null ? readDateTimeCell(values[startCol] ?? null) : null;
      if (!dt) {
        // 开播时间不可解析 → 合计/空行/异常行，跳过
        dropped += 1;
        continue;
      }
      const parsed = buildRow(platform, colMap, header.map, values, dt);
      if (!parsed) {
        dropped += 1;
        continue;
      }
      rows.push(parsed);
    }
    return { platform, fileName: file.name, rows, dropped };
  }

  throw new Error(`未在「${file.name}」中识别到直播间明细表（需含「直播开始时间」与成交/支付金额列）。`);
}

export async function parseSpreadsheetFiles(files: File[]): Promise<ParsedSpreadsheet[]> {
  const out: ParsedSpreadsheet[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) continue;
    out.push(await parseSpreadsheetFile(f));
  }
  return out;
}

/** 按平台 gmv 表头判定（抖音「直播间成交金额」/ 小红书「支付金额」）。 */
function detectPlatform(
  map: HeaderMap,
): { platform: Platform; colMap: ColumnMap } | { platform: null; colMap: null } {
  if (colOf(map, DOUYIN_COLUMN_MAP.gmv) != null && colOf(map, DOUYIN_COLUMN_MAP.refund) != null) {
    return { platform: "douyin", colMap: DOUYIN_COLUMN_MAP };
  }
  if (colOf(map, XHS_COLUMN_MAP.gmv) != null && colOf(map, XHS_COLUMN_MAP.refund) != null) {
    return { platform: "xiaohongshu", colMap: XHS_COLUMN_MAP };
  }
  return { platform: null, colMap: null };
}

/** 由一行单元格构造 Extraction + RichMetrics。 */
function buildRow(
  platform: Platform,
  colMap: ColumnMap,
  headerMap: HeaderMap,
  values: Scalar[],
  dt: { date: string; time: string },
): ParsedRow | null {
  const readNumKey = (key: string, rate: boolean): number | undefined => {
    let sum: number | undefined;
    for (const header of headersFor(colMap, key)) {
      const col = colOf(headerMap, header);
      if (col == null) continue;
      const n = rate ? toPercent(values[col] ?? null) : toNumber(values[col] ?? null);
      if (n == null) continue;
      sum = (sum ?? 0) + n;
    }
    return sum;
  };

  const anchorCol = colOf(headerMap, colMap.anchor);
  const anchorRaw = anchorCol != null ? values[anchorCol] : null;
  const anchor = (typeof anchorRaw === "string" ? anchorRaw.trim() : "") || "未知主播";

  const gmv = readNumKey("gmv", false) ?? 0;
  const refund = readNumKey("refund", false) ?? 0;

  const rich: RichMetrics = {};
  for (const key of Object.keys(colMap)) {
    if (
      key === "anchor" ||
      key === "startDateTime" ||
      key === "gmv" ||
      key === "refund"
    ) {
      continue;
    }
    const rate = RATE_KEYS.has(key as keyof RichMetrics);
    const n = readNumKey(key, rate);
    if (n != null) (rich as Record<string, number>)[key] = round2(n);
  }

  // 镜像头条级富键到 metrics（供旧版明细表/Stats.metrics）
  const metrics: Record<string, string | number> = {};
  for (const k of METRIC_MIRROR_KEYS) {
    const n = rich[k];
    if (n != null) metrics[k] = n;
  }

  const raw_text = `${anchor} ${dt.date} ${dt.time} GMV ${gmv} 退款 ${refund}`;

  let extraction: Extraction;
  try {
    extraction = ExtractionSchema.parse({
      platform,
      date: dt.date,
      start_time: dt.time,
      gmv,
      refund,
      metrics,
      raw_text,
    });
  } catch {
    return null;
  }

  return { extraction, rich, anchor };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
