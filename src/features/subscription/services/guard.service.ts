export class SubscriptionGuard {
  static async canUse(userId: string): Promise<boolean> {
    void userId;
    return true;
  }

  static async assert(userId: string): Promise<void> {
    const allowed = await this.canUse(userId);

    if (!allowed) {
      throw new Error("Subscription required");
    }
  }
}
