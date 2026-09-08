export type MarketSnapshot = {
  symbol: string;
  price: number | string;
  change_24h: number | string;
  volume_24h: number | string;
  ts: number;
};

const TTL_MS = 30 * 60 * 1000;

const store = new Map<string, MarketSnapshot>();

export function setSnapshot(snapshot: {
  symbol: string;
  price: number | string;
  change_24h: number | string;
  volume_24h: number | string;
  ts?: number;
}): void {
  const symbol = String(snapshot.symbol).toUpperCase();

  const item: MarketSnapshot = {
    symbol,
    price: snapshot.price,
    change_24h: snapshot.change_24h,
    volume_24h: snapshot.volume_24h,
    ts: snapshot.ts ?? Date.now(),
  };

  store.set(symbol, item);
}

export function getSnapshot(symbol: string): MarketSnapshot | null {
  const key = String(symbol).toUpperCase();

  const item = store.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() - item.ts > TTL_MS) {
    store.delete(key);
    return null;
  }

  return item;
}

export function clearExpired(): void {
  const now = Date.now();

  for (const [key, value] of store.entries()) {
    if (now - value.ts > TTL_MS) {
      store.delete(key);
    }
  }
}

export function listSnapshots(): MarketSnapshot[] {
  clearExpired();
  return Array.from(store.values());
}