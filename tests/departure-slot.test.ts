import { afterEach, describe, expect, it } from 'vitest';
import { defaults } from '../src/core';
import { nextDepartureSlot } from '../src/weather';

const zone = process.env.TZ;
afterEach(() => {
  process.env.TZ = zone;
});
const slot = (iso: string) =>
  new Date(nextDepartureSlot(Date.parse(iso))).toISOString();

describe('next departure slot', () => {
  it('rounds up to the next :00 or :30 and keeps an exact slot', () => {
    process.env.TZ = 'UTC';
    expect(slot('2026-11-07T10:07:00Z')).toBe('2026-11-07T10:30:00.000Z');
    expect(slot('2026-11-07T10:40:00Z')).toBe('2026-11-07T11:00:00.000Z');
    expect(slot('2026-11-07T10:30:00Z')).toBe('2026-11-07T10:30:00.000Z');
    expect(slot('2026-11-07T10:00:00Z')).toBe('2026-11-07T10:00:00.000Z');
    expect(slot('2026-11-07T10:30:00.001Z')).toBe('2026-11-07T11:00:00.000Z');
    expect(slot('2026-11-07T10:29:59Z')).toBe('2026-11-07T10:30:00.000Z');
  });

  it('crosses midnight, month and year ends', () => {
    process.env.TZ = 'UTC';
    expect(slot('2026-11-07T23:45:00Z')).toBe('2026-11-08T00:00:00.000Z');
    expect(slot('2026-11-30T23:31:00Z')).toBe('2026-12-01T00:00:00.000Z');
    expect(slot('2026-12-31T23:59:00Z')).toBe('2027-01-01T00:00:00.000Z');
  });

  it('uses local time, including half-hour offsets and a DST change', () => {
    process.env.TZ = 'America/Sao_Paulo';
    // 07:07 in São Paulo (UTC−3) becomes 07:30.
    expect(slot('2026-11-07T10:07:00Z')).toBe('2026-11-07T10:30:00.000Z');
    process.env.TZ = 'Asia/Kolkata';
    // 15:37 in India (UTC+5:30) becomes 16:00 local, 10:30 UTC.
    expect(slot('2026-11-07T10:07:00Z')).toBe('2026-11-07T10:30:00.000Z');
    process.env.TZ = 'America/New_York';
    // 01:45 EST on 8 March 2026: 02:00 does not exist, so 03:00 EDT.
    expect(slot('2026-03-08T06:45:00Z')).toBe('2026-03-08T07:00:00.000Z');
    expect(
      new Date(
        nextDepartureSlot(Date.parse('2026-03-08T06:45:00Z')),
      ).getHours(),
    ).toBe(3);
  });
});

describe('automatic departure', () => {
  it('stands in only without a chosen departure, and can be declined or turned off', async () => {
    process.env.TZ = 'UTC';
    const {
      declineAutomaticDeparture,
      departureOf,
      isAutomaticDeparture,
      setAutomaticDeparture,
      untilNextSlot,
    } = await import('../src/departure');
    const now = Date.parse('2026-11-07T10:07:00Z');
    const state = defaults();
    expect(departureOf(state, now)).toBe('2026-11-07T10:30:00.000Z');
    expect(isAutomaticDeparture(state, now)).toBe(true);
    expect(untilNextSlot(now)).toBe(23 * 60_000 + 1);
    // A chosen departure always wins and is never automatic.
    const chosen = { ...state, departure: '2026-11-08T15:00:00.000Z' };
    expect(departureOf(chosen, now)).toBe('2026-11-08T15:00:00.000Z');
    expect(isAutomaticDeparture(chosen, now)).toBe(false);
    declineAutomaticDeparture();
    expect(departureOf(state, now)).toBeUndefined();
    setAutomaticDeparture(true);
    expect(departureOf(state, now)).toBe('2026-11-07T10:30:00.000Z');
    setAutomaticDeparture(false);
    expect(departureOf(state, now)).toBeUndefined();
    expect(localStorage.getItem('auto-departure')).toBe('off');
    setAutomaticDeparture(true);
    expect(localStorage.getItem('auto-departure')).toBeNull();
    expect(departureOf(state, now)).toBe('2026-11-07T10:30:00.000Z');
  });
});
