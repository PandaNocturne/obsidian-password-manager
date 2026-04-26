import { PWM_TEXT } from '../lang';
import type { PasswordCopyFormat, PasswordGroup, PasswordItem, PasswordManagerData, PasswordManagerExportPayload } from '../util/types';

interface ParsedMarkdownGroup {
  groupName: string;
  items: Partial<PasswordItem>[];
}

const MARKDOWN_FIELD_LABELS = {
  username: [PWM_TEXT.COPY_FIELD_USERNAME, 'Username'],
  password: [PWM_TEXT.COPY_FIELD_PASSWORD, 'Password'],
  url: [PWM_TEXT.COPY_FIELD_URL, 'URL', 'Link'],
  notes: [PWM_TEXT.COPY_FIELD_NOTES, 'Notes'],
  groupTags: [PWM_TEXT.COPY_FIELD_GROUP_TAGS, 'Group Tags'],
} as const;

const CSV_HEADER_ALIASES = {
  group: ['group', '组', 'groupName'],
  title: ['title', '标题'],
  username: ['username', '账号'],
  password: ['password', '密码'],
  url: ['url', 'link', '链接'],
  notes: ['notes', 'remark', '备注'],
  pinned: ['pinned', '置顶'],
  createdAt: ['createdAt', '创建时间'],
} as const;

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

function matchLookupKey(value: string, aliases: readonly string[]) {
  const normalized = normalizeLookupKey(value);
  return aliases.some((alias) => normalizeLookupKey(alias) === normalized);
}

function getMarkdownFieldLabel(key: keyof typeof MARKDOWN_FIELD_LABELS) {
  return MARKDOWN_FIELD_LABELS[key][0];
}

function parseMarkdownFieldLabel(label: string) {
  if (matchLookupKey(label, MARKDOWN_FIELD_LABELS.username)) {
    return 'username';
  }
  if (matchLookupKey(label, MARKDOWN_FIELD_LABELS.password)) {
    return 'password';
  }
  if (matchLookupKey(label, MARKDOWN_FIELD_LABELS.url)) {
    return 'url';
  }
  if (matchLookupKey(label, MARKDOWN_FIELD_LABELS.notes)) {
    return 'notes';
  }
  if (matchLookupKey(label, MARKDOWN_FIELD_LABELS.groupTags)) {
    return 'groupTags';
  }
  return null;
}

function getCsvHeaderIndex(headerMap: Map<string, number>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const index = headerMap.get(normalizeLookupKey(alias));
    if (index !== undefined) {
      return index;
    }
  }
  return undefined;
}

function escapeMarkdownValue(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function wrapInlineCode(value: string) {
  const normalized = escapeMarkdownValue(value);
  return normalized ? `\`${normalized}\`` : '';
}

function wrapMarkdownLink(value: string) {
  const normalized = escapeMarkdownValue(value);
  return normalized ? `<${normalized}>` : '';
}

function formatMarkdownUrls(item: Pick<PasswordItem, 'urls'> & { url?: string }) {
  const urls = item.urls.length ? item.urls : (item.url ? [item.url] : []);
  if (!urls.length) {
    return '';
  }
  if (urls.length === 1) {
    return wrapMarkdownLink(urls[0] ?? '');
  }
  return `\n${urls.map((url) => `    - ${wrapMarkdownLink(url)}`).join('\n')}`;
}

function formatCalloutUrls(item: Pick<PasswordItem, 'urls'> & { url?: string }) {
  const urls = item.urls.length ? item.urls : (item.url ? [item.url] : []);
  if (!urls.length) {
    return '';
  }
  if (urls.length === 1) {
    return wrapMarkdownLink(urls[0] ?? '');
  }
  return `\n${urls.map((url) => `>   - ${wrapMarkdownLink(url)}`).join('\n')}`;
}

function formatMarkdownIndentedValue(value: string) {
  const normalized = escapeMarkdownValue(value);
  if (!normalized) {
    return '';
  }

  return `\n${normalized.split('\n').map((line) => `    ${line}`).join('\n')}`;
}

function formatCalloutIndentedValue(value: string) {
  const normalized = escapeMarkdownValue(value);
  if (!normalized) {
    return '';
  }

  return `\n${normalized.split('\n').map((line) => `>     ${line}`).join('\n')}`;
}

function unwrapMarkdownValue(value: string) {
  return value.trim().replace(/^`([^`]*)`$/, '$1').replace(/^<([^>]+)>$/, '$1').trim();
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/\r\n/g, '\n');
  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/g, '""')}"`;
}

