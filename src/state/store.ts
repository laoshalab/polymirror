import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_DB = "data/polymirror.db";

export type AuditAction = "DETECT" | "SKIP" | "COPY" | "ERROR";

export interface PendingOrderRow {
  orderId: string;
  leaderId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  filledShares: number;
  tradeKey: string;
  reasoning: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogRow {
  id: number;
  ts: number;
  leaderId: string | null;
  action: AuditAction;
  tokenId: string | null;
  side: string | null;
  size: number | null;
  price: number | null;
  reason: string | null;
  preview: boolean;
}

export interface PositionRow {
  leaderId: string;
  tokenId: string;
  shares: number;
  avgEntryPrice: number;
}

export interface DailyStatsRow {
  date: string;
  volumeUsd: number;
  realizedPnl: number;
  copyCount: number;
  killSwitch: number;
}

export interface LeaderDailyStatsRow {
  leaderId: string;
  volumeUsd: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export class StateStore {
  private db: Database.Database;

  constructor(path = DEFAULT_DB) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS seen_trades (
        key TEXT PRIMARY KEY,
        leader_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS positions (
        leader_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        shares REAL NOT NULL DEFAULT 0,
        avg_entry_price REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (leader_id, token_id)
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        leader_id TEXT,
        action TEXT NOT NULL,
        token_id TEXT,
        side TEXT,
        size REAL,
        price REAL,
        reason TEXT,
        preview INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        volume_usd REAL NOT NULL DEFAULT 0,
        realized_pnl REAL NOT NULL DEFAULT 0,
        copy_count INTEGER NOT NULL DEFAULT 0,
        kill_switch INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS leader_daily_stats (
        date TEXT NOT NULL,
        leader_id TEXT NOT NULL,
        volume_usd REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (date, leader_id)
      );
      CREATE TABLE IF NOT EXISTS buy_dedup (
        leader_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_buy_dedup ON buy_dedup(leader_id, token_id, created_at);
      CREATE TABLE IF NOT EXISTS pending_orders (
        order_id TEXT PRIMARY KEY,
        leader_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        filled_shares REAL NOT NULL DEFAULT 0,
        trade_key TEXT NOT NULL,
        reasoning TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pending_orders_leader ON pending_orders(leader_id);
    `);
    this.migrate();
  }

  private migrate(): void {
    const cols = this.db.prepare("PRAGMA table_info(positions)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "avg_entry_price")) {
      this.db.exec("ALTER TABLE positions ADD COLUMN avg_entry_price REAL NOT NULL DEFAULT 0");
    }
    const dailyCols = this.db.prepare("PRAGMA table_info(daily_stats)").all() as { name: string }[];
    if (!dailyCols.some((c) => c.name === "realized_pnl")) {
      this.db.exec("ALTER TABLE daily_stats ADD COLUMN realized_pnl REAL NOT NULL DEFAULT 0");
    }
  }

  hasSeen(key: string): boolean {
    return this.db.prepare("SELECT 1 FROM seen_trades WHERE key = ?").get(key) !== undefined;
  }

  markSeen(key: string, leaderId: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO seen_trades (key, leader_id, created_at) VALUES (?, ?, ?)")
      .run(key, leaderId, Date.now());
  }

  markSeenMany(keys: string[], leaderId: string): void {
    if (keys.length === 0) return;
    const unique = [...new Set(keys)];
    this.db.transaction(() => {
      for (const key of unique) {
        this.markSeen(key, leaderId);
      }
    })();
  }

  listSeenTrades(): { key: string; leaderId: string; createdAt: number }[] {
    return this.db
      .prepare(
        `SELECT key, leader_id AS leaderId, created_at AS createdAt FROM seen_trades ORDER BY created_at ASC`
      )
      .all() as { key: string; leaderId: string; createdAt: number }[];
  }

  /** Merge dedup keys from another store (e.g. preview → live on mode switch). */
  importSeenTradesFrom(source: StateStore): number {
    const rows = source.listSeenTrades();
    if (rows.length === 0) return 0;

    const stmt = this.db.prepare(
      "INSERT OR IGNORE INTO seen_trades (key, leader_id, created_at) VALUES (?, ?, ?)"
    );
    let imported = 0;
    this.db.transaction(() => {
      for (const row of rows) {
        const result = stmt.run(row.key, row.leaderId, row.createdAt);
        if (result.changes > 0) imported++;
      }
    })();
    return imported;
  }

  /**
   * Copy Preview engine positions into Live DB when empty for that leader+token.
   * Tracking only — on-chain wallet remains authoritative for SELL sizing.
   */
  importPositionsFrom(source: StateStore): number {
    const rows = source.listPositions();
    if (rows.length === 0) return 0;

    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO positions (leader_id, token_id, shares, avg_entry_price)
       VALUES (?, ?, ?, ?)`
    );
    let imported = 0;
    this.db.transaction(() => {
      for (const p of rows) {
        if (p.shares <= 0) continue;
        const result = stmt.run(p.leaderId, p.tokenId, p.shares, p.avgEntryPrice);
        if (result.changes > 0) imported++;
      }
    })();
    return imported;
  }

  getPosition(leaderId: string, tokenId: string): number {
    const row = this.db
      .prepare("SELECT shares FROM positions WHERE leader_id = ? AND token_id = ?")
      .get(leaderId, tokenId) as { shares: number } | undefined;
    return row?.shares ?? 0;
  }

  /** Cost basis (USD) of a leader's position: shares × average entry price. */
  getPositionCostUsd(leaderId: string, tokenId: string): number {
    const row = this.db
      .prepare(
        "SELECT shares, avg_entry_price FROM positions WHERE leader_id = ? AND token_id = ?"
      )
      .get(leaderId, tokenId) as { shares: number; avg_entry_price: number } | undefined;
    if (!row) return 0;
    return row.shares * row.avg_entry_price;
  }

  adjustPosition(leaderId: string, tokenId: string, deltaShares: number): void {
    const current = this.getPosition(leaderId, tokenId);
    const next = Math.max(0, Math.round((current + deltaShares) * 100) / 100);
    this.db
      .prepare(
        `INSERT INTO positions (leader_id, token_id, shares, avg_entry_price) VALUES (?, ?, ?, 0)
         ON CONFLICT(leader_id, token_id) DO UPDATE SET shares = excluded.shares`
      )
      .run(leaderId, tokenId, next);
  }

  /** Update position after a copy; returns realized PnL on SELL. */
  applyCopyFill(
    leaderId: string,
    tokenId: string,
    side: "BUY" | "SELL",
    shares: number,
    price: number
  ): number {
    const row = this.db
      .prepare("SELECT shares, avg_entry_price FROM positions WHERE leader_id = ? AND token_id = ?")
      .get(leaderId, tokenId) as { shares: number; avg_entry_price: number } | undefined;
    const current = row?.shares ?? 0;
    const avg = row?.avg_entry_price ?? 0;

    if (side === "BUY") {
      const nextShares = Math.round((current + shares) * 100) / 100;
      const nextAvg =
        nextShares > 0 ? (current * avg + shares * price) / nextShares : price;
      this.db
        .prepare(
          `INSERT INTO positions (leader_id, token_id, shares, avg_entry_price) VALUES (?, ?, ?, ?)
           ON CONFLICT(leader_id, token_id) DO UPDATE SET
             shares = excluded.shares,
             avg_entry_price = excluded.avg_entry_price`
        )
        .run(leaderId, tokenId, nextShares, nextAvg);
      return 0;
    }

    const sold = Math.min(current, shares);
    const pnl = Math.round((price - avg) * sold * 100) / 100;
    const nextShares = Math.max(0, Math.round((current - sold) * 100) / 100);
    this.db
      .prepare(
        `INSERT INTO positions (leader_id, token_id, shares, avg_entry_price) VALUES (?, ?, ?, ?)
         ON CONFLICT(leader_id, token_id) DO UPDATE SET
           shares = excluded.shares,
           avg_entry_price = CASE WHEN excluded.shares = 0 THEN 0 ELSE avg_entry_price END`
      )
      .run(leaderId, tokenId, nextShares, nextShares > 0 ? avg : 0);
    if (pnl !== 0) this.addRealizedPnl(pnl);
    return pnl;
  }

  countOpenMarkets(): number {
    const row = this.db
      .prepare("SELECT COUNT(DISTINCT token_id) AS c FROM positions WHERE shares > 0")
      .get() as { c: number };
    return row.c;
  }

  hasOpenPosition(tokenId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM positions WHERE token_id = ? AND shares > 0 LIMIT 1")
      .get(tokenId);
    return row !== undefined;
  }

  /** Sum shares held for a token across all leaders (single wallet). */
  getTotalTokenShares(tokenId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(shares), 0) AS total FROM positions WHERE token_id = ?")
      .get(tokenId) as { total: number };
    return row.total;
  }

  listOpenTokenIds(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT token_id FROM positions WHERE shares > 0")
      .all() as { token_id: string }[];
    return rows.map((r) => r.token_id);
  }

  upsertPendingOrder(entry: {
    orderId: string;
    leaderId: string;
    tokenId: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    filledShares: number;
    tradeKey: string;
    reasoning: string;
  }): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO pending_orders
         (order_id, leader_id, token_id, side, price, size, filled_shares, trade_key, reasoning, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(order_id) DO UPDATE SET
           filled_shares = excluded.filled_shares,
           updated_at = excluded.updated_at`
      )
      .run(
        entry.orderId,
        entry.leaderId,
        entry.tokenId,
        entry.side,
        entry.price,
        entry.size,
        entry.filledShares,
        entry.tradeKey,
        entry.reasoning,
        now,
        now
      );
  }

  listPendingOrders(): PendingOrderRow[] {
    const rows = this.db
      .prepare(
        `SELECT order_id AS orderId, leader_id AS leaderId, token_id AS tokenId, side,
                price, size, filled_shares AS filledShares, trade_key AS tradeKey,
                reasoning, created_at AS createdAt, updated_at AS updatedAt
         FROM pending_orders ORDER BY created_at ASC`
      )
      .all() as PendingOrderRow[];
    return rows.map((r) => ({
      ...r,
      side: r.side as "BUY" | "SELL",
    }));
  }

  countPendingOrders(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM pending_orders").get() as { c: number };
    return row.c;
  }

  updatePendingOrderFilled(orderId: string, filledShares: number): void {
    this.db
      .prepare(
        "UPDATE pending_orders SET filled_shares = ?, updated_at = ? WHERE order_id = ?"
      )
      .run(filledShares, Date.now(), orderId);
  }

  removePendingOrder(orderId: string): void {
    this.db.prepare("DELETE FROM pending_orders WHERE order_id = ?").run(orderId);
  }

  removeStalePendingOrders(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db
      .prepare("DELETE FROM pending_orders WHERE created_at < ?")
      .run(cutoff);
    return result.changes;
  }

  /** Apply a pending-order partial fill atomically (position, volume, audit). */
  recordPendingFill(entry: {
    leaderId: string;
    tokenId: string;
    side: "BUY" | "SELL";
    delta: number;
    price: number;
    auditReason: string;
    preview: boolean;
  }): void {
    this.commitPendingOrderProgress({
      orderId: "",
      matchedFilledShares: -1,
      fill: entry,
      remove: false,
      skipPendingRowUpdate: true,
    });
  }

  /**
   * Atomically apply pending fill (optional), update filled_shares or remove the row.
   * Prevents double-counting when fill and row state were previously separate writes.
   */
  commitPendingOrderProgress(entry: {
    orderId: string;
    matchedFilledShares: number;
    fill?: {
      leaderId: string;
      tokenId: string;
      side: "BUY" | "SELL";
      delta: number;
      price: number;
      auditReason: string;
      preview: boolean;
    };
    remove: boolean;
    skipPendingRowUpdate?: boolean;
    staleSkipAudit?: {
      leaderId: string;
      tokenId: string;
      side: "BUY" | "SELL";
      size: number;
      price: number;
      preview: boolean;
    };
  }): void {
    const {
      orderId,
      matchedFilledShares,
      fill,
      remove,
      skipPendingRowUpdate,
      staleSkipAudit,
    } = entry;

    this.db.transaction(() => {
      if (fill && fill.delta > 0) {
        const usd = fill.delta * fill.price;
        this.applyCopyFill(fill.leaderId, fill.tokenId, fill.side, fill.delta, fill.price);
        if (fill.side === "BUY") this.recordBuy(fill.leaderId, fill.tokenId);
        this.addDailyVolume(usd);
        this.addLeaderDailyVolume(fill.leaderId, usd);
        this.audit({
          leaderId: fill.leaderId,
          action: "COPY",
          tokenId: fill.tokenId,
          side: fill.side,
          size: fill.delta,
          price: fill.price,
          reason: fill.auditReason,
          preview: fill.preview,
        });
      }

      if (staleSkipAudit) {
        this.audit({
          leaderId: staleSkipAudit.leaderId,
          action: "SKIP",
          tokenId: staleSkipAudit.tokenId,
          side: staleSkipAudit.side,
          size: staleSkipAudit.size,
          price: staleSkipAudit.price,
          reason: "stale GTC cancelled on CLOB",
          preview: staleSkipAudit.preview,
        });
      }

      if (skipPendingRowUpdate) return;

      if (remove) {
        this.db.prepare("DELETE FROM pending_orders WHERE order_id = ?").run(orderId);
      } else {
        this.db
          .prepare(
            "UPDATE pending_orders SET filled_shares = ?, updated_at = ? WHERE order_id = ?"
          )
          .run(matchedFilledShares, Date.now(), orderId);
      }
    })();
  }

  /** Record a successful copy trade atomically (dedup, position, volume, audit). */
  recordCopySuccess(entry: {
    tradeKey?: string;
    tradeKeys?: string[];
    leaderId: string;
    tokenId: string;
    side: "BUY" | "SELL";
    filledShares: number;
    price: number;
    filledUsd: number;
    auditReason: string;
    preview: boolean;
  }): void {
    const {
      tradeKey,
      tradeKeys,
      leaderId,
      tokenId,
      side,
      filledShares,
      price,
      filledUsd,
      auditReason,
      preview,
    } = entry;
    const keys = tradeKeys ?? (tradeKey ? [tradeKey] : []);
    this.db.transaction(() => {
      for (const key of keys) {
        this.markSeen(key, leaderId);
      }
      this.applyCopyFill(leaderId, tokenId, side, filledShares, price);
      if (side === "BUY") this.recordBuy(leaderId, tokenId);
      this.addDailyVolume(filledUsd);
      this.addLeaderDailyVolume(leaderId, filledUsd);
      this.audit({
        leaderId,
        action: "COPY",
        tokenId,
        side,
        size: filledShares,
        price,
        reason: auditReason,
        preview,
      });
    })();
  }

  /**
   * Live: atomically mark trade keys seen, optional GTC pending row, and any immediate fill.
   * Prevents crash between CLOB accept and dedup/pending persistence.
   */
  recordLiveOrderAccepted(entry: {
    tradeKeys: string[];
    leaderId: string;
    tokenId: string;
    side: "BUY" | "SELL";
    price: number;
    orderSize: number;
    filledShares: number;
    filledUsd: number;
    auditReason: string;
    orderId?: string;
    pendingRemaining: number;
    trackPendingGtc: boolean;
  }): void {
    const {
      tradeKeys,
      leaderId,
      tokenId,
      side,
      price,
      orderSize,
      filledShares,
      filledUsd,
      auditReason,
      orderId,
      pendingRemaining,
      trackPendingGtc,
    } = entry;
    const primaryKey = tradeKeys[0] ?? "";
    const now = Date.now();

    this.db.transaction(() => {
      for (const key of [...new Set(tradeKeys)]) {
        this.markSeen(key, leaderId);
      }

      if (
        trackPendingGtc &&
        orderId &&
        pendingRemaining > 0.001 &&
        primaryKey
      ) {
        this.db
          .prepare(
            `INSERT INTO pending_orders
             (order_id, leader_id, token_id, side, price, size, filled_shares, trade_key, reasoning, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(order_id) DO UPDATE SET
               filled_shares = excluded.filled_shares,
               updated_at = excluded.updated_at`
          )
          .run(
            orderId,
            leaderId,
            tokenId,
            side,
            price,
            orderSize,
            filledShares,
            primaryKey,
            auditReason,
            now,
            now
          );
      }

      if (filledShares > 0) {
        this.applyCopyFill(leaderId, tokenId, side, filledShares, price);
        if (side === "BUY") this.recordBuy(leaderId, tokenId);
        this.addDailyVolume(filledUsd);
        this.addLeaderDailyVolume(leaderId, filledUsd);
        this.audit({
          leaderId,
          action: "COPY",
          tokenId,
          side,
          size: filledShares,
          price,
          reason: auditReason,
          preview: false,
        });
      }
    })();
  }

  /** Set pending order timestamps (for tests / recovery). */
  setPendingOrderTimestamps(orderId: string, createdAt: number, updatedAt?: number): void {
    this.db
      .prepare("UPDATE pending_orders SET created_at = ?, updated_at = ? WHERE order_id = ?")
      .run(createdAt, updatedAt ?? createdAt, orderId);
  }

  audit(entry: {
    leaderId?: string;
    action: AuditAction;
    tokenId?: string;
    side?: string;
    size?: number;
    price?: number;
    reason?: string;
    preview: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (ts, leader_id, action, token_id, side, size, price, reason, preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Date.now(),
        entry.leaderId ?? null,
        entry.action,
        entry.tokenId ?? null,
        entry.side ?? null,
        entry.size ?? null,
        entry.price ?? null,
        entry.reason ?? null,
        entry.preview ? 1 : 0
      );
  }

  getDailyVolumeUsd(): number {
    const row = this.db
      .prepare("SELECT volume_usd FROM daily_stats WHERE date = ?")
      .get(todayKey()) as { volume_usd: number } | undefined;
    return row?.volume_usd ?? 0;
  }

  addDailyVolume(usd: number): void {
    this.db
      .prepare(
        `INSERT INTO daily_stats (date, volume_usd, copy_count) VALUES (?, ?, 1)
         ON CONFLICT(date) DO UPDATE SET
           volume_usd = volume_usd + excluded.volume_usd,
           copy_count = copy_count + 1`
      )
      .run(todayKey(), usd);
  }

  getLeaderDailyVolumeUsd(leaderId: string): number {
    const row = this.db
      .prepare("SELECT volume_usd FROM leader_daily_stats WHERE date = ? AND leader_id = ?")
      .get(todayKey(), leaderId) as { volume_usd: number } | undefined;
    return row?.volume_usd ?? 0;
  }

  addLeaderDailyVolume(leaderId: string, usd: number): void {
    this.db
      .prepare(
        `INSERT INTO leader_daily_stats (date, leader_id, volume_usd) VALUES (?, ?, ?)
         ON CONFLICT(date, leader_id) DO UPDATE SET volume_usd = volume_usd + excluded.volume_usd`
      )
      .run(todayKey(), leaderId, usd);
  }

  getDailyRealizedPnl(): number {
    const row = this.db
      .prepare("SELECT realized_pnl FROM daily_stats WHERE date = ?")
      .get(todayKey()) as { realized_pnl: number } | undefined;
    return row?.realized_pnl ?? 0;
  }

  addRealizedPnl(delta: number): void {
    this.db
      .prepare(
        `INSERT INTO daily_stats (date, realized_pnl) VALUES (?, ?)
         ON CONFLICT(date) DO UPDATE SET realized_pnl = realized_pnl + excluded.realized_pnl`
      )
      .run(todayKey(), delta);
  }

  triggerKillSwitch(): void {
    this.db
      .prepare(
        `INSERT INTO daily_stats (date, kill_switch) VALUES (?, 1)
         ON CONFLICT(date) DO UPDATE SET kill_switch = 1`
      )
      .run(todayKey());
  }

  resetKillSwitch(): void {
    this.db
      .prepare(
        `INSERT INTO daily_stats (date, kill_switch) VALUES (?, 0)
         ON CONFLICT(date) DO UPDATE SET kill_switch = 0`
      )
      .run(todayKey());
  }

  isKillSwitchActive(): boolean {
    const row = this.db
      .prepare("SELECT kill_switch FROM daily_stats WHERE date = ?")
      .get(todayKey()) as { kill_switch: number } | undefined;
    return (row?.kill_switch ?? 0) === 1;
  }

  hasRecentBuy(leaderId: string, tokenId: string, windowMs: number): boolean {
    const since = Date.now() - windowMs;
    const row = this.db
      .prepare(
        `SELECT 1 FROM buy_dedup WHERE leader_id = ? AND token_id = ? AND created_at > ? LIMIT 1`
      )
      .get(leaderId, tokenId, since);
    return row !== undefined;
  }

  recordBuy(leaderId: string, tokenId: string): void {
    this.db
      .prepare("INSERT INTO buy_dedup (leader_id, token_id, created_at) VALUES (?, ?, ?)")
      .run(leaderId, tokenId, Date.now());
    this.db.prepare("DELETE FROM buy_dedup WHERE created_at < ?").run(Date.now() - 86400000);
  }

  listAuditLog(options: {
    limit?: number;
    offset?: number;
    leaderId?: string;
    action?: AuditAction;
  } = {}): { items: AuditLogRow[]; total: number } {
    const limit = Math.min(500, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.leaderId) {
      conditions.push("leader_id = ?");
      params.push(options.leaderId);
    }
    if (options.action) {
      conditions.push("action = ?");
      params.push(options.action);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM audit_log ${where}`)
      .get(...params) as { c: number };

    const items = this.db
      .prepare(
        `SELECT id, ts, leader_id AS leaderId, action, token_id AS tokenId, side,
                size, price, reason, preview
         FROM audit_log ${where}
         ORDER BY ts DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as AuditLogRow[];

    return {
      items: items.map((r) => ({ ...r, preview: Boolean(r.preview) })),
      total: totalRow.c,
    };
  }

  listAuditAfterId(afterId: number, limit = 100): AuditLogRow[] {
    const items = this.db
      .prepare(
        `SELECT id, ts, leader_id AS leaderId, action, token_id AS tokenId, side,
                size, price, reason, preview
         FROM audit_log
         WHERE id > ?
         ORDER BY id ASC
         LIMIT ?`
      )
      .all(afterId, limit) as AuditLogRow[];

    return items.map((r) => ({ ...r, preview: Boolean(r.preview) }));
  }

  getMaxAuditId(): number {
    const row = this.db.prepare("SELECT MAX(id) AS maxId FROM audit_log").get() as {
      maxId: number | null;
    };
    return row.maxId ?? 0;
  }

  getHourlyAuditStats(hours: number): {
    bucketMs: number;
    copyCount: number;
    skipCount: number;
    errorCount: number;
  }[] {
    const clampedHours = Math.min(48, Math.max(1, hours));
    const since = Date.now() - clampedHours * 3600_000;
    const hourMs = 3600_000;

    const rows = this.db
      .prepare(
        `SELECT
           CAST(ts / ? AS INTEGER) * ? AS bucketMs,
           SUM(CASE WHEN action = 'COPY' THEN 1 ELSE 0 END) AS copyCount,
           SUM(CASE WHEN action = 'SKIP' THEN 1 ELSE 0 END) AS skipCount,
           SUM(CASE WHEN action = 'ERROR' THEN 1 ELSE 0 END) AS errorCount
         FROM audit_log
         WHERE ts >= ?
         GROUP BY bucketMs
         ORDER BY bucketMs ASC`
      )
      .all(hourMs, hourMs, since) as {
      bucketMs: number;
      copyCount: number;
      skipCount: number;
      errorCount: number;
    }[];

    const byBucket = new Map(rows.map((r) => [r.bucketMs, r]));
    const startBucket = Math.floor(since / hourMs) * hourMs;
    const endBucket = Math.floor(Date.now() / hourMs) * hourMs;
    const buckets: {
      bucketMs: number;
      copyCount: number;
      skipCount: number;
      errorCount: number;
    }[] = [];

    for (let t = startBucket; t <= endBucket; t += hourMs) {
      const row = byBucket.get(t);
      buckets.push({
        bucketMs: t,
        copyCount: row?.copyCount ?? 0,
        skipCount: row?.skipCount ?? 0,
        errorCount: row?.errorCount ?? 0,
      });
    }

    return buckets;
  }

  listPositions(): PositionRow[] {
    return this.db
      .prepare(
        `SELECT leader_id AS leaderId, token_id AS tokenId, shares, avg_entry_price AS avgEntryPrice
         FROM positions WHERE shares > 0
         ORDER BY leader_id, token_id`
      )
      .all() as PositionRow[];
  }

  getTodayStats(): DailyStatsRow | null {
    const row = this.db
      .prepare(
        `SELECT date, volume_usd AS volumeUsd, realized_pnl AS realizedPnl,
                copy_count AS copyCount, kill_switch AS killSwitch
         FROM daily_stats WHERE date = ?`
      )
      .get(todayKey()) as DailyStatsRow | undefined;
    return row ?? null;
  }

  listLeaderTodayStats(): LeaderDailyStatsRow[] {
    return this.db
      .prepare(
        `SELECT leader_id AS leaderId, volume_usd AS volumeUsd
         FROM leader_daily_stats WHERE date = ?`
      )
      .all(todayKey()) as LeaderDailyStatsRow[];
  }

  close(): void {
    this.db.close();
  }
}
