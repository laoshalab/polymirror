import { z } from "zod";

const tradeSide = z.enum(["BUY", "SELL"]);
const copyStrategy = z.enum(["PERCENTAGE", "FIXED", "ADAPTIVE"]);

export const leaderWriteSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, "id: letters, numbers, _ and - only"),
    mode: z.enum(["address", "username"]),
    address: z.string().optional(),
    username: z.string().optional(),
    enabled: z.boolean().default(true),
    weight: z.number().positive().default(1),
    strategy: z.object({
      type: copyStrategy,
      copySize: z.number().positive(),
    }),
    limits: z
      .object({
        maxOrderUsd: z.number().positive().optional(),
        maxPositionUsd: z.number().positive().optional(),
        maxDailyVolumeUsd: z.number().positive().optional(),
      })
      .optional(),
    filters: z
      .object({
        minPrice: z.number().min(0).max(1).optional(),
        maxPrice: z.number().min(0).max(1).optional(),
        sides: z.array(tradeSide).optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "address") {
      const addr = data.address?.trim() ?? "";
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid proxy address (0x + 40 hex chars)",
          path: ["address"],
        });
      }
    } else {
      const user = data.username?.replace(/^@/, "").trim() ?? "";
      if (!user) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Username is required",
          path: ["username"],
        });
      }
    }
  });

export type LeaderWriteInput = z.infer<typeof leaderWriteSchema>;

export function leaderWriteToYaml(input: LeaderWriteInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: input.id,
    enabled: input.enabled,
    weight: input.weight,
    strategy: {
      type: input.strategy.type,
      copy_size: input.strategy.copySize,
    },
  };

  if (input.mode === "address") {
    row.address = input.address!.trim();
  } else {
    row.username = input.username!.replace(/^@/, "").trim();
  }

  if (input.limits) {
    row.limits = {
      ...(input.limits.maxOrderUsd !== undefined && { max_order_usd: input.limits.maxOrderUsd }),
      ...(input.limits.maxPositionUsd !== undefined && {
        max_position_usd: input.limits.maxPositionUsd,
      }),
      ...(input.limits.maxDailyVolumeUsd !== undefined && {
        max_daily_volume_usd: input.limits.maxDailyVolumeUsd,
      }),
    };
  }

  if (input.filters) {
    row.filters = {
      ...(input.filters.minPrice !== undefined && { min_price: input.filters.minPrice }),
      ...(input.filters.maxPrice !== undefined && { max_price: input.filters.maxPrice }),
      ...(input.filters.sides !== undefined && { sides: input.filters.sides }),
    };
  }

  return row;
}

export const leaderPatchSchema = z.object({
  enabled: z.boolean().optional(),
  weight: z.number().positive().optional(),
  strategy: z
    .object({
      type: copyStrategy.optional(),
      copySize: z.number().positive().optional(),
    })
    .optional(),
  limits: z
    .object({
      maxOrderUsd: z.number().positive().optional(),
    })
    .optional(),
});

export type LeaderPatchInput = z.infer<typeof leaderPatchSchema>;

/** Merge dashboard PUT payload into existing YAML leader (preserve unset nested fields). */
export function mergeLeaderWrite(
  existing: Record<string, unknown>,
  row: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...existing,
    ...row,
    id: row.id ?? existing.id,
  };

  merged.strategy = {
    ...((existing.strategy as Record<string, unknown>) ?? {}),
    ...((row.strategy as Record<string, unknown>) ?? {}),
  };

  if (existing.limits || row.limits) {
    merged.limits = {
      ...((existing.limits as Record<string, unknown>) ?? {}),
      ...((row.limits as Record<string, unknown>) ?? {}),
    };
  }

  if (existing.filters || row.filters) {
    merged.filters = {
      ...((existing.filters as Record<string, unknown>) ?? {}),
      ...((row.filters as Record<string, unknown>) ?? {}),
    };
  }

  if (row.address) {
    delete merged.username;
  } else if (row.username) {
    delete merged.address;
  }

  return merged;
}

export function applyLeaderPatch(
  existing: Record<string, unknown>,
  patch: LeaderPatchInput
): Record<string, unknown> {
  const next = { ...existing };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.weight !== undefined) next.weight = patch.weight;
  if (patch.strategy) {
    const strategy = { ...(next.strategy as Record<string, unknown>) };
    if (patch.strategy.type !== undefined) strategy.type = patch.strategy.type;
    if (patch.strategy.copySize !== undefined) strategy.copy_size = patch.strategy.copySize;
    next.strategy = strategy;
  }
  if (patch.limits) {
    const limits = { ...((next.limits as Record<string, unknown>) ?? {}) };
    if (patch.limits.maxOrderUsd !== undefined) {
      limits.max_order_usd = patch.limits.maxOrderUsd;
    }
    next.limits = limits;
  }
  return next;
}
