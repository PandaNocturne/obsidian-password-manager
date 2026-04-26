import { Notice } from 'obsidian';
import { DEFAULT_DATA } from '../data/defaults';
import { normalizePasswordManagerData, normalizePluginConfig, normalizeUrls } from '../data/normalize';
import {
  assignItemToGroup,
  createGroup,
  createItem,
  deleteItem,
  duplicateItem,
  getFallbackGroupId,
  moveGroup,
  moveGroups,
  moveItemWithinGroup,
  moveItemsWithinGroup,
  reindexOrders,
  removeItemFromGroup,
  updateGroupName,
  updateItem,
  updateItemTitle,
} from '../data/password-library-service';
import { PasswordStorageStore } from '../data/storage-store';
import { PWM_TEXT } from '../lang';
import { formatPasswordItemForCopy } from '../util/copy-format';
import { isEncryptedLibraryPayload } from '../util/encryption';
import { sortGroups, sortDeletedItems, sortItems } from '../util/sort';
import type {
  DeletedPasswordItem,
  PasswordGroup,
  PasswordItem,
  PasswordManagerData,
  PwmSortMode,
} from '../util/types';
import type { PasswordManagerSettings, PasswordPluginConfig } from '../settings';

interface PasswordPluginPersistence {
  loadLegacyData: () => Promise<unknown>;
  savePluginConfig: (config: PasswordPluginConfig) => Promise<void>;
}

export class PasswordPluginContext {
  data: PasswordManagerData = structuredClone(DEFAULT_DATA);
  pluginConfig: PasswordPluginConfig = normalizePluginConfig(undefined);

  private encryptionPassword = '';
  private lastVerifiedAt = 0;
  private hasEncryptedStorage = false;
  private hasUnlockedData = true;
  private ensureEncryptionWriteAccess: () => Promise<boolean> = async () => true;

  constructor(
    private readonly storageStore: PasswordStorageStore,
    private readonly persistence: PasswordPluginPersistence,
    private readonly pluginId: string,
  ) {}

  setEncryptionWriteGuard(handler: () => Promise<boolean>) {
    this.ensureEncryptionWriteAccess = handler;
  }

  async loadPluginData() {
    const legacyPluginData = await this.persistence.loadLegacyData();
    this.pluginConfig = normalizePluginConfig(legacyPluginData);
    await this.storageStore.migrateLegacyTrash(this.pluginConfig, this.pluginId);

    const stored = await this.storageStore.readStoredData(this.pluginConfig);
    this.hasEncryptedStorage = this.pluginConfig.encryptionEnabled && isEncryptedLibraryPayload(stored);

    if (this.hasEncryptedStorage) {
      this.data = structuredClone(DEFAULT_DATA);
      this.hasUnlockedData = false;
      return;
    }

    let storedData = await this.storageStore.loadData(this.pluginConfig);
    if (!storedData && legacyPluginData && typeof legacyPluginData === 'object' && ('groups' in legacyPluginData || 'items' in legacyPluginData)) {
      storedData = normalizePasswordManagerData(legacyPluginData);
      await this.storageStore.saveData(this.pluginConfig, storedData, this.encryptionPassword || undefined);
    }

    this.data = normalizePasswordManagerData(storedData ?? DEFAULT_DATA);
    reindexOrders(this.data);
    this.hasUnlockedData = true;
  }

  async savePluginData() {
    reindexOrders(this.data);
    this.pruneExpiredTrashItems();

    if (this.pluginConfig.encryptionEnabled) {
      const unlocked = await this.ensureEncryptionWriteAccess();
      if (!unlocked) {
        throw new Error(PWM_TEXT.encryptionRequiredNotice);
      }
    }

    if (this.pluginConfig.autoBackupEnabled) {
      await this.storageStore.pruneBackups(this.pluginConfig);

      const intervalMs = this.pluginConfig.autoBackupIntervalMinutes * 60 * 1000;
      const now = Date.now();
      const shouldBackup = !this.pluginConfig.lastAutoBackupAt || now - this.pluginConfig.lastAutoBackupAt >= intervalMs;
      if (shouldBackup) {
        await this.storageStore.createAutoBackup(this.pluginConfig, this.data, this.encryptionPassword || undefined);
        this.pluginConfig = normalizePluginConfig({
          ...this.pluginConfig,
          lastAutoBackupAt: now,
        });
      }
    }

    await this.persistence.savePluginConfig(this.pluginConfig);
    await this.storageStore.saveData(this.pluginConfig, this.data, this.encryptionPassword || undefined);
    this.hasEncryptedStorage = this.pluginConfig.encryptionEnabled;
  }

