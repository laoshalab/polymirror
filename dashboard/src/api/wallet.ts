import { apiGet } from "./leaders";

export interface WalletProfile {
  address: string;
  polymarketUrl: string;
  previewMode: boolean;
  profile?: {
    userName?: string;
    profileImage?: string;
    xUsername?: string;
    bio?: string;
  };
  rankStats?: { rank: number; pnl: number; vol: number; userName?: string };
  portfolio: {
    cashUsd: number | null;
    positionsValueUsd: number;
    totalValueUsd: number;
    valueUsd: number;
    unrealizedPnl: number;
    positionCount: number;
  };
  engine: {
    dbPath: string;
    todayVolumeUsd: number;
    todayRealizedPnl: number;
    todayCopyCount: number;
    localPositionCount: number;
    localExposureUsd: number;
    killSwitchActive: boolean;
  };
  polymarketPositions: {
    title?: string;
    outcome?: string;
    size: number;
    avgPrice: number;
    curPrice?: number;
    currentValue: number;
    cashPnl?: number;
    percentPnl?: number;
    redeemable?: boolean;
  }[];
  localPositions: {
    leaderId: string;
    tokenId: string;
    shares: number;
    avgEntryPrice: number;
  }[];
  recentTrades: {
    timestamp: number;
    side?: string;
    size?: number;
    price?: number;
    usdcSize?: number;
    title?: string;
    outcome?: string;
  }[];
  error?: string;
  collateralError?: string;
  collateralSource?: "clob" | "chain" | "none";
  clobCashUsd?: number | null;
  chainCashUsd?: number | null;
  pusdAllowancesReady?: boolean | null;
  geoblock?: { blocked: boolean; ip: string; country: string; region: string };
  geoblockHint?: string;
  hint?: string;
}

export const fetchWalletProfile = () => apiGet<WalletProfile>("/api/wallet");
