import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { scrubSentryEvent } from './sentry-scrub';

function eventWithRequest(): ErrorEvent {
  return {
    type: undefined,
    message: 'boom',
    request: {
      method: 'POST',
      url: 'https://api.copiloto.test/v1/encounters/enc-1/copilot/analyze?debug=Maria',
      data: { caseText: 'Maria da Silva, 54 anos, dor torácica' },
      query_string: 'debug=Maria',
      cookies: { refresh_token: 'abc' },
      headers: {
        authorization: 'Bearer eyJ...',
        'User-Agent': 'Mozilla/5.0',
        'content-type': 'application/json',
      },
    },
  };
}

describe('scrubSentryEvent', () => {
  it('drops the body, query, cookies and credential headers, keeping method and path', () => {
    const scrubbed = scrubSentryEvent(eventWithRequest());

    expect(scrubbed.request).toEqual({
      method: 'POST',
      url: 'https://api.copiloto.test/v1/encounters/enc-1/copilot/analyze',
      headers: { 'User-Agent': 'Mozilla/5.0', 'content-type': 'application/json' },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('Maria');
    expect(JSON.stringify(scrubbed)).not.toContain('Bearer');
  });

  it('leaves events without request untouched', () => {
    const event: ErrorEvent = { type: undefined, message: 'alerta' };

    expect(scrubSentryEvent(event)).toBe(event);
  });
});
