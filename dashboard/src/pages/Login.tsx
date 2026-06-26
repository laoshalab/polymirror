import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, clearToken, fetchAccounts, getToken, setActiveAccountId, setToken } from "../api/client";
import { IconLogo } from "../components/ui/icons";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import { ThemeToggleSegment } from "../components/ui/ThemeToggle";
import { useT } from "../i18n/I18nProvider";

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [token, setTokenInput] = useState("");
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ authRequired: boolean }>("/api/auth/config")
      .then((c) => {
        setAuthRequired(c.authRequired);
        if (!c.authRequired) {
          navigate("/", { replace: true });
        }
      })
      .catch(() => setAuthRequired(false));
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setToken(token.trim());
    try {
      const data = await fetchAccounts();
      setActiveAccountId(data.defaultAccountId);
      navigate("/", { replace: true });
    } catch {
      clearToken();
      setError(t("login.invalidToken"));
    }
  }

  const controls = (
    <div className="login-controls">
      <ThemeToggleSegment />
      <LanguageSwitcher />
    </div>
  );

  if (authRequired === null) {
    return (
      <div className="login-page">
        {controls}
        <div className="login-bg-grid" aria-hidden />
        <div className="login-box login-loading">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
        </div>
      </div>
    );
  }

  if (!authRequired) return null;

  return (
    <div className="login-page">
      {controls}
      <div className="login-bg-grid" aria-hidden />
      <div className="login-glow login-glow-a" aria-hidden />
      <div className="login-glow login-glow-b" aria-hidden />

      <form className="login-box" onSubmit={submit}>
        <div className="login-brand">
          <IconLogo width={40} height={40} />
          <div>
            <h1>PolyMirror</h1>
            <p className="login-tagline">{t("login.tagline")}</p>
          </div>
        </div>

        <p className="login-desc">{t("login.desc")}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label className="form-label">
          {t("login.tokenLabel")}
          <input
            type="password"
            placeholder={t("login.tokenPlaceholder")}
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </label>

        <button type="submit" className="btn-primary btn-block">
          {t("login.submit")}
        </button>
      </form>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiFetch<{ authRequired: boolean }>("/api/auth/config")
      .then((c) => {
        if (c.authRequired && !getToken()) {
          navigate("/login", { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true));
  }, [navigate]);

  if (!ready) {
    return (
      <div className="auth-loading">
        <div className="skeleton skeleton-title" />
      </div>
    );
  }
  return <>{children}</>;
}
