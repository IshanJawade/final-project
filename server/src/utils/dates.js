export function normalizeDateOfBirth(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Date of birth is required');
  }

  const trimmed = input.trim();
  const parts = trimmed.split('/');
  if (parts.length !== 3) {
    throw new Error('Date of birth must be in MM/DD/YYYY format');
  }

  const [monthPart, dayPart, yearPart] = parts;
  const month = Number(monthPart);
  const day = Number(dayPart);
  const year = Number(yearPart);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid month in date of birth');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Invalid day in date of birth');
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('Invalid year in date of birth');
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Date of birth is not a valid calendar date');
  }

  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;

  return { iso, year };
}
