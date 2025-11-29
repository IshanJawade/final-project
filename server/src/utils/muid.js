export function generateMuid(name, yearOfBirth) {
  const firstName = name.trim().split(/\s+/)[0].toLowerCase();
  const year = Number(yearOfBirth);
  if (!firstName) {
    throw new Error('Name is required to generate MUID');
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('Invalid yearOfBirth for MUID generation');
  }

  const lastTwoDigits = String(year).slice(-2);
  const randomNumber = Math.floor(Math.random() * 10000);
  const randomFour = randomNumber.toString().padStart(4, '0');

  const asciiSum = firstName
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const asciiComponent = String(asciiSum).padStart(4, '0').slice(0, 4);

  return `MI${lastTwoDigits}${randomFour}${asciiComponent}`;
}
