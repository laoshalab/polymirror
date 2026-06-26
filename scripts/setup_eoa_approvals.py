#!/usr/bin/env python3
"""为标准 EOA（signature_type=0）开通 Polymarket CLOB V2 交易授权。

适用场景：你用一个**普通 EOA 钱包**直接在 CLOB 下单（不是 deposit wallet）。
CLOB 撮合后由链上交易所合约结算，因此 EOA 必须先授权交易所合约动用：
  1. pUSD（ERC-20）—— 买单需要（approve 3 个 V2 spender）
  2. Conditional Tokens（ERC-1155）—— 卖单需要（setApprovalForAll 2 个交易所）

前置条件（需你从外部转入 EOA，**不动用 deposit wallet**）：
  - 少量 POL 作为 gas（如 0.3~1 POL）
  - 用于交易的 pUSD（合约 0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB，Polygon）

依赖：
  pip install -r scripts/requirements-order.txt   # 含 web3

环境变量（.env）：
  POLYMARKET_PRIVATE_KEY   EOA 私钥                          [必填]
  POLYMARKET_CHAIN_ID      默认 137
  POLYMARKET_RPC_URL       可选，Polygon RPC（默认内置公共节点）
  HTTPS_PROXY / HTTP_PROXY 可选代理

用法：
  python3 scripts/setup_eoa_approvals.py            # 检查并按需授权
  python3 scripts/setup_eoa_approvals.py --check    # 只检查，不发交易
"""
from __future__ import annotations

import argparse
import os
import sys


def _env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    return v.strip() if v and v.strip() else default


def _resolve_proxy() -> str | None:
    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        if _env(key):
            p = _env(key)
            if p.startswith(("socks5://", "socks4://", "socks://", "socks5h://")):
                p = "http://" + p.split("://", 1)[1]
            return p
    try:
        import re

        with open("config.yaml", "r", encoding="utf-8") as fh:
            m = re.search(r"static_url:\s*(\S+)", fh.read())
        if m:
            return m.group(1).strip()
    except OSError:
        pass
    return None


try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

try:
    from web3 import Web3
    from web3.middleware import ExtraDataToPOAMiddleware
except ImportError as exc:
    sys.exit(
        "缺少依赖 web3。请运行：pip install -r scripts/requirements-order.txt\n"
        f"原始错误：{exc}"
    )

PUSD = Web3.to_checksum_address("0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB")
CONDITIONAL_TOKENS = Web3.to_checksum_address("0x4D97DCd97eC945f40cF65F87097ACe5EA0476045")
# CLOB V2 spenders（pUSD 需对其全部授权）
EXCHANGE_V2 = Web3.to_checksum_address("0xE111180000d2663C0091e4f400237545B87B996B")
NEG_RISK_EXCHANGE_V2 = Web3.to_checksum_address("0xe2222d279d744050d28e00520010520000310F59")
NEG_RISK_ADAPTER = Web3.to_checksum_address("0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296")
PUSD_SPENDERS = [EXCHANGE_V2, NEG_RISK_EXCHANGE_V2, NEG_RISK_ADAPTER]
# ERC-1155 operator（卖单需要）
CTF_OPERATORS = [EXCHANGE_V2, NEG_RISK_EXCHANGE_V2]

DEFAULT_RPCS = [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon-rpc.com",
    "https://rpc.ankr.com/polygon",
]
MAX_UINT256 = (1 << 256) - 1

ERC20_ABI = [
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
     "outputs": [{"name": "", "type": "bool"}]},
    {"name": "allowance", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "account", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]},
]
ERC1155_ABI = [
    {"name": "setApprovalForAll", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "operator", "type": "address"}, {"name": "approved", "type": "bool"}],
     "outputs": []},
    {"name": "isApprovedForAll", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "account", "type": "address"}, {"name": "operator", "type": "address"}],
     "outputs": [{"name": "", "type": "bool"}]},
]


def connect() -> Web3:
    proxy = _resolve_proxy()
    req_kwargs = {"timeout": 30}
    if proxy:
        req_kwargs["proxies"] = {"http": proxy, "https": proxy}
    rpcs = [_env("POLYMARKET_RPC_URL")] if _env("POLYMARKET_RPC_URL") else DEFAULT_RPCS
    last = None
    for rpc in rpcs:
        try:
            w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs=req_kwargs))
            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            if w3.eth.chain_id:
                print(f"已连接 RPC: {rpc}")
                return w3
        except Exception as e:  # noqa: BLE001
            last = e
    sys.exit(f"无法连接 Polygon RPC：{last}")


