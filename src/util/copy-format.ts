import { PWM_TEXT } from '../lang';
import type { PasswordCopyFormat, PasswordGroup, PasswordItem } from './types';

const COPY_FIELD_LABELS = {
  title: PWM_TEXT.copyFieldTitle,
  username: PWM_TEXT.copyFieldUsername,
  password: PWM_TEXT.copyFieldPassword,
  url: PWM_TEXT.copyFieldUrl,
  notes: PWM_TEXT.copyFieldNotes,
} as const;

type ParsedCopyItem = {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
};

const COPY_FIELD_KEY_BY_LABEL: Record<string, keyof ParsedCopyItem> = {
  [COPY_FIELD_LABELS.title]: 'title',
  [COPY_FIELD_LABELS.username]: 'username',
  [COPY_FIELD_LABELS.password]: 'password',
  [COPY_FIELD_LABELS.url]: 'url',
  [COPY_FIELD_LABELS.notes]: 'notes',
};

function formatLine(label: string, value: string) {
  return `${label}：${value.trim()}`;
}

function wrapInlineCode(value: string) {
  const normalized = value.trim();
  return normalized ? `\`${normalized}\`` : '';
}

function wrapMarkdownLink(value: string) {
  const normalized = value.trim();
  return normalized ? `<${normalized}>` : '';
}

function unwrapMarkdownValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('`') && normalized.endsWith('`')) {
    return normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith('<') && normalized.endsWith('>')) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function applyParsedCopyField(parsed: ParsedCopyItem, label: string, value: string) {
  const fieldKey = COPY_FIELD_KEY_BY_LABEL[label.trim()];
  if (!fieldKey) {
    return;
  }

  parsed[fieldKey] = unwrapMarkdownValue(value);
}

function getGroupNames(item: PasswordItem, groups: PasswordGroup[]) {
  const groupNameMap = new Map(groups.map((group) => [group.id, group.name]));
  return item.groupIds.map((groupId) => groupNameMap.get(groupId)).filter((name): name is string => !!name && !!name.trim());
}

export function formatPasswordItemForCopy(
  item: PasswordItem,
  groups: PasswordGroup[],
  format: PasswordCopyFormat,
) {
  const title = item.title.trim();
  const username = item.username.trim();
  const password = item.password.trim();
  const url = (item.urls[0] ?? '').trim();
  const notes = item.notes.trim();
  void getGroupNames(item, groups);

  switch (format) {
    case 'plain-text':
      return [
        formatLine(COPY_FIELD_LABELS.title, title),
        formatLine(COPY_FIELD_LABELS.username, username),
        formatLine(COPY_FIELD_LABELS.password, password),
        formatLine(COPY_FIELD_LABELS.url, url),
        formatLine(COPY_FIELD_LABELS.notes, notes),
      ].join('\n');
    case 'callout':
      return [
        `> [!info] ${title}`,
        `> ${COPY_FIELD_LABELS.username}：${wrapInlineCode(username)}`,
        `> ${COPY_FIELD_LABELS.password}：${wrapInlineCode(password)}`,
        `> ${COPY_FIELD_LABELS.url}：${wrapMarkdownLink(url)}`,
        `> ${COPY_FIELD_LABELS.notes}：${notes}`,
      ].join('\n');
    case 'markdown':
    default:
      return [
        `### ${title}`,
        '',
        `- ${COPY_FIELD_LABELS.username}：${wrapInlineCode(username)}`,
        `- ${COPY_FIELD_LABELS.password}：${wrapInlineCode(password)}`,
        `- ${COPY_FIELD_LABELS.url}：${wrapMarkdownLink(url)}`,
        `- ${COPY_FIELD_LABELS.notes}：${notes}`,
      ].join('\n');
  }
}

export function parsePasswordItemFromCopy(text: string) {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();
  const parsed: ParsedCopyItem = {};
  if (!normalizedText) {
    return parsed;
  }

  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('### ')) {
      parsed.title = line.slice(4).trim();
      continue;
    }

    if (line.startsWith('## ')) {
      parsed.title = line.slice(3).trim();
      continue;
    }

    const calloutTitleMatch = line.match(/^>\s*\[!info\]\s*(.*)$/);
    if (calloutTitleMatch) {
      parsed.title = calloutTitleMatch[1].trim();
      continue;
    }

    const fieldLine = line.replace(/^>\s*/, '').replace(/^-\s+/, '');
    const separatorIndex = fieldLine.indexOf('：');
    if (separatorIndex === -1) {
      continue;
    }

    const label = fieldLine.slice(0, separatorIndex);
    const value = fieldLine.slice(separatorIndex + 1);
    applyParsedCopyField(parsed, label, value);
  }

  return parsed;
}