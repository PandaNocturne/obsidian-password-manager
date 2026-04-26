import { PWM_TEXT } from '../lang';
import type { PasswordItem } from './types';

export function getNextDuplicatedTitle(items: PasswordItem[], title: string) {
  const match = title.match(/^(.*?)(?:\s*\((\d+)\))?$/);
  const baseTitle = match?.[1]?.trim() || title.trim() || PWM_TEXT.UNTITLED_ITEM;
  const escapedBaseTitle = escapeRegExp(baseTitle);
  const duplicateRegex = new RegExp(`^${escapedBaseTitle}(?:\\s*\\((\\d+)\\))?$`);

  let maxIndex = 1;
  items.forEach((item) => {
    const duplicateMatch = item.title.match(duplicateRegex);
    if (!duplicateMatch) {
      return;
    }
    const nextIndex = duplicateMatch[1] ? Number(duplicateMatch[1]) : 1;
    if (Number.isFinite(nextIndex)) {
      maxIndex = Math.max(maxIndex, nextIndex);
    }
  });

  return `${baseTitle} (${maxIndex + 1})`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}