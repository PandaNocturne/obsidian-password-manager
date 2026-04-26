import type { EncryptedPasswordVerifier } from './util/types';
import { PluginSettingTab, Setting, type App } from 'obsidian';
import { PWM_TEXT } from './lang';
import type PasswordManagerPlugin from './main';
import type { PasswordCopyFormat, PasswordUnlockMode } from './util/types';
import { MarkdownFileSuggestModal } from './ui/markdown-file-suggest-modal';

export interface PasswordManagerSettings {
  confirmBeforeDelete: boolean;
  copyFormat: PasswordCopyFormat;
  showItemUsername: boolean;
  showItemUrl: boolean;
  showItemGroupTags: boolean;
  showItemNotes: boolean;
}

export interface PasswordPluginConfig {
  storageFolderName: string;
  autoBackupEnabled: boolean;
  autoBackupCount: number;
  autoBackupIntervalMinutes: number;
  trashRetentionDays: number;
  lastAutoBackupAt: number;
  autoExportMarkdownEnabled: boolean;
  autoExportMarkdownFilePath: string;
  autoExportMarkdownFormat: PasswordCopyFormat;
  exportEmptyGroups: boolean;
  exportBlankItems: boolean;
  encryptionEnabled: boolean;
  encryptionUnlockMode: PasswordUnlockMode;
  encryptionRecheckIntervalMinutes: number;
  encryptionVerifier: EncryptedPasswordVerifier | null;
  persistEncryptionPassword: boolean;
  savedEncryptionPassword: string;
  modalWidthExpr: string;
  modalHeightExpr: string;
  columnRatioExpr: string;
  columnRatioLocked: boolean;
}

export const DEFAULT_PASSWORD_MANAGER_SETTINGS: PasswordManagerSettings = {
  confirmBeforeDelete: true,
  copyFormat: 'markdown',
  showItemUsername: true,
  showItemUrl: true,
  showItemGroupTags: true,
  showItemNotes: true,
};

export const DEFAULT_PASSWORD_PLUGIN_CONFIG: PasswordPluginConfig = {
  storageFolderName: '.password',
  autoBackupEnabled: true,
  autoBackupCount: 20,
  autoBackupIntervalMinutes: 5,
  trashRetentionDays: 150,
  lastAutoBackupAt: 0,
  autoExportMarkdownEnabled: false,
  autoExportMarkdownFilePath: '',
  autoExportMarkdownFormat: 'markdown',
  exportEmptyGroups: true,
  exportBlankItems: true,
  encryptionEnabled: false,
  encryptionUnlockMode: 'session',
  encryptionRecheckIntervalMinutes: 30,
  encryptionVerifier: null,
  persistEncryptionPassword: false,
  savedEncryptionPassword: '',
  modalWidthExpr: '92vw, 1200px',
  modalHeightExpr: '80vh, 800px',
  columnRatioExpr: '1,1,2',
  columnRatioLocked: true,
};

const removeFromTabOrder = (element: HTMLElement | null) => {
  if (!element) {
    return;
  }

  element.tabIndex = -1;
};

export class PasswordManagerSettingTab extends PluginSettingTab {
  private isSyncingEncryptionToggle = false;

