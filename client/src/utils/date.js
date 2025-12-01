const ISO_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;
const US_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

export function formatDateMMDDYYYY(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    const isoMatch = ISO_REGEX.exec(trimmed);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${month}/${day}/${year}`;
    }

    const usMatch = US_REGEX.exec(trimmed);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year.padStart(4, '0')}`;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  return `${month}/${day}/${year}`;
}

export function formatDateForInput(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    const isoMatch = ISO_REGEX.exec(value.trim());
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${month}-${day}`;
    }

    const usMatch = US_REGEX.exec(value.trim());
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  return `${year}-${month}-${day}`;
}
