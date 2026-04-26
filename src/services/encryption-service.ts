import { FileSystemAdapter, Notice, type App } from 'obsidian';
import { PWM_TEXT } from '../lang';
import { createPasswordVerifier, verifyPassword } from '../util/encryption';
import type { PasswordPluginContext } from './plugin-context';
import { PasswordPromptModal, type PasswordPromptField } from '../ui/password-prompt-modal';

export class PasswordEncryptionService {
  constructor(
    private readonly app: App,
    private readonly context: PasswordPluginContext,
  ) { }

  async ensureEncryptionAccess() {
    const config = this.context.pluginConfig;
    if (!config.encryptionEnabled) {
      return true;
    }

    if (!config.encryptionVerifier) {
      new Notice(PWM_TEXT.ENCRYPTION_NOT_CONFIGURED);
      return false;
    }

    const savedPassword = await this.tryUnlockWithSavedPassword();
    if (savedPassword) {
      return true;
    }

    if (!this.shouldVerifyEncryption()) {
      return true;
    }

    const password = await this.requestSinglePassword();
    if (!password) {
      return false;
    }

    const unlocked = await this.unlockWithPassword(password);
    if (!unlocked) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
      return false;
    }
    return true;
  }

  async ensureEncryptionWriteAccess() {
    const config = this.context.pluginConfig;
    if (!config.encryptionEnabled) {
      return true;
    }

    if (!config.encryptionVerifier) {
      new Notice(PWM_TEXT.ENCRYPTION_NOT_CONFIGURED);
      return false;
    }

    const savedPassword = await this.tryUnlockWithSavedPassword();
    if (savedPassword) {
      return true;
    }

    if (this.context.getEncryptionState().encryptionPassword) {
      return true;
    }

    const password = await this.requestSinglePassword();
    if (!password) {
      return false;
    }

    const unlocked = await this.unlockWithPassword(password);
    if (!unlocked) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
      return false;
    }
    return true;
  }

  async enableEncryption() {
    const passwords = await this.requestPasswords(PWM_TEXT.ENABLE_ENCRYPTION_PASSWORD, [
      { key: 'password', label: PWM_TEXT.NEW_ENCRYPTION_PASSWORD },
      { key: 'confirmPassword', label: PWM_TEXT.CONFIRM_ENCRYPTION_PASSWORD },
    ]);
    if (!passwords) {
      return false;
    }

    const password = passwords.password?.trim() ?? '';
    const confirmPassword = passwords.confirmPassword?.trim() ?? '';
    if (!password || password !== confirmPassword) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_MISMATCH);
      return false;
    }

    this.context.setEncryptionState({
      encryptionPassword: password,
      lastVerifiedAt: Date.now(),
      hasUnlockedData: true,
    });
    this.context.updatePluginConfig({
      encryptionEnabled: true,
      encryptionVerifier: await createPasswordVerifier(password),
      savedEncryptionPassword: '',
    });

    await this.context.savePluginData();
    new Notice(PWM_TEXT.ENCRYPTION_ENABLED_NOTICE);
    return true;
  }

  async disableEncryption() {
    const config = this.context.pluginConfig;
    if (!config.encryptionVerifier) {
      this.context.updatePluginConfig({
        encryptionEnabled: false,
        encryptionVerifier: null,
        persistEncryptionPassword: false,
        savedEncryptionPassword: '',
      });
      await this.context.savePluginData();
      return true;
    }

    const password = await this.requestSinglePassword(PWM_TEXT.DISABLE_ENCRYPTION_PASSWORD);
    if (!password) {
      return false;
    }

    const valid = await verifyPassword(password, config.encryptionVerifier);
    if (!valid) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
      return false;
    }

    if (!this.context.getEncryptionState().hasUnlockedData) {
      const unlocked = await this.unlockWithPassword(password);
      if (!unlocked) {
        new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
        return false;
      }
    }

    this.context.updatePluginConfig({
      encryptionEnabled: false,
      encryptionVerifier: null,
      persistEncryptionPassword: false,
      savedEncryptionPassword: '',
    });
    await this.context.savePluginData();
    this.context.setEncryptionState({
      encryptionPassword: '',
      lastVerifiedAt: 0,
      hasEncryptedStorage: false,
    });
    new Notice(PWM_TEXT.ENCRYPTION_DISABLED_NOTICE);
    return true;
  }

  async changeEncryptionPassword() {
    const config = this.context.pluginConfig;
    if (!config.encryptionVerifier) {
      new Notice(PWM_TEXT.ENCRYPTION_NOT_CONFIGURED);
      return false;
    }

    const passwords = await this.requestPasswords(PWM_TEXT.CHANGE_ENCRYPTION_PASSWORD, [
      {
        key: 'currentPassword',
        label: PWM_TEXT.CURRENT_ENCRYPTION_PASSWORD,
        value: config.persistEncryptionPassword ? config.savedEncryptionPassword : '',
      },
      { key: 'newPassword', label: PWM_TEXT.NEW_ENCRYPTION_PASSWORD },
      { key: 'confirmPassword', label: PWM_TEXT.CONFIRM_ENCRYPTION_PASSWORD },
    ]);
    if (!passwords) {
      return false;
    }

    const currentPassword = passwords.currentPassword?.trim() ?? '';
    const newPassword = passwords.newPassword?.trim() ?? '';
    const confirmPassword = passwords.confirmPassword?.trim() ?? '';
    if (!currentPassword || !newPassword || newPassword !== confirmPassword) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_MISMATCH);
      return false;
    }

    const valid = await verifyPassword(currentPassword, config.encryptionVerifier);
    if (!valid) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
      return false;
    }

    const unlocked = await this.unlockWithPassword(currentPassword);
    if (!unlocked) {
      new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
      return false;
    }

    this.context.setEncryptionState({
      encryptionPassword: newPassword,
      lastVerifiedAt: Date.now(),
    });
    this.context.updatePluginConfig({
      encryptionVerifier: await createPasswordVerifier(newPassword),
      savedEncryptionPassword: this.context.pluginConfig.persistEncryptionPassword ? newPassword : '',
    });
    await this.context.savePluginData();
    new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_CHANGED);
    return true;
  }

  async setPersistEncryptionPassword(enabled: boolean) {
    if (!this.context.pluginConfig.encryptionEnabled) {
      this.context.updatePluginConfig({
        persistEncryptionPassword: false,
        savedEncryptionPassword: '',
      });
      await this.context.savePluginConfig();
      return false;
    }

    if (!enabled) {
      this.context.updatePluginConfig({
        persistEncryptionPassword: false,
        savedEncryptionPassword: '',
      });
      await this.context.savePluginConfig();
      new Notice(PWM_TEXT.PERSIST_ENCRYPTION_PASSWORD_DISABLED_NOTICE);
      return true;
    }

    let password = this.context.getEncryptionState().encryptionPassword;
    if (!password) {
      password = await this.requestSinglePassword();
      if (!password) {
        return false;
      }

      const unlocked = await this.unlockWithPassword(password);
      if (!unlocked) {
        new Notice(PWM_TEXT.ENCRYPTION_PASSWORD_INVALID);
        return false;
      }
    }

    this.context.updatePluginConfig({
      persistEncryptionPassword: true,
      savedEncryptionPassword: password,
    });
    await this.context.savePluginConfig();
    new Notice(PWM_TEXT.PERSIST_ENCRYPTION_PASSWORD_ENABLED_NOTICE);
    return true;
  }

  async openStorageFolder() {
    const storageFolderPath = this.context.getStorageFolder();
    return this.openFolder(storageFolderPath, undefined, PWM_TEXT.OPEN_STORAGE_FOLDER_FAILED);
  }

  private shouldVerifyEncryption() {
    const config = this.context.pluginConfig;
    const state = this.context.getEncryptionState();
    if (!config.encryptionEnabled || !config.encryptionVerifier) {
      return false;
    }

    if (!state.hasUnlockedData || !state.encryptionPassword || !state.lastVerifiedAt) {
      return true;
    }

    if (config.encryptionUnlockMode === 'always') {
      return true;
    }

    if (config.encryptionUnlockMode === 'interval') {
      const intervalMs = config.encryptionRecheckIntervalMinutes * 60 * 1000;
      return Date.now() - state.lastVerifiedAt >= intervalMs;
    }

    return false;
  }

  private async unlockWithPassword(password: string) {
    const config = this.context.pluginConfig;
    if (!config.encryptionVerifier) {
      return false;
    }

    const valid = await verifyPassword(password, config.encryptionVerifier);
    if (!valid) {
      return false;
    }

    if (this.context.getEncryptionState().hasEncryptedStorage) {
      const loaded = await this.context.getStorageStore().loadData(config, password);
      if (!loaded) {
        return false;
      }
      this.context.replaceData(loaded);
    }

    this.context.setEncryptionState({
      encryptionPassword: password,
      lastVerifiedAt: Date.now(),
      hasUnlockedData: true,
    });
    return true;
  }

  private async tryUnlockWithSavedPassword() {
    const config = this.context.pluginConfig;
    if (!config.persistEncryptionPassword || !config.savedEncryptionPassword) {
      return false;
    }

    const state = this.context.getEncryptionState();
    if (state.hasUnlockedData && state.encryptionPassword === config.savedEncryptionPassword) {
      return true;
    }

    const unlocked = await this.unlockWithPassword(config.savedEncryptionPassword);
    if (unlocked) {
      return true;
    }

    this.context.updatePluginConfig({
      persistEncryptionPassword: false,
      savedEncryptionPassword: '',
    });
    await this.context.savePluginConfig();
    return false;
  }

  private async requestSinglePassword(title: string = PWM_TEXT.UNLOCK_MANAGER_TITLE) {
    const passwords = await this.requestPasswords(title, [
      { key: 'password', label: PWM_TEXT.CURRENT_ENCRYPTION_PASSWORD },
    ]);
    return passwords?.password?.trim() ?? '';
  }

  private async requestPasswords(title: string, fields: PasswordPromptField[]) {
    return PasswordPromptModal.open(this.app, { title, fields, confirmText: PWM_TEXT.CONFIRM, cancelText: PWM_TEXT.CANCEL });
  }

  private async openFolder(path: string, successMessage?: string, failedMessage?: string) {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice(failedMessage ?? PWM_TEXT.OPEN_STORAGE_FOLDER_FAILED);
      return false;
    }

    try {
      await adapter.mkdir(path).catch(() => undefined);

      const shell = (window as Window & {
        require?: (module: string) => { shell?: { openPath: (path: string) => Promise<string> } };
      }).require?.('electron')?.shell;
      const opened = await shell?.openPath(adapter.getFilePath(path));
      if (opened === '') {
        if (successMessage) {
          new Notice(successMessage);
        }
        return true;
      }
    } catch {
      // fall through to failure notice
    }

    new Notice(failedMessage ?? PWM_TEXT.OPEN_STORAGE_FOLDER_FAILED);
    return false;
  }
}