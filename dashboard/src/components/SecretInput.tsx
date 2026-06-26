import { useState } from "react";
import { useT } from "../i18n/I18nProvider";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
}

export function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
  disabled,
}: Props) {
  const t = useT();
  const [visible, setVisible] = useState(false);

  return (
    <div className="secret-input-wrap">
      <input
        id={id}
        type={visible ? "text" : "password"}
        className="secret-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        spellCheck={false}
      />
      <button
        type="button"
        className="secret-toggle secondary"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? t("common.hide") : t("common.show")}
      >
        {visible ? t("common.hide") : t("common.show")}
      </button>
    </div>
  );
}
