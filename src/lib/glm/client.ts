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

/** 调 GLM chat/completions，返回 message.content 字符串。 */
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
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const hint =
        res.status === 401
          ? "API Key 无效或未授权。"
          : res.status === 404
            ? "模型 ID 不存在，请在「设置」里改为账号可用的模型（如文本 glm-5、视觉 glm-4.5v）。"
            : res.status === 429
              ? "请求过于频繁或额度不足。"
              : "";
      throw new GlmError(
        `GLM 请求失败 ${res.status}${hint ? "：" + hint : ""}\n${txt.slice(0, 300)}`,
        res.status,
      );
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new GlmError("GLM 返回内容为空：" + JSON.stringify(data).slice(0, 300));
    }
    return content;
  } catch (e) {
    if (e instanceof GlmError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new GlmError("请求超时或被取消。");
    }
    // 网络/CORS 错误
    throw new GlmError(
      `网络请求失败（可能是 CORS 或网络）: ${(e as Error).message}。`,
    );
  } finally {
    clearTimeout(timer);
  }
}
