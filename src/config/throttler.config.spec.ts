import { describe, it, expect } from 'vitest';
import { throttlerConfig } from './throttler.config';

describe('throttlerConfig', () => {
  it('contains two throttlers', () => {
    expect(throttlerConfig.throttlers).toHaveLength(2);
  });

  it('has "short" throttler with default 100 limit and 60000 ttl', () => {
    const shortConfig = throttlerConfig.throttlers.find((t) => t.name === 'short');
    expect(shortConfig).toBeDefined();
    expect(shortConfig!.limit).toBe(100);
    expect(shortConfig!.ttl).toBe(60000);
  });

  it('has "auth" throttler with limit 5 and ttl 60000', () => {
    const authConfig = throttlerConfig.throttlers.find((t) => t.name === 'auth');
    expect(authConfig).toBeDefined();
    expect(authConfig!.limit).toBe(5);
    expect(authConfig!.ttl).toBe(60000);
  });
});
