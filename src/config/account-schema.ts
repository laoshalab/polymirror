import { z } from "zod";
import { Wallet } from "@ethersproject/wallet";

const ACCOUNT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizePrivateKey(raw: string): string | null {
  const s = raw.trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(s)) return s;
  if (/^[a-fA-F0-9]{64}$/.test(s)) return `0x${s}`;
  return null;
}

export const createAccountSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(ACCOUNT_ID_RE, "id: letters, numbers, _ and - only"),
    label: z.string().max(64).optional(),
    privateKey: z.string().min(1),
    address: z.string().regex(ADDRESS_RE, "Invalid proxy address (0x + 40 hex)"),
    signatureType: z.number().int().min(0).max(3).optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    const pk = normalizePrivateKey(data.privateKey);
    if (!pk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid private key (64 hex chars, 0x optional)",
        path: ["privateKey"],
      });
      return;
    }
    try {
      const eoa = new Wallet(pk).address.toLowerCase();
      const proxy = data.address.toLowerCase();
      const sig = data.signatureType ?? (proxy !== eoa ? 1 : 0);
      if (proxy !== eoa && sig === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Proxy address differs from EOA; set signatureType to 1 for Polymarket proxy wallet",
          path: ["signatureType"],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid private key",
        path: ["privateKey"],
      });
    }
  });

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    label: z.string().max(64).optional(),
    enabled: z.boolean().optional(),
    address: z.string().regex(ADDRESS_RE, "Invalid proxy address (0x + 40 hex)").optional(),
    privateKey: z.string().optional(),
    signatureType: z.number().int().min(0).max(3).optional(),
  })
  .superRefine((data, ctx) => {
    const pkRaw = data.privateKey?.trim();
    if (!pkRaw) return;
    const pk = normalizePrivateKey(pkRaw);
    if (!pk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid private key (64 hex chars, 0x optional)",
        path: ["privateKey"],
      });
    }
  });

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export function resolvedSignatureType(input: CreateAccountInput): number {
  const pk = normalizePrivateKey(input.privateKey)!;
  const eoa = new Wallet(pk).address.toLowerCase();
  if (input.signatureType !== undefined) return input.signatureType;
  return input.address.toLowerCase() !== eoa ? 1 : 0;
}

export function resolvedSignatureTypeForWallet(
  privateKey: string,
  proxyAddress: string,
  explicit?: number
): number {
  const pk = normalizePrivateKey(privateKey);
  if (!pk) throw new Error("Invalid private key");
  const eoa = new Wallet(pk).address.toLowerCase();
  if (explicit !== undefined) return explicit;
  return proxyAddress.toLowerCase() !== eoa ? 1 : 0;
}
