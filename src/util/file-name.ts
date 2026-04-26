import { PWM_TEXT } from '../lang';

export function formatDateTimeSuffix(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

const INVALID_FILE_NAME_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const TRAILING_FILE_NAME_CHARACTERS_REGEX = /[.\s]+$/;
const WINDOWS_RESERVED_FILE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

export function validateFileSafeName(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return PWM_TEXT.FILE_NAME_EMPTY;
  }

  const hasInvalidCharacter = [...trimmedValue].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return INVALID_FILE_NAME_CHARACTERS.has(char) || codePoint <= 0x1F;
  });
  if (hasInvalidCharacter) {
    return PWM_TEXT.FILE_NAME_INVALID_CHARS;
  }

  if (TRAILING_FILE_NAME_CHARACTERS_REGEX.test(trimmedValue)) {
    return PWM_TEXT.FILE_NAME_TRAILING_CHARS;
  }

  const extensionIndex = trimmedValue.indexOf('.');
  const baseName = (extensionIndex >= 0 ? trimmedValue.slice(0, extensionIndex) : trimmedValue).trim().toUpperCase();
  if (WINDOWS_RESERVED_FILE_NAMES.has(baseName)) {
    return PWM_TEXT.FILE_NAME_WINDOWS_RESERVED;
  }

  return null;
}

export function appendDateTimeSuffix(filename: string, timestamp = Date.now()) {
  const suffix = formatDateTimeSuffix(timestamp);
  const extensionIndex = filename.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return `${filename}-${suffix}`;
  }

  const name = filename.slice(0, extensionIndex);
  const extension = filename.slice(extensionIndex);
  return `${name}-${suffix}${extension}`;
}