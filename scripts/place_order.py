#!/usr/bin/env python3
"""Polymarket CLOB 下单脚本（Python）。

基于官方文档：
- https://docs.polymarket.com/api-reference/introduction
- https://docs.polymarket.com/trading/overview
- https://docs.polymarket.com/api-reference/authentication
- https://docs.polymarket.com/trading/orders/create

流程：
  1. L1（EIP-712 私钥签名）派生 L2 API 凭证（apiKey / secret / passphrase）。
  2. 从 CLOB /book 读取 tick_size 与 neg_risk（这两个值决定价格精度和签名用的合约域）。
  3. 用 SDK 构造 + EIP-712 签名 Order，再带 L2 HMAC 头 POST /order 提交。

依赖：
  pip install -r scripts/requirements-order.txt
  # 即：py-clob-client-v2、requests、python-dotenv

环境变量（.env 或系统环境）：
  POLYMARKET_PRIVATE_KEY      L1 签名私钥（0x...）            [必填]
  POLYMARKET_ADDRESS          资金地址 / deposit wallet       [signatureType!=0 时必填]
  POLYMARKET_SIGNATURE_TYPE   0=EOA 1=Proxy 2=Safe 3=POLY_1271（默认 0）
  POLYMARKET_CHAIN_ID         默认 137（Polygon）
  POLYMARKET_CLOB_URL         默认 https://clob.polymarket.com
  POLYMARKET_API_KEY          可选，已有 L2 凭证（否则脚本自动派生）
  POLYMARKET_API_SECRET       可选
  POLYMARKET_API_PASSPHRASE   可选
  HTTPS_PROXY / HTTP_PROXY    可选，中国大陆访问通常需要

用法示例：
  # GTC 限价买单：10 份 @ 0.50
  python scripts/place_order.py --token <TOKEN_ID> --side BUY --price 0.50 --size 10

  # FAK 吃单卖出 25 份，限价不低于 0.60
  python scripts/place_order.py --token <TOKEN_ID> --side SELL --type FAK --price 0.60 --size 25

  # 只预览，不提交
  python scripts/place_order.py --token <TOKEN_ID> --side BUY --price 0.01 --size 5 --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from decimal import ROUND_HALF_UP, Decimal

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv 可选；没装就只读系统环境变量
    pass


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else default


def _resolve_proxy() -> str | None:
    """代理优先级：HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 环境变量 > config.yaml static_url。"""
    for key in (
        "HTTPS_PROXY", "https_proxy",
        "HTTP_PROXY", "http_proxy",
        "ALL_PROXY", "all_proxy",
    ):
        if _env(key):
            return _env(key)
    try:
        import re

        with open("config.yaml", "r", encoding="utf-8") as fh:
            match = re.search(r"static_url:\s*(\S+)", fh.read())
        if match:
            return match.group(1).strip()
    except OSError:
        pass
    return None


def _normalize_proxy_env() -> str | None:
    """统一代理环境，避免 httpx 因 socks:// 在导入时崩溃。

    py-clob-client-v2 内部用 httpx 且在 import 时读取代理环境变量；
    httpx 不支持 socks:// 除非装了 httpx[socks]。7890 通常是 Clash 混合端口，
    http 与 socks 共用，所以把 socks:// 统一改成 http:// 最省事。
    """
    proxy = _resolve_proxy()
    if not proxy:
        return None
    if proxy.startswith(("socks5://", "socks4://", "socks://", "socks5h://")):
        host = proxy.split("://", 1)[1]
        proxy = f"http://{host}"
    # 覆盖所有相关变量为 http 方案，并清掉 socks 版 ALL_PROXY
    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        os.environ[key] = proxy
    for key in ("ALL_PROXY", "all_proxy"):
        os.environ.pop(key, None)
    return proxy


_PROXY = _normalize_proxy_env()
_PROXIES = {"http": _PROXY, "https": _PROXY} if _PROXY else None

import requests  # noqa: E402  (在代理规范化之后导入)

try:
    from py_clob_client_v2 import (  # noqa: E402
        AssetType,
        BalanceAllowanceParams,
        ClobClient,
        OrderArgs,
        PartialCreateOrderOptions,
    )
    from py_clob_client_v2.clob_types import ApiCreds  # noqa: E402
    from py_clob_client_v2.order_builder.constants import BUY, SELL  # noqa: E402
except ImportError as exc:  # pragma: no cover - 依赖缺失时给出明确提示
    sys.exit(
        "缺少依赖 py-clob-client-v2。请先运行：\n"
        "  pip install -r scripts/requirements-order.txt\n"
        f"原始错误：{exc}"
    )

ORDER_TYPES = ("GTC", "FOK", "FAK", "GTD")
DEFAULT_CLOB_URL = "https://clob.polymarket.com"


def env(name: str, default: str | None = None) -> str | None:
    return _env(name, default)


def fetch_book_meta(clob_url: str, token_id: str) -> dict:
    """读取订单簿元数据（tick_size、neg_risk）。/book 为公开只读接口。"""
    resp = requests.get(
        f"{clob_url}/book",
        params={"token_id": token_id},
        timeout=30,
        proxies=_PROXIES,
    )
    resp.raise_for_status()
    book = resp.json()
    return {
        "tick_size": str(book.get("tick_size", "0.01")),
        "neg_risk": bool(book.get("neg_risk", False)),
        "best_bid": book.get("bids", [{}])[0].get("price") if book.get("bids") else None,
        "best_ask": book.get("asks", [{}])[0].get("price") if book.get("asks") else None,
    }


def round_to_tick(price: float, tick_size: str) -> float:
    tick = Decimal(tick_size)
    quantized = (Decimal(str(price)) / tick).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    ) * tick
    return float(quantized)


def build_client(args: argparse.Namespace) -> ClobClient:
    """按官方文档构建已认证的 CLOB 客户端。

    所有签名类型统一走文档流程：私钥（= 资金钱包的 owner / 签名者）用普通
    create_or_derive_api_key() 派生 L2 凭证；非 EOA 类型再附带 signature_type + funder。
    POLY_1271(3)：funder = deposit wallet，订单由 owner 私钥签名、链上经 ERC-1271 校验，
    凭证 owner 与 deposit wallet 的 owner 一致时 CLOB 才接受（参见 authentication / quickstart 文档）。
    """
    private_key = env("POLYMARKET_PRIVATE_KEY")
    if not private_key:
        sys.exit("缺少 POLYMARKET_PRIVATE_KEY（.env 或环境变量）")

    chain_id = int(env("POLYMARKET_CHAIN_ID", "137"))
    clob_url = env("POLYMARKET_CLOB_URL", DEFAULT_CLOB_URL)
    signature_type = int(env("POLYMARKET_SIGNATURE_TYPE", "0"))
    funder = env("POLYMARKET_ADDRESS")

    if signature_type != 0 and not funder:
        sys.exit(
            f"signatureType={signature_type} 需要设置 POLYMARKET_ADDRESS（资金地址/deposit wallet）"
        )

    api_key = env("POLYMARKET_API_KEY")
    api_secret = env("POLYMARKET_API_SECRET")
    api_passphrase = env("POLYMARKET_API_PASSPHRASE")

    if api_key and api_secret and api_passphrase:
        # 已配置 L2 凭证：直接复用，避免重复派生。
        creds = ApiCreds(
            api_key=api_key, api_secret=api_secret, api_passphrase=api_passphrase
        )
    else:
        # 用私钥（owner/signer）派生 L2 凭证 —— 对所有 signatureType 一致（含 POLY_1271）。
        bootstrap = ClobClient(host=clob_url, chain_id=chain_id, key=private_key)
        creds = bootstrap.create_or_derive_api_key()
        print("已自动派生 L2 API 凭证（建议写入 .env 复用）。")

    kwargs = dict(host=clob_url, chain_id=chain_id, key=private_key, creds=creds)
    if signature_type != 0:
        kwargs["signature_type"] = signature_type
        kwargs["funder"] = funder
    return ClobClient(**kwargs)


def sync_balance_allowance(client: ClobClient, signature_type: int) -> None:
    """下单前同步 CLOB 侧的资金/授权快照（deposit wallet 流程必需，见 deposit-wallets 文档）。"""
    try:
        client.update_balance_allowance(
            BalanceAllowanceParams(
                asset_type=AssetType.COLLATERAL, signature_type=signature_type
            )
        )
    except Exception as exc:  # noqa: BLE001 - 同步失败不应直接中断下单尝试
        print(f"  （余额同步告警：{exc}）")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Polymarket CLOB 下单（Python）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--token", "-t", help="outcome token id（CLOB token_id）")
    parser.add_argument(
        "--side", "-s", choices=["BUY", "SELL"], help="买/卖方向"
    )
    parser.add_argument(
        "--price", "-p", type=float, help="限价，0~1（如 0.50 = 50¢）"
    )
    parser.add_argument("--size", type=float, help="份额数量（shares）")
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="仅验证 CLOB 认证（派生 L2 凭证），不下单、不花钱",
    )
    parser.add_argument(
        "--type",
        default="GTC",
        choices=ORDER_TYPES,
        help="订单类型：GTC（默认）/ FOK / FAK / GTD",
    )
    parser.add_argument(
        "--expiration",
        type=int,
        default=0,
        help="GTD 到期 Unix 秒；其它类型留 0",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="仅预览参数，不提交订单"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.check_auth:
        client = build_client(args)
        owner = client.signer.address()
        print(f"认证成功 ✅  CLOB L2 凭证可用（owner={owner}）")
        print(f"  apiKey: {client.creds.api_key}")
        print("  （把 apiKey/secret/passphrase 写入 .env 可复用，避免每次派生）")
        return

    missing = [
        f"--{n}" for n, v in (("token", args.token), ("side", args.side), ("price", args.price), ("size", args.size)) if v is None
    ]
    if missing:
        sys.exit(f"缺少必填参数：{', '.join(missing)}（或使用 --check-auth / --dry-run）")

    if not (0 < args.price < 1):
        sys.exit("--price 必须在 (0, 1) 之间")
    if args.size <= 0:
        sys.exit("--size 必须为正数")
    if args.type == "GTD" and args.expiration <= 0:
        sys.exit("GTD 订单需要 --expiration（Unix 秒）")

    clob_url = env("POLYMARKET_CLOB_URL", DEFAULT_CLOB_URL)
    meta = fetch_book_meta(clob_url, args.token)
    price = round_to_tick(args.price, meta["tick_size"])

    summary = {
        "tokenId": args.token,
        "side": args.side,
        "orderType": args.type,
        "price": price,
        "size": args.size,
        "notionalUsd": round(price * args.size, 4),
        "tickSize": meta["tick_size"],
        "negRisk": meta["neg_risk"],
        "bestBid": meta["best_bid"],
        "bestAsk": meta["best_ask"],
        "dryRun": args.dry_run,
    }
    print("订单预览：")
    for key, value in summary.items():
        print(f"  {key:>12}: {value}")

    if args.dry_run:
        print("Dry run —— 未提交订单。")
        return

    client = build_client(args)

    signature_type = int(env("POLYMARKET_SIGNATURE_TYPE", "0"))
    if signature_type != 0:
        sync_balance_allowance(client, signature_type)

    order_args = OrderArgs(
        token_id=args.token,
        price=price,
        size=args.size,
        side=BUY if args.side == "BUY" else SELL,
    )
    if args.expiration:
        order_args.expiration = args.expiration

    options = PartialCreateOrderOptions(
        tick_size=meta["tick_size"], neg_risk=meta["neg_risk"]
    )

    resp = client.create_and_post_order(
        order_args, order_type=args.type, options=options
    )

    print("提交结果：")
    print(resp)

    status = resp.get("status") if isinstance(resp, dict) else None
    if status == "matched":
        print(f"已成交，链上结算：{resp.get('transactionsHashes')}")
    elif status == "live":
        print(f"已挂单，order id：{resp.get('orderID')}")
    elif status == "delayed":
        print("撮合引擎已排队（通常为临时状态）。")
    elif isinstance(resp, dict) and resp.get("success") is False:
        sys.exit(f"下单被拒绝：{resp.get('errorMsg') or resp.get('error')}")


if __name__ == "__main__":
    main()
