import { DEFAULT_DATA } from './defaults';
import type { PasswordManagerSettings, PasswordPluginConfig } from '../settings';
import { PWM_TEXT } from '../lang';
import { createId } from '../util/id';
import type {
  DeletedPasswordItem,
  EncryptedPasswordVerifier,
  PasswordCopyFormat,
  PasswordGroup,
  PasswordItem,
  PasswordManagerData,
  PasswordUnlockMode,
  PwmSortMode,
} from '../util/types';
import { isEncryptedPasswordVerifier } from '../util/encryption';

const DEFAULT_STORAGE_FOLDER_NAME = '.password';
const DEFAULT_AUTO_BACKUP_COUNT = 20;
const DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES = 5;
const DEFAULT_TRASH_RETENTION_DAYS = 150;
const DEFAULT_ENCRYPTION_RECHECK_INTERVAL_MINUTES = 30;
const DEFAULT_ENCRYPTION_UNLOCK_MODE: PasswordUnlockMode = 'session';
const DEFAULT_MODAL_WIDTH_EXPR = '92vw, 1200px';
const DEFAULT_MODAL_HEIGHT_EXPR = '80vh, 800px';
const DEFAULT_COLUMN_RATIO_EXPR = '1,1,2';
const DEFAULT_GROUP_COLUMN_WIDTH = 220;
const DEFAULT_ITEM_COLUMN_WIDTH = 320;

export function normalizePasswordManagerData(saved: unknown): PasswordManagerData {
  const source = saved as Partial<PasswordManagerData> | undefined;
  const now = Date.now();
  const sourceGroups = Array.isArray(source?.groups)
    ? source?.groups ?? []
    : structuredClone(DEFAULT_DATA.groups);
  const groups = sourceGroups.map(
    (group: Partial<PasswordGroup>, index: number): PasswordGroup => ({
      id: group.id || createId(),
      name: group.name?.trim() || `${PWM_TEXT.GENERATED_GROUP_NAME} ${index + 1}`,
      createdAt: typeof group.createdAt === 'number' ? group.createdAt : now + index,
      order: typeof group.order === 'number' ? group.order : index,
    }),
  );

  const fallbackGroupId = groups[0]?.id ?? createId();
  const availableGroupIds = groups.map((group: PasswordGroup) => group.id);
  const rawItems = Array.isArray(source?.items)
    ? source?.items ?? []
    : structuredClone(DEFAULT_DATA.items);
  const items = rawItems.map(
    (item: Partial<PasswordItem> & { groupId?: string; url?: unknown }, index: number): PasswordItem => ({
      id: item.id || createId(),
      groupIds: normalizeGroupIds(item.groupIds ?? item.groupId, fallbackGroupId, availableGroupIds),
      title: item.title || PWM_TEXT.GENERATED_NEW_ITEM_TITLE,
      username: item.username || '',
      password: item.password || '',
      urls: normalizeUrls(item.urls ?? item.url),
      notes: item.notes || '',
      pinned: typeof item.pinned === 'boolean' ? item.pinned : false,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : now + index,
      updatedAt: typeof item.updatedAt === 'number'
        ? item.updatedAt
        : (typeof item.createdAt === 'number' ? item.createdAt : now + index),
      order: typeof item.order === 'number' ? item.order : index,
    }),
  );
  const rawTrash = Array.isArray(source?.trash)
    ? source?.trash ?? []
    : [];
  const trash = rawTrash
    .filter((item) => !!item && typeof item === 'object')
    .map((entry, index): DeletedPasswordItem => {
      const item = entry as Partial<DeletedPasswordItem> & { url?: unknown };
      return {
        id: item.id || createId(),
        groupIds: normalizeGroupIds(item.groupIds, fallbackGroupId),
        deletedGroupNames: Array.isArray(item.deletedGroupNames)
          ? item.deletedGroupNames
            .filter((name): name is string => typeof name === 'string')
            .map((name) => name.trim())
            .filter(Boolean)
          : undefined,
        title: item.title || PWM_TEXT.GENERATED_NEW_ITEM_TITLE,
        username: item.username || '',
        password: item.password || '',
        urls: normalizeUrls(item.urls ?? item.url),
        notes: item.notes || '',
        pinned: typeof item.pinned === 'boolean' ? item.pinned : false,
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : now + index,
        updatedAt: typeof item.updatedAt === 'number'
          ? item.updatedAt
          : (typeof item.createdAt === 'number' ? item.createdAt : now + index),
        order: typeof item.order === 'number' ? item.order : index,
        deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : now,
      };
    });

  return {
    groups,
    items,
    trash,
    view: {
      groupSort: normalizeSortMode(source?.view?.groupSort),
      itemSort: normalizeSortMode(source?.view?.itemSort),
      lastMode: normalizeModalMode(source?.view?.lastMode),
      lastSelectedGroupId: typeof source?.view?.lastSelectedGroupId === 'string' ? source.view.lastSelectedGroupId : '',
      lastSelectedItemId: typeof source?.view?.lastSelectedItemId === 'string' ? source.view.lastSelectedItemId : '',
      groupColumnWidth: normalizeColumnWidth(source?.view?.groupColumnWidth, DEFAULT_GROUP_COLUMN_WIDTH),
      itemColumnWidth: normalizeColumnWidth(source?.view?.itemColumnWidth, DEFAULT_ITEM_COLUMN_WIDTH),
    },
    settings: normalizeSettings(source?.settings),
  };
}

