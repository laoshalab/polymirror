import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type LeaderFormData,
  formToPayload,
  validateLeader,
  apiPost,
  apiPut,
} from "../api/leaders";
import { useToast } from "./ui/Toast";
import { useT } from "../i18n/I18nProvider";

interface Props {
  initial: LeaderFormData;
  isEdit?: boolean;
}

export function LeaderForm({ initial, isEdit }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<LeaderFormData>(initial);
  const [validateMsg, setValidateMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = formToPayload(form);
      if (isEdit) {
        return apiPut(`/api/leaders/${encodeURIComponent(form.id)}`, payload);
      }
      return apiPost("/api/leaders", payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leaders"] });
      void queryClient.invalidateQueries({ queryKey: ["leader", form.id] });
      toast(t("leaders.savedParams"), "success");
      navigate("/leaders");
    },
    onError: (e: Error) => {
      setError(e.message);
      toast(e.message, "error");
    },
  });

  async function onValidate() {
    setValidateMsg(null);
    setError(null);
    try {
      const r = await validateLeader(form);
      if (r.valid) {
        const addr = r.resolvedAddress ? ` → ${r.resolvedAddress.slice(0, 10)}…` : "";
        setValidateMsg(`✓ ${t("leaders.validateOk")} ${r.trades}${addr}`);
      } else {
        setValidateMsg(r.error ?? t("leaders.validateFail"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function set<K extends keyof LeaderFormData>(key: K, value: LeaderFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <form
      className="form-panel"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      {error && <div className="alert alert-error">{error}</div>}

      <label className="form-label">
        {t("leaders.leaderIdLabel")}
        <input
          type="text"
          value={form.id}
          disabled={isEdit}
          onChange={(e) => set("id", e.target.value)}
          placeholder="whale_a"
          required
          pattern="[a-zA-Z0-9_-]+"
        />
      </label>

      <fieldset className="form-fieldset">
        <legend>{t("leaders.identMode")}</legend>
        <label>
          <input
            type="radio"
            checked={form.mode === "address"}
            onChange={() => set("mode", "address")}
          />
          {t("leaders.modeAddress")}
        </label>
        <label>
          <input
            type="radio"
            checked={form.mode === "username"}
            onChange={() => set("mode", "username")}
          />
          {t("leaders.modeUsername")}
        </label>
      </fieldset>

      {form.mode === "address" ? (
        <label className="form-label">
          {t("leaders.addressLabel")}
          <input
            type="text"
            className="mono"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="0x..."
            required
          />
        </label>
      ) : (
        <label className="form-label">
          {t("leaders.usernameLabel")}
          <input
            type="text"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="polymarket-handle"
            required
          />
        </label>
      )}

      <button type="button" className="secondary" onClick={onValidate}>
        {t("leaders.validateBtn")}
      </button>
      {validateMsg && <p className="validate-msg">{validateMsg}</p>}

      <div className="form-row">
        <label className="form-label">
          {t("leaders.strategyType")}
          <select
            value={form.strategyType}
            onChange={(e) =>
              set("strategyType", e.target.value as LeaderFormData["strategyType"])
            }
          >
            <option value="PERCENTAGE">PERCENTAGE (%)</option>
            <option value="FIXED">FIXED (USD)</option>
            <option value="ADAPTIVE">ADAPTIVE</option>
          </select>
        </label>
        <label className="form-label">
          {form.strategyType === "PERCENTAGE" ? t("leaders.ratioLabel") : t("leaders.copyUsd")}
          <input
            type="number"
            step="0.1"
            min="0.01"
            value={form.copySize}
            onChange={(e) => set("copySize", parseFloat(e.target.value) || 0)}
            required
          />
        </label>
        <label className="form-label">
          {t("leaders.capLabel")}
          <input
            type="number"
            step="1"
            min="1"
            value={form.maxOrderUsd}
            onChange={(e) => set("maxOrderUsd", e.target.value)}
            placeholder="20"
            required
          />
        </label>
        <label className="form-label">
          weight
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={form.weight}
            onChange={(e) => set("weight", parseFloat(e.target.value) || 1)}
            required
          />
        </label>
      </div>

      <label className="form-check">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        {t("leaders.enableCopy")}
      </label>

      <details className="form-advanced" open={isEdit}>
        <summary>{t("leaders.advancedLimits")}</summary>
        <div className="form-row">
          <label className="form-label">
            max_position_usd
            <input
              type="number"
              step="1"
              min="1"
              value={form.maxPositionUsd}
              onChange={(e) => set("maxPositionUsd", e.target.value)}
              placeholder={t("common.none")}
            />
          </label>
          <label className="form-label">
            max_daily_volume_usd
            <input
              type="number"
              step="1"
              min="1"
              value={form.maxDailyVolumeUsd}
              onChange={(e) => set("maxDailyVolumeUsd", e.target.value)}
              placeholder={t("common.none")}
            />
          </label>
          <label className="form-label">
            min_price
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.minPrice}
              onChange={(e) => set("minPrice", e.target.value)}
            />
          </label>
          <label className="form-label">
            max_price
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.maxPrice}
              onChange={(e) => set("maxPrice", e.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          <span className="form-label">{t("leaders.tradeSides")}</span>
          <label className="form-check">
            <input
              type="checkbox"
              checked={form.sideBuy}
              onChange={(e) => set("sideBuy", e.target.checked)}
            />
            BUY
          </label>
          <label className="form-check">
            <input
              type="checkbox"
              checked={form.sideSell}
              onChange={(e) => set("sideSell", e.target.checked)}
            />
            SELL
          </label>
        </div>
      </details>

      <div className="form-actions">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? t("common.processing") : isEdit ? t("leaders.saveEdit") : t("leaders.addSubmit")}
        </button>
        <button type="button" className="secondary" onClick={() => navigate("/leaders")}>
          {t("common.cancel")}
        </button>
      </div>

      <p className="muted form-hint">{t("leaders.saveHint")}</p>
    </form>
  );
}
