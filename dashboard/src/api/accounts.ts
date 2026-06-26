import { apiPatch, apiPost } from "./leaders";
import type { AccountSummary } from "./client";

export interface CreateAccountPayload {
  id: string;
  label?: string;
  privateKey: string;
  address: string;
  signatureType?: number;
  enabled?: boolean;
}

export interface CreateAccountResponse {
  ok: boolean;
  account?: AccountSummary;
  message?: string;
  restartHint?: string;
  error?: string;
  details?: { path: string; message: string }[];
}

export function createAccount(payload: CreateAccountPayload) {
  return apiPost<CreateAccountResponse>("/api/accounts", payload);
}

export interface UpdateAccountPayload {
  label?: string;
  enabled?: boolean;
  address?: string;
  privateKey?: string;
  signatureType?: number;
}

export interface UpdateAccountResponse {
  ok: boolean;
  account?: AccountSummary;
  message?: string;
  error?: string;
  details?: { path: string; message: string }[];
}

export function updateAccount(accountId: string, payload: UpdateAccountPayload) {
  return apiPatch<UpdateAccountResponse>(
    `/api/accounts/${encodeURIComponent(accountId)}`,
    payload
  );
}
