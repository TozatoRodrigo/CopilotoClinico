import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { buildApp } from '../helpers/app';

describe('Health Check (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health returns 200 with status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
  });

  it('GET /v1/health returns valid ISO timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    const body = response.json();
    const parsedDate = new Date(body.timestamp);
    expect(parsedDate.getTime()).not.toBeNaN();
  });
});
