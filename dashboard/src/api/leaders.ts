import { getToken, clearToken, accountApi } from "./client";

async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(accountApi(path), { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }
  if (!res.ok) {
    const err = data as { error?: string; details?: { message: string }[] };
    const detail = err.details?.map((d) => d.message).join("; ");
    throw new Error(detail || err.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const apiGet = <T>(path: string) => apiRequest<T>(path);
export const apiPost = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = <T>(path: string) => apiRequest<T>(path, { method: "DELETE" });

export interface UnfollowLeaderResponse {
  ok: boolean;
  leaderId: string;
  message?: string;
  pendingCancelled?: number;
  pendingFailed?: number;
  positionsBefore?: number;
  positionsRemaining?: number;
  positionsKept?: number;
  liquidation?: {
    attempted: number;
    closed: number;
    pending: number;
    skipped: number;
    failed: number;
  };
}

export const unfollowLeader = (leaderId: string) =>
  apiDelete<UnfollowLeaderResponse>(`/api/leaders/${encodeURIComponent(leaderId)}`);

export interface LeaderFormData {
  id: string;
  mode: "address" | "username";
  address: string;
  username: string;
  enabled: boolean;
  weight: number;
  strategyType: "PERCENTAGE" | "FIXED" | "ADAPTIVE";
  copySize: number;
  maxOrderUsd: string;
  maxPositionUsd: string;
  maxDailyVolumeUsd: string;
  minPrice: string;
  maxPrice: string;
  sideBuy: boolean;
  sideSell: boolean;
}

export function leaderToForm(leader?: {
  id: string;
  address?: string;
  username?: string;
  enabled: boolean;
  weight: number;
  strategy: { type: string; copySize: number };
  limits?: { maxOrderUsd?: number; maxPositionUsd?: number; maxDailyVolumeUsd?: number };
  filters?: { minPrice?: number; maxPrice?: number; sides?: string[] };
}): LeaderFormData {
  const sides = leader?.filters?.sides ?? [];
  return {
    id: leader?.id ?? "",
    mode: leader?.username && !leader?.address ? "username" : "address",
    address: leader?.address ?? "",
    username: leader?.username ?? "",
    enabled: leader?.enabled ?? true,
    weight: leader?.weight ?? 1,
    strategyType: (leader?.strategy.type as LeaderFormData["strategyType"]) ?? "PERCENTAGE",
    copySize: leader?.strategy.copySize ?? 10,
    maxOrderUsd: leader?.limits?.maxOrderUsd?.toString() ?? "20",
    maxPositionUsd: leader?.limits?.maxPositionUsd?.toString() ?? "",
    maxDailyVolumeUsd: leader?.limits?.maxDailyVolumeUsd?.toString() ?? "",
    minPrice: leader?.filters?.minPrice?.toString() ?? "",
    maxPrice: leader?.filters?.maxPrice?.toString() ?? "",
    sideBuy: sides.length === 0 || sides.includes("BUY"),
    sideSell: sides.length === 0 || sides.includes("SELL"),
  };
}

export function formToPayload(form: LeaderFormData) {
  const payload: Record<string, unknown> = {
    id: form.id.trim(),
    mode: form.mode,
    enabled: form.enabled,
    weight: form.weight,
    strategy: {
      type: form.strategyType,
      copySize: form.copySize,
    },
  };
  if (form.mode === "address") {
    payload.address = form.address.trim();
  } else {
    payload.username = form.username.replace(/^@/, "").trim();
  }
  const limits: Record<string, number> = {
    maxOrderUsd: form.maxOrderUsd ? parseFloat(form.maxOrderUsd) : 20,
  };
  if (form.maxPositionUsd) limits.maxPositionUsd = parseFloat(form.maxPositionUsd);
  if (form.maxDailyVolumeUsd) limits.maxDailyVolumeUsd = parseFloat(form.maxDailyVolumeUsd);
  payload.limits = limits;

  const minP = form.minPrice ? parseFloat(form.minPrice) : undefined;
  const maxP = form.maxPrice ? parseFloat(form.maxPrice) : undefined;
  const sides: ("BUY" | "SELL")[] = [];
  if (form.sideBuy) sides.push("BUY");
  if (form.sideSell) sides.push("SELL");
  if (minP !== undefined || maxP !== undefined || sides.length > 0) {
    payload.filters = {
      ...(minP !== undefined && { minPrice: minP }),
      ...(maxP !== undefined && { maxPrice: maxP }),
      ...(sides.length > 0 && { sides }),
    };
  }
  return payload;
}

export interface ValidateResponse {
  valid: boolean;
  trades: number;
  resolvedAddress?: string;
  error?: string;
}

export async function validateLeader(form: LeaderFormData): Promise<ValidateResponse> {
  const params = new URLSearchParams();
  if (form.mode === "address") {
    params.set("address", form.address.trim());
  } else {
    params.set("username", form.username.replace(/^@/, "").trim());
  }
  return apiGet<ValidateResponse>(`/api/leaders/validate?${params}`);
}