  constructor(app: App, private readonly plugin: PasswordManagerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(PWM_TEXT.SETTINGS_TITLE)
      .setHeading();

    new Setting(containerEl)
      .setName(PWM_TEXT.STORAGE_FOLDER_SETTING)
      .setDesc(PWM_TEXT.STORAGE_FOLDER_SETTING_DESC)
      .addText((text) =>
        text
          .setPlaceholder('.password')
          .setValue(this.plugin.pluginConfig.storageFolderName)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ storageFolderName: value });
            await this.plugin.savePluginConfig();
          }),
      )
      .addExtraButton((button) => {
        button.setIcon('folder-open');
        button.setTooltip(PWM_TEXT.OPEN_STORAGE_FOLDER);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          await this.plugin.openStorageFolder();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.CONFIRM_DELETE_SETTING)
      .setDesc(PWM_TEXT.CONFIRM_DELETE_SETTING_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.data.settings.confirmBeforeDelete)
          .onChange(async (value) => {
            this.plugin.updateSettings({ confirmBeforeDelete: value });
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.COPY_FORMAT_SETTING)
      .setDesc(PWM_TEXT.COPY_FORMAT_SETTING_DESC)
      .addDropdown((dropdown) =>
        dropdown
          .addOption('markdown', PWM_TEXT.COPY_FORMAT_MARKDOWN)
          .addOption('callout', PWM_TEXT.COPY_FORMAT_CALLOUT)
          .setValue(this.plugin.data.settings.copyFormat)
          .onChange(async (value: PasswordCopyFormat) => {
            this.plugin.updateSettings({ copyFormat: value });
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.EXPORT_SETTINGS_TITLE)
      .setHeading();

    new Setting(containerEl)
      .setName(PWM_TEXT.AUTO_EXPORT_MARKDOWN_SETTING)
      .setDesc(PWM_TEXT.AUTO_EXPORT_MARKDOWN_SETTING_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginConfig.autoExportMarkdownEnabled)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ autoExportMarkdownEnabled: value });
            await this.plugin.savePluginConfig();
            await this.plugin.syncLibraryMarkdownExport();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.AUTO_EXPORT_MARKDOWN_FILE_SETTING)
      .setDesc(PWM_TEXT.AUTO_EXPORT_MARKDOWN_FILE_SETTING_DESC)
      .addText((text) => {
        text
          .setPlaceholder('Folder/Passwords.md')
          .setValue(this.plugin.pluginConfig.autoExportMarkdownFilePath)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ autoExportMarkdownFilePath: value.trim() });
            await this.plugin.savePluginConfig();
          });
        text.inputEl.readOnly = true;
      })
      .addExtraButton((button) => {
        button.setIcon('file');
        button.setTooltip(PWM_TEXT.SELECT_MARKDOWN_FILE);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(() => {
          new MarkdownFileSuggestModal(this.app, (file) => {
            void (async () => {
              this.plugin.updatePluginConfig({ autoExportMarkdownFilePath: file.path });
              await this.plugin.savePluginConfig();
              await this.plugin.syncLibraryMarkdownExport();
              this.display();
            })();
          }).open();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.AUTO_EXPORT_MARKDOWN_FORMAT_SETTING)
      .setDesc(PWM_TEXT.AUTO_EXPORT_MARKDOWN_FORMAT_SETTING_DESC)
      .addDropdown((dropdown) =>
        dropdown
          .addOption('markdown', PWM_TEXT.COPY_FORMAT_MARKDOWN)
          .addOption('callout', PWM_TEXT.COPY_FORMAT_CALLOUT)
          .setValue(this.plugin.pluginConfig.autoExportMarkdownFormat)
          .onChange(async (value: PasswordCopyFormat) => {
            this.plugin.updatePluginConfig({ autoExportMarkdownFormat: value });
            await this.plugin.savePluginConfig();
            await this.plugin.syncLibraryMarkdownExport();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.EXPORT_EMPTY_GROUPS_SETTING)
      .setDesc(PWM_TEXT.EXPORT_EMPTY_GROUPS_SETTING_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginConfig.exportEmptyGroups)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ exportEmptyGroups: value });
            await this.plugin.savePluginConfig();
            await this.plugin.syncLibraryMarkdownExport();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.EXPORT_BLANK_ITEMS_SETTING)
      .setDesc(PWM_TEXT.EXPORT_BLANK_ITEMS_SETTING_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginConfig.exportBlankItems)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ exportBlankItems: value });
            await this.plugin.savePluginConfig();
            await this.plugin.syncLibraryMarkdownExport();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.MODAL_SETTINGS_TITLE)
      .setHeading();

    new Setting(containerEl)
      .setName(PWM_TEXT.MODAL_WIDTH_SETTING)
      .setDesc(PWM_TEXT.MODAL_WIDTH_SETTING_DESC)
      .addText((text) =>
        text
          .setPlaceholder('92vw, 1200px')
          .setValue(this.plugin.pluginConfig.modalWidthExpr)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ modalWidthExpr: value });
            await this.plugin.savePluginConfig();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.MODAL_HEIGHT_SETTING)
      .setDesc(PWM_TEXT.MODAL_HEIGHT_SETTING_DESC)
      .addText((text) =>
        text
          .setPlaceholder('80vh, 800px')
          .setValue(this.plugin.pluginConfig.modalHeightExpr)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ modalHeightExpr: value });
            await this.plugin.savePluginConfig();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.COLUMN_RATIO_SETTING)
      .setDesc(PWM_TEXT.COLUMN_RATIO_SETTING_DESC)
      .addText((text) => {
        const applyColumnRatio = async () => {
          this.plugin.updatePluginConfig({ columnRatioExpr: text.getValue() });
          await this.plugin.savePluginConfig();
          this.plugin.refreshManagerLayouts();
        };

        text
          .setPlaceholder('1,1,2')
          .setValue(this.plugin.pluginConfig.columnRatioExpr)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ columnRatioExpr: value });
            await this.plugin.savePluginConfig();
          });

        text.inputEl.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') {
            return;
          }

          event.preventDefault();
          void applyColumnRatio();
        });
      })
      .addExtraButton((button) => {
        button.setIcon('reset');
        button.setTooltip(PWM_TEXT.COLUMN_RATIO_RESET);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ columnRatioExpr: '1,1,2', columnRatioLocked: true });
          await this.plugin.savePluginConfig();
          this.plugin.refreshManagerLayouts();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.ENCRYPTION_SETTINGS_TITLE)
      .setDesc(PWM_TEXT.ENCRYPTION_SETTINGS_TITLE_DESC)
      .setHeading();

    new Setting(containerEl)
      .setName(PWM_TEXT.ENCRYPTION_ENABLED_SETTING)
      .setDesc(PWM_TEXT.ENCRYPTION_ENABLED_SETTING_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginConfig.encryptionEnabled)
          .onChange(async (value) => {
            if (this.isSyncingEncryptionToggle) {
              return;
            }

            const previousValue = this.plugin.pluginConfig.encryptionEnabled;
            this.isSyncingEncryptionToggle = true;
            try {
              const success = value
                ? await this.plugin.enableEncryption()
                : await this.plugin.disableEncryption();
              if (!success) {
                toggle.setValue(previousValue);
              }
            } catch {
              toggle.setValue(previousValue);
            } finally {
              this.isSyncingEncryptionToggle = false;
              this.display();
            }
          }),
      );

    if (this.plugin.pluginConfig.encryptionEnabled) {
      new Setting(containerEl)
        .setName(PWM_TEXT.ENCRYPTION_UNLOCK_MODE_SETTING)
        .setDesc(PWM_TEXT.ENCRYPTION_UNLOCK_MODE_SETTING_DESC)
        .addDropdown((dropdown) =>
          dropdown
            .addOption('session', PWM_TEXT.ENCRYPTION_UNLOCK_MODE_SESSION)
            .addOption('interval', PWM_TEXT.ENCRYPTION_UNLOCK_MODE_INTERVAL)
            .addOption('always', PWM_TEXT.ENCRYPTION_UNLOCK_MODE_ALWAYS)
            .setValue(this.plugin.pluginConfig.encryptionUnlockMode)
            .onChange(async (value: PasswordUnlockMode) => {
              this.plugin.updatePluginConfig({ encryptionUnlockMode: value });
              await this.plugin.savePluginConfig();
              this.display();
            }),
        );

      new Setting(containerEl)
        .setName(PWM_TEXT.PERSIST_ENCRYPTION_PASSWORD_SETTING)
        .setDesc(PWM_TEXT.PERSIST_ENCRYPTION_PASSWORD_SETTING_DESC)
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.pluginConfig.persistEncryptionPassword)
            .onChange(async (value) => {
              await this.plugin.setPersistEncryptionPassword(value);
              this.display();
            }),
        );

      if (this.plugin.pluginConfig.encryptionUnlockMode === 'interval') {
        new Setting(containerEl)
          .setName(PWM_TEXT.ENCRYPTION_RECHECK_INTERVAL_SETTING)
          .setDesc(PWM_TEXT.ENCRYPTION_RECHECK_INTERVAL_SETTING_DESC)
          .addText((text) =>
            text
              .setPlaceholder('30')
              .setValue(String(this.plugin.pluginConfig.encryptionRecheckIntervalMinutes))
              .onChange(async (value) => {
                const parsed = Number(value);
                this.plugin.updatePluginConfig({ encryptionRecheckIntervalMinutes: Number.isFinite(parsed) ? parsed : 30 });
                await this.plugin.savePluginConfig();
              }),
          )
          .addExtraButton((button) => {
            button.setIcon('reset');
            button.setTooltip(PWM_TEXT.ENCRYPTION_RECHECK_INTERVAL_RESET);
            removeFromTabOrder(button.extraSettingsEl);
            button.onClick(async () => {
              this.plugin.updatePluginConfig({ encryptionRecheckIntervalMinutes: 30 });
              await this.plugin.savePluginConfig();
              this.display();
            });
          });
      }

      new Setting(containerEl)
        .setName(PWM_TEXT.CHANGE_ENCRYPTION_PASSWORD)
        .addButton((button) => {
          button.setButtonText(PWM_TEXT.CHANGE_ENCRYPTION_PASSWORD_ACTION);
          removeFromTabOrder(button.buttonEl);
          button.onClick(async () => {
            const success = await this.plugin.changeEncryptionPassword();
            if (success) {
              this.display();
            }
          });
        });
    }

    new Setting(containerEl)
      .setName(PWM_TEXT.BACKUP_SETTINGS_TITLE)
      .setHeading();

    new Setting(containerEl)
      .setName(PWM_TEXT.CREATE_BACKUP_NOW)
      .setDesc(PWM_TEXT.CREATE_BACKUP_NOW_DESC)
      .addButton((button) => {
        button.setButtonText(PWM_TEXT.CREATE_BACKUP_NOW);
        removeFromTabOrder(button.buttonEl);
        button.onClick(async () => {
          await this.plugin.createBackupNow();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.AUTO_BACKUP_ENABLED_SETTING)
      .setDesc(PWM_TEXT.AUTO_BACKUP_ENABLED_SETTING_DESC)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginConfig.autoBackupEnabled)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ autoBackupEnabled: value });
            await this.plugin.savePluginConfig();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.AUTO_BACKUP_COUNT_SETTING)
      .setDesc(PWM_TEXT.AUTO_BACKUP_COUNT_SETTING_DESC)
      .addSlider((slider) =>
        slider
          .setLimits(0, 50, 1)
          .setValue(this.plugin.pluginConfig.autoBackupCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ autoBackupCount: value });
            await this.plugin.savePluginConfig();
          }),
      )
      .addExtraButton((button) => {
        button.setIcon('reset');
        button.setTooltip(PWM_TEXT.AUTO_BACKUP_COUNT_RESET);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ autoBackupCount: 20 });
          await this.plugin.savePluginConfig();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.AUTO_BACKUP_INTERVAL_SETTING)
      .setDesc(PWM_TEXT.AUTO_BACKUP_INTERVAL_SETTING_DESC)
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.pluginConfig.autoBackupIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ autoBackupIntervalMinutes: value });
            await this.plugin.savePluginConfig();
          }),
      )
      .addExtraButton((button) => {
        button.setIcon('reset');
        button.setTooltip(PWM_TEXT.AUTO_BACKUP_INTERVAL_RESET);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ autoBackupIntervalMinutes: 5 });
          await this.plugin.savePluginConfig();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.TRASH_RETENTION_DAYS_SETTING)
      .setDesc(PWM_TEXT.TRASH_RETENTION_DAYS_SETTING_DESC)
      .addSlider((slider) =>
        slider
          .setLimits(0, 365, 1)
          .setValue(this.plugin.pluginConfig.trashRetentionDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ trashRetentionDays: value });
            await this.plugin.applyTrashRetentionPolicy();
          }),
      )
      .addExtraButton((button) => {
        button.setIcon('reset');
        button.setTooltip(PWM_TEXT.TRASH_RETENTION_DAYS_RESET);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ trashRetentionDays: 150 });
          await this.plugin.applyTrashRetentionPolicy();
          this.display();
        });
      });
  }
}