function parseCsvRows(text: string) {
  const normalized = text.replace(/\r\n/g, '\n');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (char === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if (char === '\n' && !inQuotes) {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  rows.push(currentRow);

  return rows.filter((row) => row.some((value) => value.length > 0));
}

function createEmptyImportedItem(title = ''): Partial<PasswordItem> {
  return {
    title,
    username: '',
    password: '',
    urls: [],
    notes: '',
    pinned: false,
  };
}

function getPrimaryUrl(item: Pick<PasswordItem, 'urls'> & { url?: string }) {
  return item.urls[0] ?? item.url ?? '';
}

function getJoinedUrls(item: Pick<PasswordItem, 'urls'> & { url?: string }) {
  return (item.urls.length ? item.urls : (item.url ? [item.url] : [])).join('\n');
}

function buildMarkdownItemLines(item: PasswordItem, headingLevel: 2 | 3, format: PasswordCopyFormat) {
  const headingPrefix = '#'.repeat(headingLevel);
  const title = escapeMarkdownValue(item.title) || PWM_TEXT.UNTITLED_ITEM;

  if (format === 'callout') {
    return [
      `> [!info] ${title}`,
      `> - ${getMarkdownFieldLabel('username')}：${wrapInlineCode(item.username)}`,
      `> - ${getMarkdownFieldLabel('password')}：${wrapInlineCode(item.password)}`,
      `> - ${getMarkdownFieldLabel('url')}：${formatCalloutUrls(item)}`,
      `> - ${getMarkdownFieldLabel('notes')}：${formatCalloutIndentedValue(item.notes)}`,
    ].join('\n');
  }

  return [
    `${headingPrefix} ${title}`,
    '',
    `- ${getMarkdownFieldLabel('username')}：${wrapInlineCode(item.username)}`,
    `- ${getMarkdownFieldLabel('password')}：${wrapInlineCode(item.password)}`,
    `- ${getMarkdownFieldLabel('url')}：${formatMarkdownUrls(item)}`,
    `- ${getMarkdownFieldLabel('notes')}：${formatMarkdownIndentedValue(item.notes)}`,
  ].join('\n');
}

function formatGroupedMarkdown(groupName: string, items: PasswordItem[], format: PasswordCopyFormat) {
  const itemBlocks = items.map((item) => buildMarkdownItemLines(item, 3, format));
  return [
    `## ${escapeMarkdownValue(groupName) || PWM_TEXT.UNTITLED_GROUP}`,
    ...itemBlocks,
  ].join('\n\n');
}

function parseMarkdownUrlList(lines: string[], startIndex: number) {
  const urls: string[] = [];
  let nextIndex = startIndex;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? '';
    const match = line.match(/^\s*-\s+(.*)$/);
    if (!match) {
      break;
    }
    const value = unwrapMarkdownValue(match[1] ?? '');
    if (value) {
      urls.push(value);
    }
    nextIndex += 1;
  }

  return { urls, nextIndex };
}

function parseMarkdownIndentedValue(lines: string[], startIndex: number) {
  const values: string[] = [];
  let nextIndex = startIndex;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? '';
    if (!line.startsWith('    ')) {
      break;
    }
    values.push(line.slice(4));
    nextIndex += 1;
  }

  return {
    value: values.join('\n').trim(),
    nextIndex,
  };
}