  async savePluginConfig() {
    this.pluginConfig = normalizePluginConfig(this.pluginConfig);
    await this.persistence.savePluginConfig(this.pluginConfig);
  }

  async applyTrashRetentionPolicy() {
    this.pluginConfig = normalizePluginConfig(this.pluginConfig);
    this.pruneExpiredTrashItems();

    if (this.pluginConfig.encryptionEnabled) {
      const unlocked = await this.ensureEncryptionWriteAccess();
      if (!unlocked) {
        throw new Error(PWM_TEXT.encryptionRequiredNotice);
      }
    }

    await this.persistence.savePluginConfig(this.pluginConfig);
    await this.storageStore.saveData(this.pluginConfig, this.data, this.encryptionPassword || undefined);
    this.hasEncryptedStorage = this.pluginConfig.encryptionEnabled;
  }

  async createBackupNow() {
    try {
      if (this.pluginConfig.encryptionEnabled) {
        const success = await this.storageStore.createEncryptedManualBackup(this.pluginConfig);
        if (!success) {
          throw new Error('Failed to create encrypted backup');
        }
      } else {
        reindexOrders(this.data);
        await this.storageStore.createManualBackup(this.pluginConfig, this.data, this.encryptionPassword || undefined);
      }
      new Notice(PWM_TEXT.backupCreated);
      return true;
    } catch {
      new Notice(PWM_TEXT.backupCreateFailed);
      return false;
    }
  }

  updatePluginConfig(patch: Partial<PasswordPluginConfig>) {
    this.pluginConfig = normalizePluginConfig({
      ...this.pluginConfig,
      ...patch,
    });
  }

  updateSettings(patch: Partial<PasswordManagerSettings>) {
    this.data.settings = {
      ...this.data.settings,
      ...patch,
    };
  }

  replaceData(data: PasswordManagerData) {
    this.data = normalizePasswordManagerData(data);
    reindexOrders(this.data);
    this.hasUnlockedData = true;
  }

  getStorageFolder() {
    return this.storageStore.getStorageFolder(this.pluginConfig);
  }

  getStorageStore() {
    return this.storageStore;
  }

  getEncryptionState() {
    return {
      encryptionPassword: this.encryptionPassword,
      lastVerifiedAt: this.lastVerifiedAt,
      hasEncryptedStorage: this.hasEncryptedStorage,
      hasUnlockedData: this.hasUnlockedData,
    };
  }

  setEncryptionState(patch: Partial<ReturnType<PasswordPluginContext['getEncryptionState']>>) {
    if (patch.encryptionPassword !== undefined) {
      this.encryptionPassword = patch.encryptionPassword;
    }
    if (patch.lastVerifiedAt !== undefined) {
      this.lastVerifiedAt = patch.lastVerifiedAt;
    }
    if (patch.hasEncryptedStorage !== undefined) {
      this.hasEncryptedStorage = patch.hasEncryptedStorage;
    }
    if (patch.hasUnlockedData !== undefined) {
      this.hasUnlockedData = patch.hasUnlockedData;
    }
  }

  createGroup(name?: string) {
    return createGroup(this.data, name);
  }

  updateGroupName(groupId: string, name: string) {
    return updateGroupName(this.data, groupId, name);
  }

  createItem(groupId: string) {
    return createItem(this.data, groupId);
  }

  duplicateItem(itemId: string) {
    return duplicateItem(this.data, itemId);
  }

