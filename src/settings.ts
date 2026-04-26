import type { EncryptedPasswordVerifier } from './util/types';
import { PluginSettingTab, Setting, type App } from 'obsidian';
import { PWM_TEXT } from './lang';
import type PasswordManagerPlugin from './main';
import type { PasswordCopyFormat, PasswordUnlockMode } from './util/types';

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

    containerEl.createEl('h2', { text: PWM_TEXT.settingsTitle });

    new Setting(containerEl)
      .setName(PWM_TEXT.storageFolderSetting)
      .setDesc(PWM_TEXT.storageFolderSettingDesc)
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
        button.setTooltip(PWM_TEXT.openStorageFolder);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          await this.plugin.openStorageFolder();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.confirmDeleteSetting)
      .setDesc(PWM_TEXT.confirmDeleteSettingDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.data.settings.confirmBeforeDelete)
          .onChange(async (value) => {
            this.plugin.updateSettings({ confirmBeforeDelete: value });
            await this.plugin.savePluginData();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.copyFormatSetting)
      .setDesc(PWM_TEXT.copyFormatSettingDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption('markdown', PWM_TEXT.copyFormatMarkdown)
          .addOption('plain-text', PWM_TEXT.copyFormatPlainText)
          .addOption('callout', PWM_TEXT.copyFormatCallout)
          .setValue(this.plugin.data.settings.copyFormat)
          .onChange(async (value: PasswordCopyFormat) => {
            this.plugin.updateSettings({ copyFormat: value });
            await this.plugin.savePluginData();
          }),
      );

    containerEl.createEl('h3', { text: PWM_TEXT.modalSettingsTitle });

    new Setting(containerEl)
      .setName(PWM_TEXT.modalWidthSetting)
      .setDesc(PWM_TEXT.modalWidthSettingDesc)
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
      .setName(PWM_TEXT.modalHeightSetting)
      .setDesc(PWM_TEXT.modalHeightSettingDesc)
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
      .setName(PWM_TEXT.columnRatioSetting)
      .setDesc(PWM_TEXT.columnRatioSettingDesc)
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
        button.setTooltip(PWM_TEXT.columnRatioReset);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ columnRatioExpr: '1,1,2', columnRatioLocked: true });
          await this.plugin.savePluginConfig();
          this.plugin.refreshManagerLayouts();
          this.display();
        });
      });

    containerEl.createEl('h3', { text: PWM_TEXT.encryptionSettingsTitle });
    containerEl.createEl('p', {
      text: PWM_TEXT.encryptionSettingsTitleDesc,
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName(PWM_TEXT.encryptionEnabledSetting)
      .setDesc(PWM_TEXT.encryptionEnabledSettingDesc)
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
        .setName(PWM_TEXT.encryptionUnlockModeSetting)
        .setDesc(PWM_TEXT.encryptionUnlockModeSettingDesc)
        .addDropdown((dropdown) =>
          dropdown
            .addOption('session', PWM_TEXT.encryptionUnlockModeSession)
            .addOption('interval', PWM_TEXT.encryptionUnlockModeInterval)
            .addOption('always', PWM_TEXT.encryptionUnlockModeAlways)
            .setValue(this.plugin.pluginConfig.encryptionUnlockMode)
            .onChange(async (value: PasswordUnlockMode) => {
              this.plugin.updatePluginConfig({ encryptionUnlockMode: value });
              await this.plugin.savePluginConfig();
              this.display();
            }),
        );

      new Setting(containerEl)
        .setName(PWM_TEXT.persistEncryptionPasswordSetting)
        .setDesc(PWM_TEXT.persistEncryptionPasswordSettingDesc)
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
          .setName(PWM_TEXT.encryptionRecheckIntervalSetting)
          .setDesc(PWM_TEXT.encryptionRecheckIntervalSettingDesc)
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
            button.setTooltip(PWM_TEXT.encryptionRecheckIntervalReset);
            removeFromTabOrder(button.extraSettingsEl);
            button.onClick(async () => {
              this.plugin.updatePluginConfig({ encryptionRecheckIntervalMinutes: 30 });
              await this.plugin.savePluginConfig();
              this.display();
            });
          });
      }

      new Setting(containerEl)
        .setName(PWM_TEXT.changeEncryptionPassword)
        .addButton((button) => {
          button.setButtonText(PWM_TEXT.changeEncryptionPasswordAction);
          removeFromTabOrder(button.buttonEl);
          button.onClick(async () => {
            const success = await this.plugin.changeEncryptionPassword();
            if (success) {
              this.display();
            }
          });
        });
    }

    containerEl.createEl('h3', { text: PWM_TEXT.backupSettingsTitle });

    new Setting(containerEl)
      .setName(PWM_TEXT.createBackupNow)
      .setDesc(PWM_TEXT.createBackupNowDesc)
      .addButton((button) => {
        button.setButtonText(PWM_TEXT.createBackupNow);
        removeFromTabOrder(button.buttonEl);
        button.onClick(async () => {
          await this.plugin.createBackupNow();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.autoBackupEnabledSetting)
      .setDesc(PWM_TEXT.autoBackupEnabledSettingDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.pluginConfig.autoBackupEnabled)
          .onChange(async (value) => {
            this.plugin.updatePluginConfig({ autoBackupEnabled: value });
            await this.plugin.savePluginConfig();
          }),
      );

    new Setting(containerEl)
      .setName(PWM_TEXT.autoBackupCountSetting)
      .setDesc(PWM_TEXT.autoBackupCountSettingDesc)
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
        button.setTooltip(PWM_TEXT.autoBackupCountReset);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ autoBackupCount: 20 });
          await this.plugin.savePluginConfig();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.autoBackupIntervalSetting)
      .setDesc(PWM_TEXT.autoBackupIntervalSettingDesc)
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
        button.setTooltip(PWM_TEXT.autoBackupIntervalReset);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ autoBackupIntervalMinutes: 5 });
          await this.plugin.savePluginConfig();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(PWM_TEXT.trashRetentionDaysSetting)
      .setDesc(PWM_TEXT.trashRetentionDaysSettingDesc)
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
        button.setTooltip(PWM_TEXT.trashRetentionDaysReset);
        removeFromTabOrder(button.extraSettingsEl);
        button.onClick(async () => {
          this.plugin.updatePluginConfig({ trashRetentionDays: 150 });
          await this.plugin.applyTrashRetentionPolicy();
          this.display();
        });
      });
  }
}