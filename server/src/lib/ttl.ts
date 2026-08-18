const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttl}`);
  }
  const [, value, unit] = match;
  return Number(value) * UNIT_MS[unit];
}
