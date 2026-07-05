import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWalletProfile } from "../api/wallet";
import { formatUsd } from "../api/discover";
import {
  fetchAccounts,
  setActiveAccountId,
  getActiveAccountId,
  type AccountSummary,
} from "../api/client";
import { createAccount, updateAccount } from "../api/accounts";
import { SecretInput } from "../components/SecretInput";
import { AccountPnlChart } from "../components/AccountPnlChart";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { useT } from "../i18n/I18nProvider";
import { translateApiMessage } from "../i18n/apiMessages";

function fmtTime(ts: number) {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString();
}

function copyText(text: string, toastFn: (m: string) => void, copiedMsg: string) {
  void navigator.clipboard.writeText(text).then(() => toastFn(copiedMsg));
}

function maskAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function EditAccountPanel({
  account,
  onDone,
}: {
  account: AccountSummary;
  onDone: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState(account.label || account.id);
  const [enabled, setEnabled] = useState(account.enabled);
  const [address, setAddress] = useState(account.walletAddress);
  const [privateKey, setPrivateKey] = useState("");
  const [signatureType, setSignatureType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateAccount(account.id, {
        label: label.trim() || undefined,
        enabled,
        address: address.trim() !== account.walletAddress ? address.trim() : undefined,
        privateKey: privateKey.trim() || undefined,
        signatureType: signatureType !== "" ? parseInt(signatureType, 10) : undefined,
      }),
    onSuccess: (res) => {
      toast(
        res.message ? translateApiMessage(t, res.message) : t("account.accountUpdated"),
        "success"
      );
      setPrivateKey("");
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["status"] });
      if (res.account?.id === getActiveAccountId()) {
        setTimeout(onDone, 800);
      } else {
        setTimeout(onDone, 800);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="panel account-add-panel">
      <h3 className="account-card-title">{t("account.editTitle", { id: account.id })}</h3>
      <p className="muted form-hint">{t("account.editHint")}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-grid">
        <label>
          {t("account.labelDisplayName")}
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("account.placeholderLabel")}
          />
        </label>
        <label>
          {t("account.labelEnabled")}
          <select value={enabled ? "1" : "0"} onChange={(e) => setEnabled(e.target.value === "1")}>
            <option value="1">{t("account.optEnabled")}</option>
            <option value="0">{t("account.optDisabled")}</option>
          </select>
        </label>
        <label>
          {t("account.labelProxyAddress")}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className="mono"
            spellCheck={false}
          />
        </label>
        <label>
          {t("account.labelNewPrivateKey")}
          <SecretInput
            value={privateKey}
            onChange={setPrivateKey}
            placeholder={t("account.placeholderKeepEmpty")}
            autoComplete="new-password"
          />
        </label>
        <label>
          {t("account.labelSignatureType")}
          <select value={signatureType} onChange={(e) => setSignatureType(e.target.value)}>
            <option value="">{t("account.optKeepCurrent")}</option>
            <option value="0">{t("account.sigType0")}</option>
            <option value="1">{t("account.sigType1")}</option>
            <option value="2">{t("account.sigType2")}</option>
            <option value="3">{t("account.sigType3")}</option>
          </select>
        </label>
      </div>

      <div className="form-actions">
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("common.processing") : t("account.saveChanges")}
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function AddAccountPanel({ onDone }: { onDone: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [signatureType, setSignatureType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      createAccount({
        id: id.trim(),
        label: label.trim() || undefined,
        address: address.trim(),
        privateKey: privateKey.trim(),
        signatureType: signatureType !== "" ? parseInt(signatureType, 10) : undefined,
      }),
    onSuccess: (res) => {
      toast(
        res.message ? translateApiMessage(t, res.message) : t("account.accountCreated"),
        "success"
      );
      setPrivateKey("");
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      if (res.account?.id) {
        setActiveAccountId(res.account.id);
        void queryClient.invalidateQueries();
        onDone();
      } else {
        onDone();
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="panel account-add-panel">
      <h3 className="account-card-title">{t("account.addAccount")}</h3>
      <p className="muted form-hint">{t("account.addHint")}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-grid">
        <label>
          {t("account.labelAccountId")}
          <input
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            placeholder={t("account.placeholderAccountId")}
            pattern="[a-zA-Z0-9_-]+"
          />
          <span className="form-hint">{t("account.hintAccountIdEnv")}</span>
        </label>
        <label>
          {t("account.labelDisplayName")}
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("account.placeholderLabel")}
          />
        </label>
        <label>
          {t("account.labelProxyAddress")}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className="mono"
            spellCheck={false}
          />
        </label>
        <label>
          {t("account.labelPrivateKey")}
          <SecretInput
            value={privateKey}
            onChange={setPrivateKey}
            placeholder={t("account.placeholderPrivateKey")}
            autoComplete="new-password"
          />
        </label>
        <label>
          {t("account.labelSignatureType")}
          <select value={signatureType} onChange={(e) => setSignatureType(e.target.value)}>
            <option value="">{t("account.optAutoSig")}</option>
            <option value="0">{t("account.sigType0")}</option>
            <option value="1">{t("account.sigType1")}</option>
            <option value="2">{t("account.sigType2")}</option>
            <option value="3">{t("account.sigType3")}</option>
          </select>
        </label>
      </div>

      <div className="form-actions">
        <button
          type="button"
          disabled={save.isPending || !id || !address || !privateKey}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t("common.processing") : t("account.addAccount")}
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function AccountListCard({
  account,
  active,
  onSwitch,
  onEdit,
}: {
  account: AccountSummary;
  active: boolean;
  onSwitch: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <div className={`account-list-card ${active ? "account-list-card-active" : ""}`}>
      <div className="account-list-card-head">
        <strong>{account.label || account.id}</strong>
        {active && <span className="badge badge-preview">{t("account.badgeCurrent")}</span>}
        <span className={`badge ${account.previewMode ? "badge-preview" : "badge-live"}`}>
          {account.previewMode ? t("badge.previewShort") : t("badge.liveShort")}
        </span>
      </div>
      <div className="muted mono" style={{ fontSize: "0.85rem" }}>
        {maskAddr(account.walletAddress)}
      </div>
      <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.35rem" }}>
        {t("account.todayVolumeLeaders", {
          volume: `$${account.todayVolumeUsd.toFixed(2)}`,
          leaders: account.enabledLeaders.length,
        })}
        {!account.enabled && t("account.disabledSuffix")}
      </div>
      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className="secondary link-sm" onClick={onEdit}>
          {t("common.edit")}
        </button>
        {!active && (
          <button type="button" className="secondary link-sm" onClick={onSwitch}>
            {t("account.switchTo")}
          </button>
        )}
      </div>
    </div>
  );
}

export function AccountPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"polymarket" | "engine" | "trades">("polymarket");
  const [showAdd, setShowAdd] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const activeAccountId = getActiveAccountId();

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["wallet", activeAccountId],
    queryFn: fetchWalletProfile,
    refetchInterval: 30000,
  });

  const accounts = accountsQuery.data?.accounts ?? [];

  if (isLoading && !data) {
    return (
      <>
        <PageHeader title={t("account.title")} subtitle={t("account.loading")} />
        <div className="skeleton skeleton-title" style={{ maxWidth: 280 }} />
      </>
    );
  }

  if (isError && !data) {
    return (
      <>
        <PageHeader title={t("account.title")} />
        <div className="alert alert-error">{(error as Error)?.message ?? t("common.loadFailed")}</div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title={t("account.title")} />
        <div className="alert alert-error">{t("common.loadFailed")}</div>
      </>
    );
  }

  const displayName = data.profile?.userName
    ? `@${data.profile.userName.replace(/^@/, "")}`
    : `${data.address.slice(0, 6)}…${data.address.slice(-4)}`;

  const showPreviewMismatchHint =
    data.previewMode &&
    data.engine.localPositionCount > 0 &&
    data.portfolio.totalValueUsd === 0 &&
    data.polymarketPositions.length === 0;

  const showClobChainMismatch =
    !data.previewMode &&
    (data.clobCashUsd ?? 0) === 0 &&
    (data.chainCashUsd ?? 0) > 0 &&
    data.pusdAllowancesReady !== true;

  const showClobCacheDesync =
    !data.previewMode &&
    (data.clobCashUsd ?? 0) === 0 &&
    (data.chainCashUsd ?? 0) > 0 &&
    data.pusdAllowancesReady === true;

  const showLiveNoFunds =
    !data.previewMode &&
    (data.portfolio.cashUsd ?? 0) === 0 &&
    data.portfolio.totalValueUsd === 0;

  const showGeoblock =
    !data.previewMode && data.geoblock?.blocked === true;

  return (
    <>
      <PageHeader
        title={t("account.title")}
        subtitle={displayName}
        badges={
          <>
            {data.previewMode ? (
              <span className="badge badge-preview">{t("badge.previewShort")}</span>
            ) : (
              <span className="badge badge-live">{t("badge.liveShort")}</span>
            )}
          </>
        }
        actions={
          <>
            <button type="button" className="secondary" disabled={isFetching} onClick={() => refetch()}>
              {isFetching ? t("account.refreshing") : t("account.refresh")}
            </button>
            <button type="button" onClick={() => { setShowAdd((v) => !v); setEditingAccountId(null); }}>
              {showAdd ? t("account.closePanel") : t("account.addAccount")}
            </button>
          </>
        }
      />

      {showAdd && <AddAccountPanel onDone={() => setShowAdd(false)} />}

      {editingAccountId && (() => {
        const editing = accounts.find((a) => a.id === editingAccountId);
        if (!editing) return null;
        return (
          <EditAccountPanel
            account={editing}
            onDone={() => setEditingAccountId(null)}
          />
        );
      })()}

      {accounts.length > 0 && (
        <>
          <h2 className="section-title">{t("account.allAccounts", { count: accounts.length })}</h2>
          <div className="account-list-grid">
            {accounts.map((a) => (
              <AccountListCard
                key={a.id}
                account={a}
                active={a.id === (activeAccountId ?? accountsQuery.data?.defaultAccountId)}
                onSwitch={() => {
                  setActiveAccountId(a.id);
                  void queryClient.invalidateQueries();
                  toast(t("account.switched", { name: a.label || a.id }), "success");
                }}
                onEdit={() => {
                  setEditingAccountId(a.id);
                  setShowAdd(false);
                }}
              />
            ))}
          </div>
        </>
      )}

      {data.error && (
        <div className="alert alert-error">
          {data.error}
          {data.hint && <p className="muted" style={{ margin: "0.5rem 0 0" }}>{data.hint}</p>}
        </div>
      )}

      {data.collateralError && !data.error && (
        <div className="alert alert-warn">{data.collateralError}</div>
      )}

      {showPreviewMismatchHint && (
        <div className="alert alert-warn" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0 }}>{t("account.hintPreviewZero")}</p>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>{t("account.hintVerifyAddress")}</p>
        </div>
      )}

      {data.collateralSource === "chain" && (data.portfolio.cashUsd ?? 0) > 0 && data.previewMode && (
        <div className="alert alert-warn" style={{ marginBottom: "1rem" }}>
          {t("account.hintCollateralChain")}
        </div>
      )}

      {showGeoblock && data.geoblock && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          {t("account.hintGeoblock", {
            ip: data.geoblock.ip,
            country: data.geoblock.country,
            region: data.geoblock.region,
          })}
        </div>
      )}

      {showClobCacheDesync && (
        <div className="alert alert-warn" style={{ marginBottom: "1rem" }}>
          {t("account.hintClobCacheDesync", {
            amount: `$${(data.chainCashUsd ?? 0).toFixed(2)}`,
          })}
        </div>
      )}

      {showClobChainMismatch && (
        <div className="alert alert-warn" style={{ marginBottom: "1rem" }}>
          {t("account.hintClobChainMismatch", {
            amount: `$${(data.chainCashUsd ?? 0).toFixed(2)}`,
          })}
          {" "}
          <a href={data.polymarketUrl} target="_blank" rel="noreferrer" className="link-sm">
            polymarket.com ↗
          </a>
        </div>
      )}

      {showLiveNoFunds && !showClobChainMismatch && (
        <div className="alert alert-warn" style={{ marginBottom: "1rem" }}>
          {t("account.hintLiveNoFunds")}
        </div>
      )}

      {data.hint && !data.error && !showPreviewMismatchHint && !showClobChainMismatch && !showGeoblock && (
        <div className="alert alert-warn">{data.hint}</div>
      )}

      <div className="account-hero">
        <div className="account-profile-card panel">
          <div className="account-profile-top">
            {data.profile?.profileImage ? (
              <img src={data.profile.profileImage} alt="" className="trader-avatar-lg" />
            ) : (
              <div className="trader-avatar-lg trader-avatar-fallback account-avatar">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="account-profile-meta">
              <div className="account-name-row">
                <h2>{displayName}</h2>
                {data.previewMode ? (
                  <span className="badge badge-preview">{t("badge.previewShort")}</span>
                ) : (
                  <span className="badge badge-live">{t("badge.liveShort")}</span>
                )}
              </div>
              <div className="account-address-row">
                <span className="mono">{data.address}</span>
                <button
                  type="button"
                  className="link-sm"
                  onClick={() => copyText(data.address, (m) => toast(m, "success"), t("common.copied"))}
                >
                  {t("common.copy")}
                </button>
                <a href={data.polymarketUrl} target="_blank" rel="noreferrer" className="link-sm">
                  {t("account.polymarket")}
                </a>
              </div>
              {data.profile?.bio && <p className="muted trader-bio">{data.profile.bio}</p>}
            </div>
          </div>

          <h3 className="account-card-title">{t("account.chainSection")}</h3>
          {(data.clobCashUsd != null || data.chainCashUsd != null) &&
            ((data.clobCashUsd ?? 0) > 0 || (data.chainCashUsd ?? 0) > 0) && (
            <div className="account-stat-row account-stat-row-sub">
              <div className="account-stat">
                <div className="account-stat-label">{t("account.clobAvailable")}</div>
                <div className="account-stat-value">
                  ${(data.clobCashUsd ?? 0).toFixed(2)}
                </div>
              </div>
              <div className="account-stat">
                <div className="account-stat-label">{t("account.chainPusd")}</div>
                <div className="account-stat-value">
                  ${(data.chainCashUsd ?? 0).toFixed(2)}
                </div>
              </div>
            </div>
          )}
          <div className="account-stat-row">
            <div className="account-stat">
              <div className="account-stat-label">{t("account.cashUsdc")}</div>
              <div className="account-stat-value">
                {data.portfolio.cashUsd != null ? `$${data.portfolio.cashUsd.toFixed(2)}` : t("common.none")}
              </div>
            </div>
            <div className="account-stat">
              <div className="account-stat-label">{t("account.positionValue")}</div>
              <div className="account-stat-value">${data.portfolio.positionsValueUsd.toFixed(2)}</div>
            </div>
            <div className="account-stat">
              <div className="account-stat-label">{t("account.totalAssets")}</div>
              <div className="account-stat-value">${data.portfolio.totalValueUsd.toFixed(2)}</div>
            </div>
            <div className="account-stat">
              <div className="account-stat-label">{t("account.unrealizedPnl")}</div>
              <div
                className="account-stat-value"
                style={{ color: data.portfolio.unrealizedPnl >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {formatUsd(data.portfolio.unrealizedPnl)}
              </div>
            </div>
            <div className="account-stat">
              <div className="account-stat-label">{t("account.positionCount")}</div>
              <div className="account-stat-value">{data.portfolio.positionCount}</div>
            </div>
            {data.rankStats && (
              <div className="account-stat">
                <div className="account-stat-label">{t("account.monthPnl")}</div>
                <div className="account-stat-value">{formatUsd(data.rankStats.pnl)}</div>
              </div>
            )}
          </div>

          {data.previewMode && data.engine.localPositionCount > 0 && (
            <>
              <h3 className="account-card-title" style={{ marginTop: "1.25rem" }}>
                {t("account.previewSimSection")}
              </h3>
              <div className="account-stat-row">
                <div className="account-stat">
                  <div className="account-stat-label">{t("account.previewLocalPositions")}</div>
                  <div className="account-stat-value">{data.engine.localPositionCount}</div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-label">{t("account.previewExposure")}</div>
                  <div className="account-stat-value">${data.engine.localExposureUsd.toFixed(2)}</div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-label">{t("account.previewMarketValue")}</div>
                  <div className="account-stat-value">
                    {formatUsd(data.engine.simulatedPositionsValueUsd)}
                  </div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-label">{t("account.previewUnrealizedPnl")}</div>
                  <div
                    className="account-stat-value"
                    style={{
                      color:
                        data.engine.simulatedUnrealizedPnlUsd >= 0
                          ? "var(--green)"
                          : "var(--red)",
                    }}
                  >
                    {formatUsd(data.engine.simulatedUnrealizedPnlUsd)}
                  </div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-label">{t("account.previewPricedPositions")}</div>
                  <div className="account-stat-value">
                    {data.engine.simulatedPricedPositionCount}
                    {data.engine.simulatedUnpricedPositionCount > 0
                      ? ` / ${data.engine.simulatedUnpricedPositionCount} ${t("account.previewUnpricedSuffix")}`
                      : ""}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="account-actions">
            <Link to="/settings" className="btn-link">
              {t("account.walletSettings")}
            </Link>
            <Link to="/positions" className="secondary btn-link-inline">
              {t("account.enginePositions")}
            </Link>
          </div>
        </div>

        <AccountPnlChart />
      </div>

      <div className="account-pnl-card panel account-engine-strip">
        <h3 className="account-card-title">{t("account.engineToday")}</h3>
        <div className="account-stat-row">
          <div className="account-stat">
            <div className="account-stat-label">{t("account.copyCount")}</div>
            <div className="account-stat-value">{data.engine.todayCopyCount}</div>
          </div>
          <div className="account-stat">
            <div className="account-stat-label">{t("account.volume")}</div>
            <div className="account-stat-value">${data.engine.todayVolumeUsd.toFixed(2)}</div>
          </div>
          <div className="account-stat">
            <div className="account-stat-label">{t("account.realizedPnl")}</div>
            <div
              className="account-stat-value"
              style={{ color: data.engine.todayRealizedPnl >= 0 ? "var(--green)" : "var(--red)" }}
            >
              ${data.engine.todayRealizedPnl.toFixed(2)}
            </div>
          </div>
        </div>
        <p className="muted form-hint">
          DB: {data.engine.dbPath}
          {data.engine.killSwitchActive && t("account.killActive")}
        </p>
      </div>

      <div className="filter-pills" style={{ margin: "1rem 0" }}>
        <button
          type="button"
          className={`pill ${tab === "polymarket" ? "pill-active" : ""}`}
          onClick={() => setTab("polymarket")}
        >
          {t("account.tabPolymarket", { count: data.polymarketPositions.length })}
        </button>
        <button
          type="button"
          className={`pill ${tab === "engine" ? "pill-active" : ""}`}
          onClick={() => setTab("engine")}
        >
          {t("account.tabEngine", { count: data.localPositions.length })}
        </button>
        <button
          type="button"
          className={`pill ${tab === "trades" ? "pill-active" : ""}`}
          onClick={() => setTab("trades")}
        >
          {t("account.tabTrades")}
        </button>
      </div>

      <div className="panel panel-wide">
        {tab === "polymarket" && (
          <table>
            <thead>
              <tr>
                <th>{t("table.market")}</th>
                <th>{t("account.outcome")}</th>
                <th>{t("table.shares")}</th>
                <th>{t("table.avgPrice")}</th>
                <th>{t("account.currentPrice")}</th>
                <th>{t("account.value")}</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {data.polymarketPositions.map((p, i) => (
                <tr key={`${p.title}-${i}`}>
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.title ?? t("common.none")}
                    {p.redeemable && <span className="badge-following"> {t("account.redeemable")}</span>}
                  </td>
                  <td>{p.outcome ?? t("common.none")}</td>
                  <td>{p.size.toFixed(2)}</td>
                  <td>{p.avgPrice.toFixed(3)}</td>
                  <td>{p.curPrice != null ? p.curPrice.toFixed(3) : t("common.none")}</td>
                  <td>${p.currentValue.toFixed(2)}</td>
                  <td className={(p.cashPnl ?? 0) >= 0 ? "pnl-pos" : "pnl-neg"}>
                    {p.cashPnl != null ? `$${p.cashPnl.toFixed(2)}` : t("common.none")}
                    {p.percentPnl != null && ` (${p.percentPnl.toFixed(1)}%)`}
                  </td>
                </tr>
              ))}
              {!data.polymarketPositions.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t("account.emptyPolymarket")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "engine" && (
          <table>
            <thead>
              <tr>
                <th>{t("table.leader")}</th>
                <th>{t("table.token")}</th>
                <th>{t("table.shares")}</th>
                <th>{t("table.avgPrice")}</th>
                <th>{t("account.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {data.localPositions.map((p) => (
                <tr key={`${p.leaderId}-${p.tokenId}`}>
                  <td>{p.leaderId}</td>
                  <td className="mono">{p.tokenId.slice(0, 12)}…</td>
                  <td>{p.shares.toFixed(4)}</td>
                  <td>{p.avgEntryPrice.toFixed(4)}</td>
                  <td>${(p.shares * p.avgEntryPrice).toFixed(2)}</td>
                </tr>
              ))}
              {!data.localPositions.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    {t("account.emptyEngine")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "trades" && (
          <table>
            <thead>
              <tr>
                <th>{t("table.time")}</th>
                <th>{t("table.side")}</th>
                <th>{t("table.market")}</th>
                <th>{t("table.priceCol")}</th>
                <th>{t("table.shares")}</th>
                <th>{t("table.usd")}</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTrades.map((trade, i) => (
                <tr key={`${trade.timestamp}-${i}`}>
                  <td>{fmtTime(trade.timestamp)}</td>
                  <td>{trade.side ?? t("common.none")}</td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {trade.title ?? trade.outcome ?? t("common.none")}
                  </td>
                  <td>{trade.price != null ? trade.price.toFixed(3) : t("common.none")}</td>
                  <td>{trade.size != null ? trade.size.toFixed(2) : t("common.none")}</td>
                  <td>{trade.usdcSize != null ? `$${trade.usdcSize.toFixed(2)}` : t("common.none")}</td>
                </tr>
              ))}
              {!data.recentTrades.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t("account.noRecentTrades")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
