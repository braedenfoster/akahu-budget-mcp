/** Calendar-date math for Bills. Dates are "YYYY-MM-DD" Household dates, computed in UTC so no offset can shift a day. */

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