export function normalizeImportedLibraryData(data: PasswordManagerData): PasswordManagerData {
  return normalizePasswordManagerData(data);
}

export function normalizeGroupIds(
  groupIds: unknown,
  fallbackGroupId: string,
  availableGroupIds?: Iterable<string>,
): string[] {
  const source = Array.isArray(groupIds)
    ? groupIds
    : typeof groupIds === 'string'
      ? [groupIds]
      : [];
  const available = new Set(availableGroupIds ?? []);
  const normalized = [
    ...new Set(
      source
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id && (available.size === 0 || available.has(id))),
    ),
  ];
  return normalized.length ? normalized : [fallbackGroupId];
}

export function normalizeUrls(urls: unknown): string[] {
  const source = Array.isArray(urls)
    ? urls
    : typeof urls === 'string'
      ? [urls]
      : [];

  return source
    .filter((url): url is string => typeof url === 'string')
    .map((url) => url.trim())
    .filter(Boolean);
}

export function normalizeSettings(settings: unknown): PasswordManagerSettings {
  const source = settings as PasswordManagerSettings | undefined;
  return {
    confirmBeforeDelete:
      typeof source?.confirmBeforeDelete === 'boolean'
        ? source.confirmBeforeDelete
        : DEFAULT_DATA.settings.confirmBeforeDelete,
    copyFormat: normalizeCopyFormat(source?.copyFormat),
    showItemUsername:
      typeof source?.showItemUsername === 'boolean'
        ? source.showItemUsername
        : DEFAULT_DATA.settings.showItemUsername,
    showItemUrl:
      typeof source?.showItemUrl === 'boolean'
        ? source.showItemUrl
        : DEFAULT_DATA.settings.showItemUrl,
    showItemGroupTags:
      typeof source?.showItemGroupTags === 'boolean'
        ? source.showItemGroupTags
        : DEFAULT_DATA.settings.showItemGroupTags,
    showItemNotes:
      typeof source?.showItemNotes === 'boolean'
        ? source.showItemNotes
        : DEFAULT_DATA.settings.showItemNotes,
  };
}

export function normalizePluginConfig(config: unknown): PasswordPluginConfig {
  const source = config as Partial<PasswordPluginConfig> & {
    modalWidthVw?: unknown;
    modalHeightVh?: unknown;
  } | undefined;
  return {
    storageFolderName: source?.storageFolderName?.trim() || DEFAULT_STORAGE_FOLDER_NAME,
    autoBackupEnabled:
      typeof source?.autoBackupEnabled === 'boolean'
        ? source.autoBackupEnabled
        : true,
    autoBackupCount: normalizeAutoBackupCount(source?.autoBackupCount),
    autoBackupIntervalMinutes: normalizeAutoBackupIntervalMinutes(source?.autoBackupIntervalMinutes),
    trashRetentionDays: normalizeTrashRetentionDays(source?.trashRetentionDays),
    lastAutoBackupAt:
      typeof source?.lastAutoBackupAt === 'number' && Number.isFinite(source.lastAutoBackupAt)
        ? source.lastAutoBackupAt
        : 0,
    encryptionEnabled:
      typeof source?.encryptionEnabled === 'boolean'
        ? source.encryptionEnabled
        : false,
    encryptionUnlockMode: normalizeEncryptionUnlockMode(source?.encryptionUnlockMode),
    encryptionRecheckIntervalMinutes: normalizeEncryptionRecheckIntervalMinutes(source?.encryptionRecheckIntervalMinutes),
    encryptionVerifier: normalizeEncryptionVerifier(source?.encryptionVerifier),
    persistEncryptionPassword:
      typeof source?.persistEncryptionPassword === 'boolean'
        ? source.persistEncryptionPassword
        : false,
    savedEncryptionPassword:
      typeof source?.savedEncryptionPassword === 'string'
        ? source.savedEncryptionPassword
        : '',
    modalWidthExpr: normalizeModalExpr(source?.modalWidthExpr, source?.modalWidthVw, DEFAULT_MODAL_WIDTH_EXPR, 'vw'),
    modalHeightExpr: normalizeModalExpr(source?.modalHeightExpr, source?.modalHeightVh, DEFAULT_MODAL_HEIGHT_EXPR, 'vh'),
    columnRatioExpr: normalizeColumnRatioExpr(source?.columnRatioExpr),
    columnRatioLocked:
      typeof source?.columnRatioLocked === 'boolean'
        ? source.columnRatioLocked
        : true,
  };
}

