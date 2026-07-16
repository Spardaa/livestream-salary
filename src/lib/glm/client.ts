import { DEFAULTS, GLM_ENDPOINT } from "../../config/constants";
import { getApiKey } from "../storage";

export class GlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GlmError";
    this.status = status;
  }
}

/** 自上次 reset 以来累计遇到的 429 响应次数（含已被重试成功的），供前端提示。 */
let rateLimitedCount = 0;
export function getRateLimited(): number {
  return rateLimitedCount;
}
export function resetRateLimited(): void {
  rateLimitedCount = 0;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export type ChatParams = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
};

const MAX_RETRIES = 3;

/** 指数退避（含抖动），单位 ms。 */
function backoffMs(attempt: number): number {
  const base = 800 * 2 ** attempt; // 800 / 1600 / 3200
  const jitter = Math.random() * 400;
  return Math.min(base + jitter, 8000);
}

/** 可中断的延时；signal 取消时以 GlmError reject。 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const giveUp = () => reject(new GlmError("请求超时或被取消。"));
    if (signal?.aborted) return giveUp();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); giveUp(); }, { once: true });
  });
}

/**
 * 调 GLM chat/completions，返回 message.content 字符串。
 * 对 429（限速）/ 5xx / 瞬时网络错误自动指数退避重试（≤ MAX_RETRIES 次），
 * 让高并发抽取遇到限速时自动吸收，而非直接掉图。
 */
export async function chat(params: ChatParams): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new GlmError("未设置 API Key，请先在「设置」里填入。");

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? 4096,
    thinking: { type: "disabled" },
  };
  if (params.jsonMode) body.response_format = { type: "json_object" };

  const userCancelled = () => params.signal?.aborted === true;
  const buildErr = (status: number, txt: string) => {
    const hint =
      status === 401
        ? "API Key 无效或未授权。"
        : status === 404
          ? "模型 ID 不存在，请在「设置」里改为账号可用的模型（如文本 glm-5、视觉 glm-4.5v）。"
          : status === 429
            ? "请求过于频繁或额度不足，可在「设置」降低并发数。"
            : "";
    return new GlmError(
      `GLM 请求失败 ${status}${hint ? "：" + hint : ""}\n${txt.slice(0, 300)}`,
      status,
    );
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULTS.requestTimeoutMs);
    if (params.signal) {
      params.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }

    try {
      const res = await fetch(GLM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw new GlmError("GLM 返回内容为空：" + JSON.stringify(data).slice(0, 300));
        }
        return content;
      }

      // 429 / 5xx：可重试
      const is429 = res.status === 429;
      if (is429) rateLimitedCount += 1;
      const retryable = is429 || res.status >= 500;
      if (retryable && attempt < MAX_RETRIES && !userCancelled()) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : backoffMs(attempt);
        await sleep(wait, params.signal);
        continue;
      }
      const txt = await res.text().catch(() => "");
      throw buildErr(res.status, txt);
    } catch (e) {
      if (e instanceof GlmError) throw e; // 终态：不可重试状态码 / 空内容 / 用户取消
      if (e instanceof DOMException && e.name === "AbortError") {
        // 用户取消 或 单次 90s 超时：不重试
        throw new GlmError("请求超时或被取消。");
      }
      // 其它瞬时网络错误：可重试
      if (attempt < MAX_RETRIES && !userCancelled()) {
        await sleep(backoffMs(attempt), params.signal);
        continue;
      }
      throw new GlmError(
        `网络请求失败（可能是 CORS 或网络）: ${(e as Error).message}。`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  // 理论不可达（循环内必有 return 或 throw）
  throw new GlmError("GLM 请求失败。");
}