  updateItemTitle(itemId: string, title: string) {
    return updateItemTitle(this.data, itemId, title);
  }

  updateItem(itemId: string, patch: Partial<Omit<PasswordItem, 'id'>>) {
    updateItem(this.data, itemId, patch);
  }

  setGroupSort(mode: PwmSortMode) {
    this.data.view.groupSort = mode;
  }

  setItemSort(mode: PwmSortMode) {
    this.data.view.itemSort = mode;
  }

  deleteGroup(groupId: string) {
    return this.deleteGroups([groupId]);
  }

  deleteGroups(groupIds: string[]) {
    const targetGroupIds = new Set(groupIds);
    if (!targetGroupIds.size) {
      return false;
    }

    let changed = false;
    const remainingItems: PasswordItem[] = [];
    for (const item of this.data.items) {
      if (!item.groupIds.some((id) => targetGroupIds.has(id))) {
        remainingItems.push(item);
        continue;
      }

      const remainingGroupIds = item.groupIds.filter((id) => !targetGroupIds.has(id));
      if (!remainingGroupIds.length) {
        this.storageStore.moveItemToTrash(this.data, item);
        changed = true;
        continue;
      }

      if (remainingGroupIds.length !== item.groupIds.length) {
        item.groupIds = remainingGroupIds;
        item.updatedAt = Date.now();
        changed = true;
      }
      remainingItems.push(item);
    }

    this.data.items = remainingItems;
    const previousGroupCount = this.data.groups.length;
    this.data.groups = this.data.groups.filter((group) => !targetGroupIds.has(group.id));
    if (this.data.groups.length !== previousGroupCount) {
      changed = true;
    }

    if (changed) {
      reindexOrders(this.data);
    }
    return changed;
  }

  async deleteItem(itemId: string) {
    const item = this.getItem(itemId);
    if (!item) {
      return false;
    }

    if (this.shouldDeleteItemDirectly(item)) {
      return !!deleteItem(this.data, itemId);
    }

    this.storageStore.moveItemToTrash(this.data, item);
    return !!deleteItem(this.data, itemId);
  }

  shouldDeleteItemDirectlyById(itemId: string) {
    const item = this.getItem(itemId);
    return item ? this.shouldDeleteItemDirectly(item) : false;
  }

  deleteTrashItem(itemId: string) {
    const previousLength = this.data.trash.length;
    this.data.trash = this.data.trash.filter((item) => item.id !== itemId);
    return this.data.trash.length !== previousLength;
  }

  restoreTrashItem(itemId: string, groupId?: string) {
    const item = this.getTrashItem(itemId);
    if (!item) {
      return false;
    }

    const restoredGroupIds = groupId ? [groupId] : this.resolveRestoredGroupIds(item);
    if (!restoredGroupIds.length) {
      return false;
    }

    const { deletedAt, deletedGroupNames, ...restoredItem } = item;
    void deletedAt;
    void deletedGroupNames;
    const nextItem: PasswordItem = {
      ...restoredItem,
      groupIds: restoredGroupIds,
    };
    const removed = this.deleteTrashItem(itemId);
    if (!removed) {
      return false;
    }

    this.data.items.push(nextItem);
    reindexOrders(this.data);
    return true;
  }

  getGroup(groupId: string) {
    return this.data.groups.find((group) => group.id === groupId);
  }

  getItem(itemId: string) {
    return this.data.items.find((item) => item.id === itemId);
  }

  getSortedGroups() {
    return sortGroups(this.data.groups, this.data.items, this.data.view.groupSort);
  }

