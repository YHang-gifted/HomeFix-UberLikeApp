/** A user's set of registered device push tokens. Membership is unique per (user, token). */
export interface DeviceTokenRepository {
  add(userId: string, token: string): Promise<void>;
  listTokens(userId: string): Promise<string[]>;
  clear(): Promise<void>;
}

export class InMemoryDeviceTokenRepository implements DeviceTokenRepository {
  private readonly byUser = new Map<string, Set<string>>();

  public add(userId: string, token: string): Promise<void> {
    const set = this.byUser.get(userId) ?? new Set<string>();
    set.add(token);
    this.byUser.set(userId, set);
    return Promise.resolve();
  }

  public listTokens(userId: string): Promise<string[]> {
    return Promise.resolve([...(this.byUser.get(userId) ?? [])]);
  }

  public clear(): Promise<void> {
    this.byUser.clear();
    return Promise.resolve();
  }
}

// In-memory only for now; a Postgres-backed repository + factory follow in the
// next slice (mirroring favorites).
export const deviceTokenRepository: DeviceTokenRepository = new InMemoryDeviceTokenRepository();
