import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearToken,
  fetchAccounts,
  getActiveAccountId,
  setActiveAccountId,
  type AccountSummary,
} from "../api/client";
import { useT } from "../i18n/I18nProvider";
import { GlobalStatusBar } from "./GlobalStatusBar";
import { LanguageSwitcher } from "./ui/LanguageSwitcher";
import { ThemeToggleSegment } from "./ui/ThemeToggle";
import {
  IconAccount,
  IconActivity,
  IconClose,
  IconDiscover,
  IconDocs,
  IconLeaders,
  IconLogo,
  IconMenu,
  IconOrders,
  IconOverview,
  IconPositions,
  IconRisk,
  IconSettings,
} from "./ui/icons";

function AccountSwitcher({
  accounts,
  activeId,
  onChange,
}: {
  accounts: AccountSummary[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const active = accounts.find((a) => a.id === activeId);
  return (
    <div className="account-switcher">
      <label className="account-switcher-label" htmlFor="account-select">
        {t("layout.tradingAccount")}
      </label>
      <select
        id="account-select"
        value={activeId}
        onChange={(e) => onChange(e.target.value)}
        className="account-select"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label || a.id}
            {a.previewMode ? t("layout.previewSuffix") : t("layout.liveSuffix")}
            {!a.enabled ? t("layout.disabledSuffix") : ""}
          </option>
        ))}
      </select>
      {active && (
        <div className="account-switcher-meta">
          <span className={`status-dot ${active.previewMode ? "status-dot-preview" : "status-dot-live"}`} />
          <span className="mono account-addr">
            {active.walletAddress.slice(0, 6)}…{active.walletAddress.slice(-4)}
          </span>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeId = getActiveAccountId();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navGroups = useMemo(
    () => [
      {
        label: t("nav.workspace"),
        items: [
          { to: "/", end: true, label: t("nav.overview"), icon: IconOverview },
          { to: "/activity", label: t("nav.activity"), icon: IconActivity },
        ],
      },
      {
        label: t("nav.trading"),
        items: [
          { to: "/discover", label: t("nav.discover"), icon: IconDiscover },
          { to: "/leaders", label: t("nav.leaders"), icon: IconLeaders },
          { to: "/positions", label: t("nav.positions"), icon: IconPositions },
          { to: "/orders", label: t("nav.orders"), icon: IconOrders },
        ],
      },
      {
        label: t("nav.system"),
        items: [
          { to: "/account", label: t("nav.account"), icon: IconAccount },
          { to: "/risk", label: t("nav.risk"), icon: IconRisk },
          { to: "/settings", label: t("nav.settings"), icon: IconSettings },
          { to: "/docs", label: t("nav.docs"), icon: IconDocs },
        ],
      },
    ],
    [t]
  );

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    refetchInterval: 15000,
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const defaultId = accountsQuery.data?.defaultAccountId ?? "default";
  const currentId =
    activeId && accounts.some((a) => a.id === activeId) ? activeId : defaultId;

  useEffect(() => {
    if (accountsQuery.isSuccess && currentId && currentId !== activeId) {
      setActiveAccountId(currentId);
    }
  }, [accountsQuery.isSuccess, currentId, activeId]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  function switchAccount(id: string) {
    setActiveAccountId(id);
    void queryClient.invalidateQueries();
  }

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <button
        type="button"
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label={sidebarOpen ? t("common.closeMenu") : t("common.openMenu")}
      >
        {sidebarOpen ? <IconClose width={22} height={22} /> : <IconMenu width={22} height={22} />}
      </button>

      <div
        className="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />

      <aside className="sidebar">
        <div className="sidebar-brand">
          <IconLogo className="sidebar-logo" width={32} height={32} />
          <div>
            <div className="sidebar-brand-name">PolyMirror</div>
            <div className="sidebar-brand-tag">{t("layout.tagline")}</div>
          </div>
        </div>

        {accounts.length > 0 && (
          <AccountSwitcher accounts={accounts} activeId={currentId} onChange={switchAccount} />
        )}

        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={"end" in item ? item.end : false}
                    className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}
                  >
                    <Icon className="nav-item-icon" width={18} height={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <LanguageSwitcher />
          <ThemeToggleSegment />
          <button type="button" className="btn-ghost" onClick={logout}>
            {t("layout.logout")}
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <GlobalStatusBar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
