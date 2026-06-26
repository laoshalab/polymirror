import { apiPost } from "./leaders";

export const cancelPendingOrder = (orderId: string) =>
  apiPost<{ ok: boolean; orderId: string; message: string }>(
    `/api/orders/${encodeURIComponent(orderId)}/cancel`,
    {}
  );