function parseGroupedMarkdownGroups(text: string): ParsedMarkdownGroup[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const groups: ParsedMarkdownGroup[] = [];
  let currentGroup: ParsedMarkdownGroup | null = null;
  let currentItem: Partial<PasswordItem> | null = null;

  const ensureGroup = () => {
    if (currentGroup) {
      return currentGroup;
    }
    currentGroup = { groupName: '', items: [] };
    groups.push(currentGroup);
    return currentGroup;
  };

  const startItem = (title: string) => {
    currentItem = createEmptyImportedItem(title);
    ensureGroup().items.push(currentItem);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (line.startsWith('## ')) {
      currentGroup = { groupName: line.slice(3).trim(), items: [] };
      groups.push(currentGroup);
      currentItem = null;
      continue;
    }

    if (line.startsWith('### ')) {
      startItem(line.slice(4).trim());
      continue;
    }

    if (!currentItem) {
      continue;
    }
    const itemRef: Partial<PasswordItem> = currentItem;

    const match = line.match(/^-\s*([^：:]+)[：:](.*)$/);
    if (!match) {
      continue;
    }

    const rawLabel = match[1] ?? '';
    const rawValue = match[2] ?? '';
    const field = parseMarkdownFieldLabel(rawLabel);
    if (!field) {
      continue;
    }

    const value = unwrapMarkdownValue(rawValue);
    switch (field) {
      case 'username':
        itemRef.username = value;
        break;
      case 'password':
        itemRef.password = value;
        break;
      case 'url': {
        if (value) {
          itemRef.urls = [value];
          break;
        }
        const { urls, nextIndex } = parseMarkdownUrlList(lines, index + 1);
        itemRef.urls = urls;
        index = nextIndex - 1;
        break;
      }
      case 'notes': {
        if (value) {
          itemRef.notes = value;
          break;
        }
        const { value: noteValue, nextIndex } = parseMarkdownIndentedValue(lines, index + 1);
        itemRef.notes = noteValue;
        index = nextIndex - 1;
        break;
      }
      default:
        break;
    }
  }

  return groups.filter((group) => group.items.length > 0 || group.groupName);
}

function parseFlatMarkdownItems(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new Error('Invalid markdown payload');
  }

  const sections = normalized
    .split(/\n(?:---|___|\*\*\*)\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section) => {
    const lines = section.split('\n');
    const heading = lines.find((line) => line.startsWith('## ') || line.startsWith('### '));
    const title = !heading
      ? ''
      : heading.startsWith('### ')
        ? heading.slice(4).trim()
        : heading.slice(3).trim();
    const item = createEmptyImportedItem(title);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const match = line.match(/^-\s*([^：:]+)[：:](.*)$/);
      if (!match) {
        continue;
      }

      const rawLabel = match[1] ?? '';
      const rawValue = match[2] ?? '';
      const field = parseMarkdownFieldLabel(rawLabel);
      if (!field) {
        continue;
      }

      const value = unwrapMarkdownValue(rawValue);
      switch (field) {
        case 'username':
          item.username = value;
          break;
        case 'password':
          item.password = value;
          break;
        case 'url': {
          if (value) {
            item.urls = [value];
            break;
          }
          const { urls, nextIndex } = parseMarkdownUrlList(lines, index + 1);
          item.urls = urls;
          index = nextIndex - 1;
          break;
        }
        case 'notes': {
          if (value) {
            item.notes = value;
            break;
          }
          const { value: noteValue, nextIndex } = parseMarkdownIndentedValue(lines, index + 1);
          item.notes = noteValue;
          index = nextIndex - 1;
          break;
        }
        default:
          break;
      }
    }

    return item;
  });
}

export function parseImportPayload(text: string): PasswordManagerExportPayload {
  return JSON.parse(text) as PasswordManagerExportPayload;
}

export function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, payload: PasswordManagerExportPayload) {
  downloadText(filename, JSON.stringify(payload, null, 2), 'application/json');
}

export function downloadMarkdownItems(
  filename: string,
  items: PasswordItem[],
  groups: PasswordGroup[],
  format: PasswordCopyFormat,
) {
  const groupedContent = groups
    .filter((group) => items.some((item) => item.groupIds.includes(group.id)))
    .map((group) => formatGroupedMarkdown(group.name, items.filter((item) => item.groupIds.includes(group.id)), format))
    .join('\n\n');

  downloadText(filename, groupedContent, 'text/markdown;charset=utf-8');
}

export function downloadMarkdownGroups(
  filename: string,
  groupsWithItems: Array<{ group: PasswordGroup; items: PasswordItem[] }>,
  format: PasswordCopyFormat,
) {
  const content = groupsWithItems
    .filter(({ items }) => items.length > 0)
    .map(({ group, items }) => formatGroupedMarkdown(group.name, items, format))
    .join('\n\n');

  downloadText(filename, content, 'text/markdown;charset=utf-8');
}

