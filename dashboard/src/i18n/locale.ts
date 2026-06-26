export type Locale = "zh" | "en" | "zh-TW" | "ja" | "ko";

export const LOCALES: { id: Locale; label: string; native: string }[] = [
  { id: "zh", label: "简体中文", native: "简体中文" },
  { id: "en", label: "English", native: "English" },
  { id: "zh-TW", label: "繁體中文", native: "繁體中文" },
  { id: "ja", label: "日本語", native: "日本語" },
  { id: "ko", label: "한국어", native: "한국어" },
];

const STORAGE_KEY = "polymirror_locale";

export function getStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LOCALES.some((l) => l.id === v) ? (v as Locale) : null;
  } catch {
    return null;
  }
}

export function getBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "zh";
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk")) return "zh-TW";
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("en")) return "en";
  return "zh";
}

export function getInitialLocale(): Locale {
  return getStoredLocale() ?? getBrowserLocale();
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function applyLocale(locale: Locale): void {
  document.documentElement.lang =
    locale === "zh-TW" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : locale;
}

function deepGet(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`
  );
}

export function translate(
  messages: unknown,
  fallback: unknown,
  key: string,
  vars?: Record<string, string | number>
): string {
  const raw = deepGet(messages, key) ?? deepGet(fallback, key) ?? key;
  return interpolate(raw, vars);
}
