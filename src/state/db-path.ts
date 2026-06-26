import { existsSync } from "node:fs";

const LIVE_DB = "data/polymirror.db";
const PREVIEW_DB = "data/preview.db";

/** Preview and live use separate SQLite files so preview runs do not pollute live state. */
export function resolveDbPath(previewMode: boolean): string {
  const override = process.env.POLYMIRROR_DB_PATH?.trim();
  if (override) return override;
  return previewMode ? PREVIEW_DB : LIVE_DB;
}

/** Per-account DB path. Legacy single-account DBs under data/preview.db are reused for id "default". */
export function resolveAccountDbPath(accountId: string, previewMode: boolean): string {
  const override = process.env.POLYMIRROR_DB_PATH?.trim();
  if (override) return override;

  const fileName = previewMode ? "preview.db" : "polymirror.db";
  const newPath = `data/accounts/${accountId}/${fileName}`;

  if (accountId === "default") {
    const legacyPath = previewMode ? PREVIEW_DB : LIVE_DB;
    if (existsSync(legacyPath) && !existsSync(newPath)) {
      return legacyPath;
    }
  }

  return newPath;
}
