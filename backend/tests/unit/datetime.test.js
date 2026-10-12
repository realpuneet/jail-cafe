import {
  addDays,
  formatTime12,
  isDateString,
  isTimeString,
  istDate,
  slotStartsAt,
  weekday,
} from '../../src/utils/datetime.js';

describe('datetime (IST)', () => {
  it('maps an instant to the IST calendar day', () => {
    expect(istDate(new Date('2026-03-10T18:29:59Z'))).toBe('2026-03-10'); // 23:59 IST
    expect(istDate(new Date('2026-03-10T18:30:00Z'))).toBe('2026-03-11'); // 00:00 IST next day
  });
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('computes weekday and slot instants', () => {
    expect(weekday('2026-10-12')).toBe(1); // Monday
    expect(slotStartsAt('2026-10-12', '19:00').toISOString()).toBe('2026-10-12T13:30:00.000Z');
  });
  it('validates strings and formats 12h time', () => {
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('2026-2-3')).toBe(false);
    expect(isDateString('2026-02-28')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
    expect(isTimeString('19:05')).toBe(true);
    expect(formatTime12('00:15')).toBe('12:15 AM');
    expect(formatTime12('19:30')).toBe('7:30 PM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
  });
});
