import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns status ok', () => {
    const result = controller.check();
    expect(result).toHaveProperty('status', 'ok');
  });

  it('returns a valid ISO timestamp', () => {
    const result = controller.check();
    expect(result).toHaveProperty('timestamp');
    const parsed = new Date(result.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });
});
