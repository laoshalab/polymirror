import { useTheme } from "./ThemeProvider";
import { useT } from "../../i18n/I18nProvider";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggleSegment() {
  const { theme, setTheme } = useTheme();
  const t = useT();

  return (
    <div className="theme-segment" role="group" aria-label={t("theme.aria")}>
      <button
        type="button"
        className={`theme-segment-btn${theme === "light" ? " theme-segment-active" : ""}`}
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
      >
        <IconSun width={14} height={14} />
        {t("theme.light")}
      </button>
      <button
        type="button"
        className={`theme-segment-btn${theme === "dark" ? " theme-segment-active" : ""}`}
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
      >
        <IconMoon width={14} height={14} />
        {t("theme.dark")}
      </button>
    </div>
  );
}
