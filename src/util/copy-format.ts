import { PWM_TEXT } from '../lang';
import type { PasswordCopyFormat, PasswordGroup, PasswordItem } from './types';

const COPY_FIELD_LABELS = {
  title: PWM_TEXT.COPY_FIELD_TITLE,
  username: PWM_TEXT.COPY_FIELD_USERNAME,
  password: PWM_TEXT.COPY_FIELD_PASSWORD,
  url: PWM_TEXT.COPY_FIELD_URL,
  notes: PWM_TEXT.COPY_FIELD_NOTES,
} as const;

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

function formatUrls(urls: string[]) {
  return urls.map((url) => url.trim()).filter(Boolean);
}

function formatUrlsForPlainText(urls: string[]) {
  return formatUrls(urls).join(' | ');
}

function formatUrlsForStructuredText(urls: string[]) {
  const normalizedUrls = formatUrls(urls);
  if (!normalizedUrls.length) {
    return '';
  }

  if (normalizedUrls.length === 1) {
    return wrapMarkdownLink(normalizedUrls[0] ?? '');
  }

  return normalizedUrls.map((url) => `\n    - ${wrapMarkdownLink(url)}`).join('');
}

function formatNotesForMarkdown(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  return `\n${normalized.split(/\r?\n/).map((line) => `    ${line}`).join('\n')}`;
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
  const urls = formatUrls(item.urls);
  const notes = item.notes.trim();
  void getGroupNames(item, groups);

  switch (format) {
    case 'plain-text':
      return [
        formatLine(COPY_FIELD_LABELS.title, title),
        formatLine(COPY_FIELD_LABELS.username, username),
        formatLine(COPY_FIELD_LABELS.password, password),
        formatLine(COPY_FIELD_LABELS.url, formatUrlsForPlainText(urls)),
        formatLine(COPY_FIELD_LABELS.notes, notes),
      ].join('\n');
    case 'callout':
      return [
        `> [!info] ${title}`,
        `> ${COPY_FIELD_LABELS.username}：${wrapInlineCode(username)}`,
        `> ${COPY_FIELD_LABELS.password}：${wrapInlineCode(password)}`,
        `> ${COPY_FIELD_LABELS.url}：${formatUrlsForStructuredText(urls)}`,
        `> ${COPY_FIELD_LABELS.notes}：${notes}`,
      ].join('\n');
    case 'markdown':
    default:
      return [
        `### ${title}`,
        '',
        `- ${COPY_FIELD_LABELS.username}：${wrapInlineCode(username)}`,
        `- ${COPY_FIELD_LABELS.password}：${wrapInlineCode(password)}`,
        `- ${COPY_FIELD_LABELS.url}：${formatUrlsForStructuredText(urls)}`,
        `- ${COPY_FIELD_LABELS.notes}：${formatNotesForMarkdown(notes)}`,
      ].join('\n');
  }
}