function normalizeAutoBackupCount(value: unknown) {
  const count = typeof value === 'number' ? Math.round(value) : DEFAULT_AUTO_BACKUP_COUNT;
  return Math.min(50, Math.max(0, count));
}

function normalizeAutoBackupIntervalMinutes(value: unknown) {
  const minutes = typeof value === 'number' ? Math.round(value) : DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
  return Math.min(60, Math.max(1, minutes));
}

function normalizeTrashRetentionDays(value: unknown) {
  const days = typeof value === 'number' ? Math.round(value) : DEFAULT_TRASH_RETENTION_DAYS;
  return Math.min(365, Math.max(0, days));
}

function normalizeModalExpr(value: unknown, legacyValue: unknown, fallback: string, legacyUnit: 'vw' | 'vh') {
  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ');
    if (normalized) {
      return normalized;
    }
  }

  if (typeof legacyValue === 'number' && Number.isFinite(legacyValue)) {
    return `${Math.round(legacyValue)}${legacyUnit}`;
  }

  return fallback;
}

function normalizeColumnRatioExpr(value: unknown) {
  if (typeof value !== 'string') {
    return DEFAULT_COLUMN_RATIO_EXPR;
  }

  const ratios = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part > 0);

  if (ratios.length !== 3) {
    return DEFAULT_COLUMN_RATIO_EXPR;
  }

  return ratios.map((part) => `${part}`).join(',');
}

function normalizeColumnWidth(value: unknown, fallback: number) {
  const width = typeof value === 'number' ? Math.round(value) : fallback;
  return Math.min(520, Math.max(160, width));
}

function normalizeEncryptionUnlockMode(mode: unknown): PasswordUnlockMode {
  const modes: PasswordUnlockMode[] = ['session', 'interval', 'always'];
  return modes.includes(mode as PasswordUnlockMode)
    ? (mode as PasswordUnlockMode)
    : DEFAULT_ENCRYPTION_UNLOCK_MODE;
}

function normalizeEncryptionRecheckIntervalMinutes(value: unknown) {
  const minutes = typeof value === 'number' ? Math.round(value) : DEFAULT_ENCRYPTION_RECHECK_INTERVAL_MINUTES;
  return Math.max(1, minutes);
}

function normalizeEncryptionVerifier(value: unknown): EncryptedPasswordVerifier | null {
  return isEncryptedPasswordVerifier(value) ? value : null;
}

export function normalizeCopyFormat(format: unknown): PasswordCopyFormat {
  const formats: PasswordCopyFormat[] = ['markdown', 'plain-text', 'callout'];
  return formats.includes(format as PasswordCopyFormat)
    ? (format as PasswordCopyFormat)
    : DEFAULT_DATA.settings.copyFormat;
}

export function normalizeSortMode(mode: unknown): PwmSortMode {
  const modes: PwmSortMode[] = [
    'custom',
    'name-asc',
    'name-desc',
    'created-asc',
    'created-desc',
    'updated-asc',
    'updated-desc',
    'deleted-asc',
    'deleted-desc',
    'item-count-asc',
    'item-count-desc',
  ];
  return modes.includes(mode as PwmSortMode) ? (mode as PwmSortMode) : 'custom';
}

function normalizeModalMode(mode: unknown): 'default' | 'trash' {
  return mode === 'trash' ? 'trash' : 'default';
}
