import { DEFAULT_MODELS, DEFAULTS, STORAGE_KEYS } from "../config/constants";

export type Settings = {
  visionModel: string;
  textModel: string;
  consensusDraws: number;
  concurrency: number;
};

const DEFAULT_SETTINGS: Settings = {
  visionModel: DEFAULT_MODELS.vision,
  textModel: DEFAULT_MODELS.text,
  consensusDraws: DEFAULTS.consensusDraws,
  concurrency: DEFAULTS.concurrency,
};

function ls(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function getApiKey(): string {
  return ls()?.getItem(STORAGE_KEYS.apiKey) ?? "";
}

export function setApiKey(key: string): void {
  ls()?.setItem(STORAGE_KEYS.apiKey, key.trim());
}

export function getSettings(): Settings {
  const raw = ls()?.getItem(STORAGE_KEYS.settings);
  if (raw) {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* ignore corrupt json */
    }
  }
  return { ...DEFAULT_SETTINGS };
}

export function setSettings(s: Settings): void {
  ls()?.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
}
