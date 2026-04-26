import { createId } from '../util/id';
import { decryptPasswordManagerData, isEncryptedLibraryPayload } from '../util/encryption';
import type {
  PasswordGroup,
  PasswordItem,
  PasswordManagerData,
  PasswordManagerExportPayload,
} from '../util/types';
import { normalizeImportedLibraryData, normalizeUrls } from './normalize';
import { createGroup, createItem, reindexOrders } from './password-library-service';
import { parseCsvGroup, parseImportPayload, parseMarkdownGroup, parseMarkdownItems } from './transfer';

function assertImportPayload(
  payload: PasswordManagerExportPayload,
  kind: PasswordManagerExportPayload['kind'],
): void {
  if (payload.kind !== kind) {
    throw new Error('Invalid import payload');
  }
}

function applyImportedItem(data: PasswordManagerData, groupId: string, source: Partial<PasswordItem> & { url?: unknown }, index = 0) {
  const item = createItem(data, groupId);
  item.id = createId();
  item.title = source.title || item.title;
  item.username = source.username || '';
  item.password = source.password || '';
  item.urls = normalizeUrls(source.urls ?? source.url);
  item.notes = source.notes || '';
  item.createdAt = typeof source.createdAt === 'number' ? source.createdAt : Date.now() + index;
  item.groupIds = [groupId];
  item.pinned = !!source.pinned;
  return item;
}

function parseLibraryImportData(payload: unknown): PasswordManagerData {
  if (isEncryptedLibraryPayload(payload)) {
    throw new Error('Encrypted import payload requires password');
  }

  const rawPayload = payload as Partial<PasswordManagerExportPayload> | PasswordManagerData;
  if (
    rawPayload
    && typeof rawPayload === 'object'
    && 'kind' in rawPayload
    && rawPayload.kind === 'library'
    && 'data' in rawPayload
  ) {
    const data = (rawPayload as PasswordManagerExportPayload).data as PasswordManagerData;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import payload');
    }
    return data;
  }

  if (rawPayload && typeof rawPayload === 'object' && 'groups' in rawPayload && 'items' in rawPayload) {
    return rawPayload as PasswordManagerData;
  }

  throw new Error('Invalid import payload');
}

export function isEncryptedLibraryImportText(text: string): boolean {
  try {
    return isEncryptedLibraryPayload(JSON.parse(text));
  } catch {
    return false;
  }
}

export async function importLibraryFromText(text: string, password?: string): Promise<PasswordManagerData> {
  const payload = JSON.parse(text) as unknown;
  if (isEncryptedLibraryPayload(payload)) {
    if (!password) {
      throw new Error('Missing encryption password');
    }
    const imported = normalizeImportedLibraryData(await decryptPasswordManagerData(payload, password));
    reindexOrders(imported);
    return imported;
  }

  const data = parseLibraryImportData(payload);
  const imported = normalizeImportedLibraryData(data);
  reindexOrders(imported);
  return imported;
}

export function importGroupFromText(text: string, data: PasswordManagerData): PasswordGroup {
  let groupName = '';
  let items: Partial<PasswordItem>[] = [];
  let createdAt = Date.now();

  try {
    const payload = parseImportPayload(text);
    assertImportPayload(payload, 'group');

    if (
      typeof payload.data !== 'object' ||
      !payload.data ||
      !('group' in payload.data) ||
      !('items' in payload.data)
    ) {
      throw new Error('Invalid import payload');
    }

    const source = payload.data as { group: Partial<PasswordGroup>; items: Partial<PasswordItem>[] };
    groupName = source.group.name || '';
    createdAt = typeof source.group.createdAt === 'number' ? source.group.createdAt : Date.now();
    items = source.items;
  } catch {
    try {
      const markdownGroup = parseMarkdownGroup(text);
      groupName = markdownGroup.groupName;
      items = markdownGroup.items;
    } catch {
      const csvGroup = parseCsvGroup(text);
      groupName = csvGroup.groupName;
      items = csvGroup.items;
    }
  }

  const group = createGroup(data, groupName);
  group.createdAt = createdAt;

  items.forEach((sourceItem, index) => {
    applyImportedItem(data, group.id, sourceItem, index);
  });

  reindexOrders(data);
  return group;
}

export function importItemFromText(text: string, data: PasswordManagerData, groupId: string): PasswordItem {
  return importItemsFromText(text, data, groupId)[0];
}

export function importItemsFromText(text: string, data: PasswordManagerData, groupId: string): PasswordItem[] {
  let sources: Partial<PasswordItem>[] = [];

  try {
    const payload = parseImportPayload(text);
    if (payload.kind === 'item') {
      sources = [payload.data as Partial<PasswordItem>];
    } else if (payload.kind === 'items') {
      const items = payload.data as Partial<PasswordItem>[];
      if (!Array.isArray(items)) {
        throw new Error('Invalid import payload');
      }
      sources = items;
    } else {
      throw new Error('Invalid import payload');
    }
  } catch {
    sources = parseMarkdownItems(text, data, groupId);
  }

  const imported = sources.map((source, index) => applyImportedItem(data, groupId, source, index));
  reindexOrders(data);
  return imported;
}