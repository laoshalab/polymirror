import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyLocale,
  getInitialLocale,
  persistLocale,
  translate,
  type Locale,
} from "./locale";
import { messages, zh } from "./locales";

type Vars = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    applyLocale(locale);
    persistLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Vars) => translate(messages[locale], zh, key, vars),
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale: setLocaleState,
      t,
    }),
    [locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