export function downloadMarkdownGroup(filename: string, group: PasswordGroup, items: PasswordItem[], format: PasswordCopyFormat) {
  downloadText(filename, formatGroupedMarkdown(group.name, items, format), 'text/markdown;charset=utf-8');
}

export function exportLibraryToMarkdown(groups: PasswordGroup[], items: PasswordItem[], format: PasswordCopyFormat) {
  return groups
    .map((group) => formatGroupedMarkdown(group.name, items.filter((item) => item.groupIds.includes(group.id)), format))
    .filter(Boolean)
    .join('\n\n');
}

export function downloadCsvGroups(filename: string, groupsWithItems: Array<{ group: PasswordGroup; items: PasswordItem[] }>) {
  const header = ['group', 'title', 'username', 'password', 'url', 'notes', 'pinned', 'createdAt'];
  const rows = groupsWithItems.flatMap(({ group, items }) => items.map((item) => [
    group.name,
    item.title,
    item.username,
    item.password,
    getJoinedUrls(item),
    item.notes,
    String(item.pinned),
    String(item.createdAt),
  ].map(escapeCsvValue).join(',')));

  downloadText(filename, [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
}

export function downloadCsvGroup(filename: string, group: PasswordGroup, items: PasswordItem[]) {
  const header = ['group', 'title', 'username', 'password', 'url', 'notes', 'pinned', 'createdAt'];
  const rows = items.map((item) => [
    group.name,
    item.title,
    item.username,
    item.password,
    getJoinedUrls(item),
    item.notes,
    String(item.pinned),
    String(item.createdAt),
  ].map(escapeCsvValue).join(','));

  downloadText(filename, [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
}

export function parseMarkdownGroup(text: string) {
  const groups = parseGroupedMarkdownGroups(text).filter((group) => group.items.length > 0);
  const firstGroup = groups[0];
  if (!firstGroup) {
    throw new Error('Invalid markdown payload');
  }

  return {
    groupName: firstGroup.groupName || PWM_TEXT.IMPORT_GROUP_FALLBACK_NAME,
    items: firstGroup.items,
  };
}

export function parseCsvGroup(text: string) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    throw new Error('Invalid csv payload');
  }

  const headers = rows[0];
  if (!headers) {
    throw new Error('Invalid csv payload');
  }
  const headerMap = new Map(headers.map((header, index) => [normalizeLookupKey(header), index]));
  const groupIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.group);
  const titleIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.title);
  const usernameIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.username);
  const passwordIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.password);
  const urlIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.url);
  const notesIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.notes);
  const pinnedIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.pinned);
  const createdAtIndex = getCsvHeaderIndex(headerMap, CSV_HEADER_ALIASES.createdAt);

  if (groupIndex === undefined || titleIndex === undefined) {
    throw new Error('Invalid csv payload');
  }

  const dataRows = rows.slice(1);
  return {
    groupName: dataRows[0]?.[groupIndex]?.trim() || PWM_TEXT.IMPORT_GROUP_FALLBACK_NAME,
    items: dataRows.map((row) => ({
      title: row[titleIndex]?.trim() || '',
      username: row[usernameIndex ?? -1]?.trim() || '',
      password: row[passwordIndex ?? -1]?.trim() || '',
      urls: (row[urlIndex ?? -1]?.split(/\r?\n/) ?? []).map((value) => value.trim()).filter(Boolean),
      notes: row[notesIndex ?? -1]?.trim() || '',
      pinned: row[pinnedIndex ?? -1]?.trim() === 'true',
      createdAt: Number(row[createdAtIndex ?? -1]) || undefined,
    })),
  };
}

export function parseMarkdownItems(text: string, data: PasswordManagerData, defaultGroupId: string) {
  const groupedItems = parseGroupedMarkdownGroups(text)
    .flatMap((group) => group.items)
    .filter((item) => item.title || item.username || item.password || item.urls?.length || item.notes);

  if (groupedItems.length) {
    return groupedItems.map((item) => ({
      ...createEmptyImportedItem(item.title || ''),
      ...item,
    }));
  }

  return parseFlatMarkdownItems(text).map((item) => ({
    ...createEmptyImportedItem(item.title || ''),
    ...item,
  }));
}