  getTrashGroups() {
    const groups = new Map<string, PasswordGroup>();
    this.data.trash.forEach((item) => {
      const key = new Date(item.deletedAt).toISOString().slice(0, 10);
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          name: key,
          createdAt: item.deletedAt,
          order: item.deletedAt,
        });
      }
    });
    return [...groups.values()].sort((left, right) => right.createdAt - left.createdAt);
  }

  getItemsByGroup(groupId: string) {
    return this.data.items.filter((item) => item.groupIds.includes(groupId));
  }

  getSortedItemsByGroup(groupId: string) {
    return sortItems(this.getItemsByGroup(groupId), this.data.view.itemSort);
  }

  getTrashItemsByGroup(groupId: string) {
    return sortDeletedItems(
      this.data.trash.filter((item) => new Date(item.deletedAt).toISOString().slice(0, 10) === groupId),
      this.data.view.itemSort,
    );
  }

  getTrashItem(itemId: string) {
    return this.data.trash.find((item) => item.id === itemId);
  }

  async copyItemAsConfiguredFormat(itemId: string) {
    const item = this.getItem(itemId) ?? this.getTrashItem(itemId);
    if (!item) {
      return false;
    }

    const content = formatPasswordItemForCopy(item, this.data.groups, this.data.settings.copyFormat);
    await navigator.clipboard.writeText(content);
    new Notice(PWM_TEXT.copiedPasswordInfo);
    return true;
  }

  moveGroup(groupId: string, toIndex: number) {
    moveGroup(this.data, groupId, toIndex);
  }

  moveGroups(groupIds: string[], toIndex: number) {
    moveGroups(this.data, groupIds, toIndex);
  }

  moveItemWithinGroup(itemId: string, toIndex: number, groupId: string) {
    moveItemWithinGroup(this.data, itemId, toIndex, groupId);
  }

  moveItemsWithinGroup(itemIds: string[], toIndex: number, groupId: string) {
    moveItemsWithinGroup(this.data, itemIds, toIndex, groupId);
  }

  assignItemToGroup(itemId: string, groupId: string, mode: 'move' | 'add') {
    return assignItemToGroup(this.data, itemId, groupId, mode);
  }

  removeItemFromGroup(itemId: string, groupId: string) {
    const success = removeItemFromGroup(this.data, itemId, groupId);
    if (!success && this.getItem(itemId)?.groupIds.includes(groupId) && (this.getItem(itemId)?.groupIds.length ?? 0) <= 1) {
      new Notice(PWM_TEXT.keepOneItemGroup);
    }
    return success;
  }

  private pruneExpiredTrashItems() {
    if (this.pluginConfig.trashRetentionDays <= 0) {
      return;
    }

    const retentionMs = this.pluginConfig.trashRetentionDays * 24 * 60 * 60 * 1000;
    const minDeletedAt = Date.now() - retentionMs;
    this.data.trash = this.data.trash.filter((item) => item.deletedAt >= minDeletedAt);
  }

  private shouldDeleteItemDirectly(item: PasswordItem) {
    return !!item.title.trim()
      && !item.username.trim()
      && !item.password.trim()
      && normalizeUrls(item.urls).length === 0
      && !item.notes.trim();
  }

  private resolveRestoredGroupIds(item: DeletedPasswordItem) {
    const restoredGroupIds: string[] = [];
    const existingGroupIds = new Set(this.data.groups.map((group) => group.id));

    item.groupIds.forEach((id, index) => {
      if (existingGroupIds.has(id) && !restoredGroupIds.includes(id)) {
        restoredGroupIds.push(id);
        return;
      }

      const deletedGroupName = item.deletedGroupNames?.[index]?.trim();
      if (!deletedGroupName) {
        return;
      }

      const existingGroup = this.data.groups.find((group) => group.name === deletedGroupName);
      if (existingGroup) {
        if (!restoredGroupIds.includes(existingGroup.id)) {
          restoredGroupIds.push(existingGroup.id);
        }
        return;
      }

      const createdGroup = this.createGroup(deletedGroupName);
      existingGroupIds.add(createdGroup.id);
      restoredGroupIds.push(createdGroup.id);
    });

    if (restoredGroupIds.length) {
      return restoredGroupIds;
    }

    const fallbackGroupId = getFallbackGroupId(this.data) ?? DEFAULT_DATA.groups[0].id;
    return fallbackGroupId ? [fallbackGroupId] : [];
  }
}