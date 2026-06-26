import type { LeaderConfig } from "../config/types.js";

export class LeaderRegistry {
  private byId = new Map<string, LeaderConfig>();
  private byAddress = new Map<string, LeaderConfig>();

  constructor(leaders: LeaderConfig[]) {
    for (const leader of leaders) {
      this.byId.set(leader.id, leader);
      if (leader.address) {
        this.byAddress.set(leader.address.toLowerCase(), leader);
      }
    }
  }

  enabled(): LeaderConfig[] {
    return [...this.byId.values()].filter((l) => l.enabled);
  }

  getById(id: string): LeaderConfig | undefined {
    return this.byId.get(id);
  }

  getByAddress(address: string): LeaderConfig | undefined {
    return this.byAddress.get(address.toLowerCase());
  }
}
