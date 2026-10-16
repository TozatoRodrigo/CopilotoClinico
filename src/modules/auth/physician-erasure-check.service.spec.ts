import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../config/prisma.service';
import {
  MAX_CACHED_PHYSICIANS,
  NOT_ERASED_TTL_MS,
  PhysicianErasureCheck,
} from './physician-erasure-check.service';

const PHYSICIAN_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildCheck(erasedIds: Set<string> = new Set()) {
  const findFirst = vi.fn(async ({ where }: { where: { id: string } }) =>
    erasedIds.has(where.id) ? { id: where.id } : null,
  );
  const prisma = { physician: { findFirst } } as unknown as PrismaService;
  return { check: new PhysicianErasureCheck(prisma), findFirst };
}

describe('PhysicianErasureCheck (CC-018)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the database only for an erased physician, by primary key', async () => {
    const { check, findFirst } = buildCheck();

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: PHYSICIAN_ID, erasedAt: { not: null } },
      select: { id: true },
    });
  });

  it('answers from memory within the TTL and asks again after it', async () => {
    const { check, findFirst } = buildCheck();

    await check.isErased(PHYSICIAN_ID);
    vi.advanceTimersByTime(NOT_ERASED_TTL_MS - 1);
    await check.isErased(PHYSICIAN_ID);
    expect(findFirst).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await check.isErased(PHYSICIAN_ID);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('sees an erasure done elsewhere once the TTL runs out', async () => {
    const erasedIds = new Set<string>();
    const { check } = buildCheck(erasedIds);

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(false);
    erasedIds.add(PHYSICIAN_ID);
    vi.advanceTimersByTime(NOT_ERASED_TTL_MS);

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(true);
  });

  it('markErased takes effect at once, without waiting for the TTL', async () => {
    const { check, findFirst } = buildCheck();

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(false);
    check.markErased(PHYSICIAN_ID);

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('remembers an erasure with no expiry: erasure is irreversible', async () => {
    const { check, findFirst } = buildCheck(new Set([PHYSICIAN_ID]));

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(true);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('a "not erased" read that raced the erasure does not undo the mark', async () => {
    let resolveQuery: (value: null) => void = () => undefined;
    const findFirst = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveQuery = resolve;
        }),
    );
    const check = new PhysicianErasureCheck({
      physician: { findFirst },
    } as unknown as PrismaService);

    // A requisição lê o banco antes do commit da eliminação...
    const pending = check.isErased(PHYSICIAN_ID);
    // ...a eliminação termina e marca...
    check.markErased(PHYSICIAN_ID);
    // ...e só então a leitura antiga ("não eliminado") volta.
    resolveQuery(null);

    await expect(pending).resolves.toBe(true);
    await expect(check.isErased(PHYSICIAN_ID)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('keeps at most MAX_CACHED_PHYSICIANS entries, dropping the oldest', async () => {
    const { check, findFirst } = buildCheck();

    for (let i = 0; i <= MAX_CACHED_PHYSICIANS; i++) {
      await check.isErased(`physician-${i}`);
    }
    expect(findFirst).toHaveBeenCalledTimes(MAX_CACHED_PHYSICIANS + 1);

    // physician-0 foi o primeiro a entrar e saiu para dar lugar ao último.
    await check.isErased('physician-0');
    expect(findFirst).toHaveBeenCalledTimes(MAX_CACHED_PHYSICIANS + 2);
    await check.isErased(`physician-${MAX_CACHED_PHYSICIANS}`);
    expect(findFirst).toHaveBeenCalledTimes(MAX_CACHED_PHYSICIANS + 2);
  });
});
