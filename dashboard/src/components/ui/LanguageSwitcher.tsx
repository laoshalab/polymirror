import { LOCALES, type Locale } from "../../i18n/locale";
import { useI18n } from "../../i18n/I18nProvider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="lang-switcher">
      <label className="lang-switcher-label" htmlFor="locale-select">
        {t("lang.aria")}
      </label>
      <select
        id="locale-select"
        className="lang-select"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("lang.aria")}
      >
        {LOCALES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.native}
          </option>
        ))}
      </select>
    </div>
  );
}
