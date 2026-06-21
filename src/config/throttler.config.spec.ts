import { describe, it, expect } from 'vitest';
import { throttlerConfig } from './throttler.config';

describe('throttlerConfig', () => {
  it('contains one global throttler', () => {
    expect(throttlerConfig.throttlers).toHaveLength(1);
  });

  it('has "short" throttler with default 100 limit and 60000 ttl', () => {
    const shortConfig = throttlerConfig.throttlers.find((t) => t.name === 'short');
    expect(shortConfig).toBeDefined();
    expect(shortConfig!.limit).toBe(100);
    expect(shortConfig!.ttl).toBe(60000);
  });
});
