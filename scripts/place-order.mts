/**
 * Polymarket CLOB 下单脚本
 *
 * 基于官方文档:
 * - https://docs.polymarket.com/api-reference/introduction
 * - https://docs.polymarket.com/trading/orders/create
 * - https://docs.polymarket.com/api-reference/authentication
 *
 * 流程: L1 私钥签名订单 → L2 API Key 提交到 CLOB
 * 本项目通过 @polymarket/client SecureClient 完成认证与下单。
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { loadMultiAccountConfig } from "../src/config/load.js";
import { assertLiveTradingAllowed } from "../src/engine/risk.js";
import { fetchWalletCollateral } from "../src/executor/balance.js";
import {
  fetchGeoblockStatus,
  formatGeoblockMessage,
} from "../src/executor/geoblock.js";
import {
  fetchBestExecutablePrice,
  fetchOrderBookMeta,
  formatPriceForTick,
  roundToTick,
} from "../src/executor/orderbook.js";
import {
  assertDepositWalletCanPlaceOrders,
  ensureTradingReady,
} from "../src/executor/secure-client.js";
import { createTradingBackend } from "../src/executor/trading-backend.js";
import type { OrderType, TradeSide } from "../src/config/types.js";
import { ensureUndiciGlobalProxy } from "../src/util/proxy.js";

const HELP = `
Polymarket CLOB 下单脚本

用法:
  npx tsx scripts/place-order.mts --token <TOKEN_ID> --side BUY|SELL --price <0-1> --size <shares>
  npm run place-order -- --token <TOKEN_ID> --side BUY --price 0.50 --size 10

必填:
  --token, -t     市场 outcome token ID（CLOB token_id）
  --side, -s      BUY 或 SELL
  --size          份额数量（GTC/FOK/FAK 限价单与卖单）；市价买单用 --amount 指定美元

价格（二选一）:
  --price, -p     限价，0~1（例: 0.50 = 50¢）
  --best-price    使用盘口最优价，并按 --slippage 做滑点保护

可选:
  --type          订单类型: GTC（默认）| FOK | FAK
  --amount        市价买单美元金额（FOK/FAK + BUY 时替代 price×size）
  --slippage      滑点比例，默认读取 config.yaml global.risk.slippage_tolerance
  --account, -a   账户 id（config.yaml accounts[].id），默认第一个 enabled 账户
  --config, -c    配置文件路径，默认 config.yaml
  --dry-run       只预览参数，不提交订单
  --skip-geoblock 跳过地区限制检查
  --list-open     列出当前账户挂单后退出
  --cancel        取消指定 order id 后退出
  --help, -h      显示帮助

环境变量（.env）:
  POLYMARKET_PRIVATE_KEY    签名私钥（L1）
  POLYMARKET_ADDRESS        资金地址 / deposit wallet
  POLYMARKET_API_KEY        可选，CLOB L2 凭证（否则 SDK 自动 derive）
  POLYMIRROR_LIVE_CONFIRM=I_UNDERSTAND_LIVE_TRADING  实盘安全确认

示例:
  # GTC 限价买单：10 份 @ 0.50
  npx tsx scripts/place-order.mts -t 123456789 -s BUY -p 0.50 --size 10

  # FOK 市价买单：花 $5，最优 ask + 3% 滑点保护
  npx tsx scripts/place-order.mts -t 123456789 -s BUY --type FOK --amount 5 --best-price

  # 预览（不实际上单）
  npx tsx scripts/place-order.mts -t 123456789 -s BUY -p 0.01 --size 5 --dry-run

  # 查看挂单 / 撤单
  npx tsx scripts/place-order.mts --list-open
  npx tsx scripts/place-order.mts --cancel 0xabc...
`.trim();

interface CliOptions {
  token?: string;
  side?: TradeSide;
  price?: number;
  size?: number;
  amount?: number;
  type: OrderType;
  bestPrice: boolean;
  slippage?: number;
  account?: string;
  config: string;
  dryRun: boolean;
  skipGeoblock: boolean;
  listOpen: boolean;
  cancel?: string;
  help: boolean;
}

function parseCli(): CliOptions {
  const { values } = parseArgs({
    options: {
      token: { type: "string", short: "t" },
      side: { type: "string", short: "s" },
      price: { type: "string", short: "p" },
      size: { type: "string" },
      amount: { type: "string" },
      type: { type: "string" },
      "best-price": { type: "boolean", default: false },
      slippage: { type: "string" },
      account: { type: "string", short: "a" },
      config: { type: "string", short: "c", default: "config.yaml" },
      "dry-run": { type: "boolean", default: false },
      "skip-geoblock": { type: "boolean", default: false },
      "list-open": { type: "boolean", default: false },
      cancel: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const sideRaw = values.side?.trim().toUpperCase();
  const side =
    sideRaw === "BUY" || sideRaw === "SELL" ? (sideRaw as TradeSide) : undefined;

  const typeRaw = (values.type ?? "GTC").trim().toUpperCase();
  if (typeRaw !== "GTC" && typeRaw !== "FOK" && typeRaw !== "FAK") {
    throw new Error(`Invalid --type: ${values.type} (use GTC, FOK, or FAK)`);
  }

  return {
    token: values.token?.trim(),
    side,
    price: values.price !== undefined ? Number(values.price) : undefined,
    size: values.size !== undefined ? Number(values.size) : undefined,
    amount: values.amount !== undefined ? Number(values.amount) : undefined,
    type: typeRaw as OrderType,
    bestPrice: values["best-price"] ?? false,
    slippage: values.slippage !== undefined ? Number(values.slippage) : undefined,
    account: values.account?.trim(),
    config: values.config ?? "config.yaml",
    dryRun: values["dry-run"] ?? false,
    skipGeoblock: values["skip-geoblock"] ?? false,
    listOpen: values["list-open"] ?? false,
    cancel: values.cancel?.trim(),
    help: values.help ?? false,
  };
}

function pickAccount(
  multi: ReturnType<typeof loadMultiAccountConfig>,
  accountId?: string
) {
  if (accountId) {
    const found = multi.accounts.find((a) => a.id === accountId);
    if (!found) {
      throw new Error(
        `Account "${accountId}" not found. Available: ${multi.accounts.map((a) => a.id).join(", ")}`
      );
    }
    return found;
  }
  return multi.accounts.find((a) => a.enabled) ?? multi.accounts[0]!;
}

async function resolveLimitPrice(
  wallet: { clobUrl: string; chainId: number },
  tokenId: string,
  side: TradeSide,
  tickSize: string,
  opts: CliOptions,
  defaultSlippage: number
): Promise<number> {
  const tick = parseFloat(tickSize);

  if (opts.bestPrice) {
    const best = await fetchBestExecutablePrice(
      wallet.clobUrl,
      wallet.chainId,
      tokenId,
      side
    );
    if (best === null) {
      throw new Error("Order book has no executable price for --best-price");
    }
    const slip = opts.slippage ?? defaultSlippage;
    const raw =
      side === "BUY" ? best * (1 + slip) : best * (1 - slip);
    return roundToTick(raw, tick);
  }

  if (opts.price === undefined || !Number.isFinite(opts.price)) {
    throw new Error("Provide --price or use --best-price");
  }
  if (opts.price <= 0 || opts.price >= 1) {
    throw new Error("--price must be between 0 and 1 (exclusive)");
  }
  return roundToTick(opts.price, tick);
}

async function main(): Promise<void> {
  const opts = parseCli();
  if (opts.help) {
    console.log(HELP);
    return;
  }

  await ensureUndiciGlobalProxy();
  const multi = loadMultiAccountConfig(opts.config);
  const account = pickAccount(multi, opts.account);
  const wallet = account.config.wallet;
  const global = account.config.app.global;
  const backend = createTradingBackend(wallet);

  if (opts.cancel) {
    assertLiveTradingAllowed(false);
    await ensureTradingReady(wallet);
    const result = await backend.cancelOrder(opts.cancel);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }

  if (opts.listOpen) {
    await ensureTradingReady(wallet);
    const orders = await backend.listOpenOrders(
      opts.token ? { tokenId: opts.token } : undefined
    );
    console.log(JSON.stringify({ wallet: wallet.proxyAddress, orders }, null, 2));
    return;
  }

  if (!opts.token) throw new Error("--token is required");
  if (!opts.side) throw new Error("--side BUY|SELL is required");

  if (!opts.skipGeoblock) {
    const geo = await fetchGeoblockStatus();
    if (!geo) {
      throw new Error(
        "Geoblock check failed (network/proxy). Configure proxy in config.yaml or use --skip-geoblock"
      );
    }
    if (geo.blocked) {
      console.error(formatGeoblockMessage(geo));
      process.exit(2);
    }
    console.log(`Geoblock OK — ${geo.ip} (${geo.country}/${geo.region})`);
  }

  const meta = await fetchOrderBookMeta(wallet.clobUrl, wallet.chainId, opts.token);
  if (!meta) {
    throw new Error(`Order book unavailable for token ${opts.token.slice(0, 16)}…`);
  }

  const price = await resolveLimitPrice(
    wallet,
    opts.token,
    opts.side,
    meta.tickSize,
    opts,
    global.risk.slippageTolerance
  );

  let size = opts.size;
  if (opts.type !== "GTC" && opts.side === "BUY" && opts.amount !== undefined) {
    if (!Number.isFinite(opts.amount) || opts.amount <= 0) {
      throw new Error("--amount must be a positive number");
    }
    size = Math.round((opts.amount / price) * 100) / 100;
  }

  if (size === undefined || !Number.isFinite(size) || size <= 0) {
    throw new Error("--size (shares) is required, or use --amount for market BUY");
  }

  const notional = Math.round(price * size * 100) / 100;
  const collateral = await fetchWalletCollateral(wallet);

  const summary = {
    account: account.id,
    wallet: wallet.proxyAddress,
    tokenId: opts.token,
    side: opts.side,
    orderType: opts.type,
    price: formatPriceForTick(price, meta.tickSize),
    size,
    notionalUsd: notional,
    tickSize: meta.tickSize,
    negRisk: meta.negRisk,
    clobBalanceUsd: collateral.clobUsd,
    chainBalanceUsd: collateral.chainUsd,
    dryRun: opts.dryRun,
  };

  console.log("Order preview:");
  console.log(JSON.stringify(summary, null, 2));

  if (opts.dryRun) {
    console.log("Dry run — order not submitted.");
    return;
  }

  assertLiveTradingAllowed(false);
  await ensureTradingReady(wallet);
  await assertDepositWalletCanPlaceOrders(wallet);

  const resp = await backend.submitOrder({
    tokenId: opts.token,
    side: opts.side,
    price,
    size,
    orderType: opts.type,
    tickSize: meta.tickSize,
    negRisk: meta.negRisk,
  });

  if (resp.error) {
    console.error("Order rejected:", resp.error);
    console.error(JSON.stringify(resp.raw, null, 2));
    process.exit(1);
  }

  console.log("Order accepted:");
  console.log(
    JSON.stringify(
      {
        orderId: resp.orderId,
        status: resp.status,
        makingAmount: resp.makingAmount,
        takingAmount: resp.takingAmount,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
