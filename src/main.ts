import { Plugin, type App } from 'obsidian';
import { PasswordStorageStore } from './data/storage-store';
import { PWM_TEXT } from './lang';
import { PasswordPluginContext } from './services/plugin-context';
import { PasswordEncryptionService } from './services/encryption-service';
import { PasswordTransferService } from './services/transfer-service';
import { createIconButton } from './services/ui-helpers';
import type { PasswordItem, PasswordManagerData, PwmSortMode } from './util/types';
import type { PasswordManagerSettings, PasswordPluginConfig } from './settings';
import { PasswordManagerModal } from './ui/password-manager-modal';
import { PasswordManagerSettingTab } from './settings';

export default class PasswordManagerPlugin extends Plugin {
  private storageStore!: PasswordStorageStore;
  private context!: PasswordPluginContext;
  private encryptionService!: PasswordEncryptionService;
  private transferService!: PasswordTransferService;
  private readonly managerModals = new Set<PasswordManagerModal>();

  get data(): PasswordManagerData {
    return this.context.data;
  }

  get pluginConfig(): PasswordPluginConfig {
    return this.context.pluginConfig;
  }

  async onload() {
    this.initializeDependencies();
    await this.context.loadPluginData();
    this.registerEntrypoints();
  }

  private initializeDependencies() {
    this.storageStore = new PasswordStorageStore(this.app);
    this.context = new PasswordPluginContext(
      this.storageStore,
      {
        loadLegacyData: () => this.loadData(),
        savePluginConfig: (config) => this.saveData(config),
      },
      this.manifest.id,
    );
    this.encryptionService = new PasswordEncryptionService(this.app, this.context);
    this.transferService = new PasswordTransferService(this.app, this.context);
    this.context.setEncryptionWriteGuard(() => this.encryptionService.ensureEncryptionWriteAccess());
  }

  private registerEntrypoints() {
    this.addRibbonIcon('lock', PWM_TEXT.openManager, () => {
      void this.openManager();
    });

    this.addCommand({
      id: 'open-password-manager',
      name: PWM_TEXT.openManager,
      callback: () => {
        void this.openManager();
      },
    });

    this.addSettingTab(new PasswordManagerSettingTab(this.app, this));
  }

  async openManager() {
    const allowed = await this.encryptionService.ensureEncryptionAccess();
    if (!allowed) {
      return;
    }
    new PasswordManagerModal(this.app, this).open();
  }

  async openTrash() {
    new PasswordManagerModal(this.app, this, { mode: 'trash' }).open();
  }

