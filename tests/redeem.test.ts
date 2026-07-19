import { describe, it, expect, vi, beforeEach } from "vitest";
import { isBenignRedeemError } from "../src/executor/redeem.js";

describe("isBenignRedeemError", () => {
  it("treats already-redeemed style errors as benign", () => {
    expect(isBenignRedeemError("Position already redeemed")).toBe(true);
    expect(isBenignRedeemError("nothing to redeem")).toBe(true);
  });

  it("does not treat generic reverts or auth errors as benign", () => {
    expect(isBenignRedeemError("execution reverted")).toBe(false);
    expect(isBenignRedeemError("invalid authorization")).toBe(false);
    expect(isBenignRedeemError("insufficient balance")).toBe(false);
  });
});

describe("redeemConditionOnChain", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns tx hash when SecureClient redeem succeeds", async () => {
    vi.doMock("../src/executor/secure-client.js", () => ({
      getSecureClient: vi.fn(async () => ({
        redeemPositions: vi.fn(async () => ({
          wait: vi.fn(async () => ({ transactionHash: "0xabc" })),
        })),
      })),
    }));

    const { redeemConditionOnChain } = await import("../src/executor/redeem.js");
    const result = await redeemConditionOnChain(
      {
        privateKey: "0x" + "1".repeat(64),
        proxyAddress: "0x" + "2".repeat(40),
        signatureType: 0,
        chainId: 137,
        clobUrl: "https://clob.polymarket.com",
        tradingBackend: "secure",
      builderCode: "0x" + "9".repeat(64),
      },
      "0xcondition"
    );

    expect(result.ok).toBe(true);
    expect(result.txHash).toBe("0xabc");
  });
});