def send_tx(w3: Web3, account, tx: dict) -> str:
    tx["from"] = account.address
    tx["nonce"] = w3.eth.get_transaction_count(account.address)
    tx["chainId"] = w3.eth.chain_id
    tx.pop("gasPrice", None)  # 用 EIP-1559，避免与 maxFeePerGas 冲突

    try:
        base = w3.eth.get_block("latest")["baseFeePerGas"]
    except Exception:
        base = w3.to_wei(30, "gwei")
    try:
        priority = max(int(w3.eth.max_priority_fee), w3.to_wei(30, "gwei"))
    except Exception:
        priority = w3.to_wei(30, "gwei")
    tx["maxPriorityFeePerGas"] = int(priority)
    tx["maxFeePerGas"] = int(base * 2 + priority)

    try:
        tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.3)
    except Exception:
        tx["gas"] = 120000
    signed = account.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  已发送 tx: {h.hex()} —— 等待确认…")
    receipt = w3.eth.wait_for_transaction_receipt(h, timeout=180)
    status = "成功 ✅" if receipt.status == 1 else "失败 ❌"
    print(f"  确认：{status}（block {receipt.blockNumber}, gasUsed {receipt.gasUsed}）")
    return h.hex()


def main() -> None:
    parser = argparse.ArgumentParser(description="EOA CLOB 交易授权")
    parser.add_argument("--check", action="store_true", help="只检查授权状态，不发交易")
    args = parser.parse_args()

    pk = _env("POLYMARKET_PRIVATE_KEY")
    if not pk:
        sys.exit("缺少 POLYMARKET_PRIVATE_KEY")

    w3 = connect()
    account = w3.eth.account.from_key(pk)
    owner = account.address
    print(f"EOA: {owner}")

    pol = w3.eth.get_balance(owner) / 1e18
    pusd = w3.eth.contract(address=PUSD, abi=ERC20_ABI)
    ctf = w3.eth.contract(address=CONDITIONAL_TOKENS, abi=ERC1155_ABI)
    pusd_bal = pusd.functions.balanceOf(owner).call() / 1e6
    print(f"POL (gas): {pol:.4f}   pUSD: {pusd_bal:.4f}")

    print("\npUSD 授权状态：")
    pusd_todo = []
    for sp in PUSD_SPENDERS:
        allowed = pusd.functions.allowance(owner, sp).call()
        ok = allowed >= (1 << 200)
        print(f"  {sp}: {'已授权 ✅' if ok else '未授权 ❌'}")
        if not ok:
            pusd_todo.append(sp)

    print("ConditionalTokens（卖单）授权状态：")
    ctf_todo = []
    for op in CTF_OPERATORS:
        ok = ctf.functions.isApprovedForAll(owner, op).call()
        print(f"  {op}: {'已授权 ✅' if ok else '未授权 ❌'}")
        if not ok:
            ctf_todo.append(op)

    if not pusd_todo and not ctf_todo:
        print("\n全部授权就绪 ✅ —— 可以用 signature_type=0 下单了。")
        return

    if args.check:
        print(f"\n[--check] 待授权：pUSD×{len(pusd_todo)}, CTF×{len(ctf_todo)}（未发送交易）")
        return

    if pol <= 0:
        sys.exit("\nEOA 没有 POL，无法支付 gas。请先向 EOA 转入少量 POL（如 0.3）。")

    print("\n开始发送授权交易…")
    for sp in pusd_todo:
        print(f"approve pUSD → {sp}")
        tx = pusd.functions.approve(sp, MAX_UINT256).build_transaction({"from": owner})
        send_tx(w3, account, tx)
    for op in ctf_todo:
        print(f"setApprovalForAll CTF → {op}")
        tx = ctf.functions.setApprovalForAll(op, True).build_transaction({"from": owner})
        send_tx(w3, account, tx)

    print("\n授权完成 ✅ —— 现在可用 signature_type=0 下单。")


if __name__ == "__main__":
    main()
