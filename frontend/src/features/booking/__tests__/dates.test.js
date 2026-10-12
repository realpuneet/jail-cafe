import { addDays, chipLabel, icsFor, istDate, longDate, nextDates, time12 } from '../dates.js';

describe('booking dates (IST)', () => {
  it('maps instants to the IST day', () => {
    expect(istDate(new Date('2026-03-10T18:29:59Z'))).toBe('2026-03-10');
    expect(istDate(new Date('2026-03-10T18:30:00Z'))).toBe('2026-03-11');
  });
  it('adds days across boundaries and lists consecutive dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(nextDates(3, '2026-02-27')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
  it('labels chips relative to today', () => {
    expect(chipLabel('2026-10-12', '2026-10-12')).toEqual({ top: 'Today', day: 12, month: 'Oct' });
    expect(chipLabel('2026-10-13', '2026-10-12').top).toBe('Tomorrow');
    expect(chipLabel('2026-10-15', '2026-10-12').top).toBe('Thu');
  });
  it('formats long dates and 12h times', () => {
    expect(longDate('2026-10-12')).toBe('Mon, 12 Oct 2026');
    expect(time12('00:05')).toBe('12:05 AM');
    expect(time12('19:30')).toBe('7:30 PM');
    expect(time12('12:00')).toBe('12:00 PM');
  });
  it('builds a valid .ics event in IST', () => {
    const ics = icsFor({
      bookingNumber: 'TB-1',
      date: '2026-10-12',
      slot: { startTime: '19:00', endTime: '20:30' },
      guests: 4,
    });
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20261012T190000');
    expect(ics).toContain('DTEND;TZID=Asia/Kolkata:20261012T203000');
    expect(ics).toContain('SUMMARY:Table for 4 at Jail Ki Chai');
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
  });
});
