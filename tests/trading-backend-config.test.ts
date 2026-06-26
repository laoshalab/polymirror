import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Wallet } from "@ethersproject/wallet";

const EOA_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
const PROXY = "0x435c5458Dff07905fF2740B4defBe178920ec425";

describe("resolveTradingBackend", () => {
  const prevBackend = process.env.POLYMARKET_TRADING_BACKEND;
  const prevSig = process.env.POLYMARKET_SIGNATURE_TYPE;

  beforeEach(() => {
    delete process.env.POLYMARKET_TRADING_BACKEND;
    process.env.POLYMARKET_PRIVATE_KEY = EOA_KEY;
    process.env.POLYMARKET_ADDRESS = PROXY;
    process.env.POLYMARKET_SIGNATURE_TYPE = "3";
  });

  afterEach(() => {
    if (prevBackend === undefined) delete process.env.POLYMARKET_TRADING_BACKEND;
    else process.env.POLYMARKET_TRADING_BACKEND = prevBackend;
    if (prevSig === undefined) delete process.env.POLYMARKET_SIGNATURE_TYPE;
    else process.env.POLYMARKET_SIGNATURE_TYPE = prevSig;
  });

  it("always uses secure (@polymarket/client)", async () => {
    const { loadWalletConfig } = await import("../src/config/load.js");
    const wallet = loadWalletConfig();
    expect(wallet.tradingBackend).toBe("secure");
    expect(wallet.signatureType).toBe(3);
    const eoa = new Wallet(EOA_KEY).address.toLowerCase();
    expect(wallet.proxyAddress.toLowerCase()).not.toBe(eoa);
  });

  it("warns and still uses secure when clob-v2 is set", async () => {
    process.env.POLYMARKET_TRADING_BACKEND = "clob-v2";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { loadWalletConfig } = await import("../src/config/load.js");
    expect(loadWalletConfig().tradingBackend).toBe("secure");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