  openSettings() {
    const setting = (this.app as App & {
      setting: {
        open: () => void;
        openTabById: (id: string) => void;
      };
    }).setting;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  registerManagerModal(modal: PasswordManagerModal) {
    this.managerModals.add(modal);
  }

  unregisterManagerModal(modal: PasswordManagerModal) {
    this.managerModals.delete(modal);
  }

  refreshManagerLayouts() {
    this.managerModals.forEach((modal) => modal.refreshLayout());
  }

  createIconButton(container: HTMLElement, icon: string, label: string, onClick: () => void | Promise<void>) {
    return createIconButton(container, icon, label, onClick);
  }

  async savePluginData() {
    return this.context.savePluginData();
  }

  async savePluginConfig() {
    return this.context.savePluginConfig();
  }

  async applyTrashRetentionPolicy() {
    return this.context.applyTrashRetentionPolicy();
  }

  async createBackupNow() {
    return this.context.createBackupNow();
  }

  async enableEncryption() {
    return this.encryptionService.enableEncryption();
  }

  async disableEncryption() {
    return this.encryptionService.disableEncryption();
  }

  async changeEncryptionPassword() {
    return this.encryptionService.changeEncryptionPassword();
  }

  async setPersistEncryptionPassword(enabled: boolean) {
    return this.encryptionService.setPersistEncryptionPassword(enabled);
  }

  async openStorageFolder() {
    return this.encryptionService.openStorageFolder();
  }

  async ensureWriteAccess() {
    return this.encryptionService.ensureEncryptionWriteAccess();
  }

  async exportLibrary() {
    return this.transferService.exportLibrary();
  }

  async exportGroup(groupId: string, format: 'json' | 'markdown' | 'csv' = 'json') {
    return this.transferService.exportGroup(groupId, format);
  }

  async exportGroups(groupIds: string[], format: 'json' | 'markdown' | 'csv' = 'json') {
    return this.transferService.exportGroups(groupIds, format);
  }

  async exportItem(itemId: string) {
    return this.transferService.exportItem(itemId);
  }

  async exportItems(itemIds: string[], format: 'json' | 'markdown') {
    return this.transferService.exportItems(itemIds, format);
  }

  async importLibraryFromText(text: string) {
    return this.transferService.importLibraryFromText(text);
  }

  async importGroupFromText(text: string) {
    return this.transferService.importGroupFromText(text);
  }

  async importItemFromText(text: string, groupId: string) {
    return this.transferService.importItemFromText(text, groupId);
  }

  async importItemsFromText(text: string, groupId: string) {
    return this.transferService.importItemsFromText(text, groupId);
  }

  updatePluginConfig(patch: Partial<PasswordPluginConfig>) {
    this.context.updatePluginConfig(patch);
  }

  updateSettings(patch: Partial<PasswordManagerSettings>) {
    this.context.updateSettings(patch);
  }

  createGroup(name?: string) {
    return this.context.createGroup(name);
  }

  updateGroupName(groupId: string, name: string) {
    return this.context.updateGroupName(groupId, name);
  }

  createItem(groupId: string) {
    return this.context.createItem(groupId);
  }

  duplicateItem(itemId: string) {
    return this.context.duplicateItem(itemId);
  }

  updateItemTitle(itemId: string, title: string) {
    return this.context.updateItemTitle(itemId, title);
  }

  updateItem(itemId: string, patch: Partial<Omit<PasswordItem, 'id'>>) {
    this.context.updateItem(itemId, patch);
  }

  setGroupSort(mode: PwmSortMode) {
    this.context.setGroupSort(mode);
  }

  setItemSort(mode: PwmSortMode) {
    this.context.setItemSort(mode);
  }

  deleteGroup(groupId: string) {
    return this.context.deleteGroup(groupId);
  }

  deleteGroups(groupIds: string[]) {
    return this.context.deleteGroups(groupIds);
  }

  async deleteItem(itemId: string) {
    return this.context.deleteItem(itemId);
  }

  shouldDeleteItemDirectlyById(itemId: string) {
    return this.context.shouldDeleteItemDirectlyById(itemId);
  }

  deleteTrashItem(itemId: string) {
    return this.context.deleteTrashItem(itemId);
  }

  restoreTrashItem(itemId: string, groupId?: string) {
    return this.context.restoreTrashItem(itemId, groupId);
  }

  getGroup(groupId: string) {
    return this.context.getGroup(groupId);
  }

  getItem(itemId: string) {
    return this.context.getItem(itemId);
  }

  getSortedGroups() {
    return this.context.getSortedGroups();
  }

  getTrashGroups() {
    return this.context.getTrashGroups();
  }

  getItemsByGroup(groupId: string) {
    return this.context.getItemsByGroup(groupId);
  }

  getSortedItemsByGroup(groupId: string) {
    return this.context.getSortedItemsByGroup(groupId);
  }

  getTrashItemsByGroup(groupId: string) {
    return this.context.getTrashItemsByGroup(groupId);
  }

  getTrashItem(itemId: string) {
    return this.context.getTrashItem(itemId);
  }

  async copyItemAsConfiguredFormat(itemId: string) {
    return this.context.copyItemAsConfiguredFormat(itemId);
  }

  moveGroup(groupId: string, toIndex: number) {
    this.context.moveGroup(groupId, toIndex);
  }

  moveGroups(groupIds: string[], toIndex: number) {
    this.context.moveGroups(groupIds, toIndex);
  }

  moveItemWithinGroup(itemId: string, toIndex: number, groupId: string) {
    this.context.moveItemWithinGroup(itemId, toIndex, groupId);
  }

  moveItemsWithinGroup(itemIds: string[], toIndex: number, groupId: string) {
    this.context.moveItemsWithinGroup(itemIds, toIndex, groupId);
  }

  assignItemToGroup(itemId: string, groupId: string, mode: 'move' | 'add') {
    return this.context.assignItemToGroup(itemId, groupId, mode);
  }

  removeItemFromGroup(itemId: string, groupId: string) {
    return this.context.removeItemFromGroup(itemId, groupId);
  }
}