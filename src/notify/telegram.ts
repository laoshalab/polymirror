import { logError } from "./logger.js";
import { fetchWithTimeout } from "../util/fetch.js";

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  onCopy: boolean;
  onError: boolean;
  onKillSwitch: boolean;
}

export function loadTelegramConfig(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
    chatId: process.env.TELEGRAM_CHAT_ID?.trim() || undefined,
    onCopy: (process.env.TELEGRAM_ON_COPY ?? "true").toLowerCase() !== "false",
    onError: (process.env.TELEGRAM_ON_ERROR ?? "true").toLowerCase() !== "false",
    onKillSwitch: (process.env.TELEGRAM_ON_KILL_SWITCH ?? "true").toLowerCase() !== "false",
  };
}

export function isTelegramEnabled(cfg: TelegramConfig): boolean {
  return Boolean(cfg.botToken && cfg.chatId);
}

export async function sendTelegram(cfg: TelegramConfig, text: string): Promise<void> {
  if (!isTelegramEnabled(cfg)) return;

  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      logError("Telegram send failed", { status: res.status });
    }
  } catch (e) {
    logError("Telegram send error", { error: e instanceof Error ? e.message : String(e) });
  }
}

export function notifyTelegram(cfg: TelegramConfig, text: string): void {
  void sendTelegram(cfg, text);
}

export class TelegramNotifier {
  constructor(private readonly cfg: TelegramConfig) {}

  copy(message: string): void {
    if (this.cfg.onCopy) notifyTelegram(this.cfg, message);
  }

  error(message: string): void {
    if (this.cfg.onError) notifyTelegram(this.cfg, `⚠️ ${message}`);
  }

  killSwitch(message: string): void {
    if (this.cfg.onKillSwitch) notifyTelegram(this.cfg, `🛑 Kill Switch: ${message}`);
  }
}
