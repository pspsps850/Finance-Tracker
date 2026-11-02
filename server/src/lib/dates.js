const TIME_ZONE = 'Asia/Manila';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function partsInTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = {};

  for (const part of parts) values[part.type] = part.value;

  return values;
}

export function todayKey(date = new Date()) {
  const { year, month, day } = partsInTimeZone(date);
  return `${year}-${month}-${day}`;
}

export function currentMonthKey(date = new Date()) {
  return todayKey(date).slice(0, 7);
}

export function isValidMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY.test(value) && monthRange(value) !== null;
}

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function monthRange(monthKey) {
  if (typeof monthKey !== 'string' || !MONTH_KEY.test(monthKey)) return null;

  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function lastNMonths(count, endMonth = currentMonthKey()) {
  const months = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    months.push(shiftMonth(endMonth, -index));
  }

  return months;
}

export function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function toMysqlDateTime(value) {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const { year, month, day, hour, minute, second } = partsInTimeZone(date);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
