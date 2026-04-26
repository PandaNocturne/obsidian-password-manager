import { Notice, normalizePath, TFile, type App } from 'obsidian';
import {
  importGroupFromText,
  importItemFromText,
  importItemsFromText,
  importLibraryFromText,
  isEncryptedLibraryImportText,
} from '../data/import-service';
import {
  downloadJson,
  downloadMarkdownGroup,
  downloadMarkdownGroups,
  downloadMarkdownItems,
  exportLibraryToMarkdown,
} from '../data/transfer';
import { PWM_TEXT } from '../lang';
import { appendDateTimeSuffix } from '../util/file-name';
import type { PasswordGroup, PasswordItem } from '../util/types';
import type { PasswordPluginContext } from './plugin-context';
import { PasswordPromptModal } from '../ui/password-prompt-modal';

export class PasswordTransferService {
  constructor(
    private readonly app: App,
    private readonly context: PasswordPluginContext,
  ) { }

  async exportLibrary() {
    const exportedAt = Date.now();
    const filename = appendDateTimeSuffix('password-library.json', exportedAt);

    if (this.context.pluginConfig.encryptionEnabled) {
      const exported = await this.context.getStorageStore().downloadEncryptedLibrary(this.context.pluginConfig, filename);
      if (!exported) {
        throw new Error('Failed to export encrypted library');
      }
      new Notice(PWM_TEXT.EXPORT_SUCCESS);
      return;
    }

    downloadJson(filename, {
      version: 1,
      kind: 'library',
      exportedAt,
      data: this.context.data,
    });
    new Notice(PWM_TEXT.EXPORT_SUCCESS);
  }

  async syncLibraryMarkdownExport() {
    if (!this.context.isLibraryDataReady()) {
      return null;
    }

    const file = await this.ensureLibraryMarkdownExportFile();
    if (!file) {
      return null;
    }

    const body = exportLibraryToMarkdown(
      this.context.data.groups,
      this.context.data.items,
      this.context.pluginConfig.autoExportMarkdownFormat,
    );
    const existingContent = await this.app.vault.read(file);
    const content = this.mergeMarkdownBodyPreservingFrontmatter(existingContent, body);
    await this.app.vault.modify(file, content);
    return file;
  }

  async ensureLibraryMarkdownExportFile() {
    if (!this.context.isLibraryDataReady()) {
      return null;
    }

    const path = this.getMarkdownExportPath();
    if (!path) {
      return null;
    }

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      return existing;
    }

    if (existing) {
      return null;
    }

    await this.ensureParentFolders(path);
    const initialContent = exportLibraryToMarkdown(
      this.context.data.groups,
      this.context.data.items,
      this.context.pluginConfig.autoExportMarkdownFormat,
    );
    return this.app.vault.create(path, initialContent);
  }

  async openLibraryMarkdownExportFile() {
    const file = await this.ensureLibraryMarkdownExportFile();
    if (!file) {
      return false;
    }

    await this.app.workspace.getLeaf(true).openFile(file);
    return true;
  }

  getLibraryMarkdownExportFile() {
    const path = this.getMarkdownExportPath();
    if (!path) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  exportGroup(groupId: string, format: 'json' | 'markdown' = 'json') {
    const group = this.context.getGroup(groupId);
    if (!group) {
      return false;
    }

    const exportedAt = Date.now();
    const items = this.context.getItemsByGroup(groupId);
    if (format === 'markdown') {
      downloadMarkdownGroup(
        appendDateTimeSuffix(`${group.name || 'group'}.md`, exportedAt),
        group,
        items,
        this.context.pluginConfig.autoExportMarkdownFormat,
      );
    } else {
      downloadJson(appendDateTimeSuffix(`${group.name || 'group'}.json`, exportedAt), {
        version: 1,
        kind: 'group',
        exportedAt,
        data: {
          group,
          items,
        },
      });
    }

    return true;
  }

  exportGroups(groupIds: string[], format: 'json' | 'markdown' = 'json') {
    const groupsWithItems = groupIds
      .map((groupId) => {
        const group = this.context.getGroup(groupId);
        if (!group) {
          return null;
        }

        return {
          group,
          items: this.context.getItemsByGroup(groupId),
        };
      })
      .filter((entry): entry is { group: PasswordGroup; items: PasswordItem[] } => !!entry);

    if (!groupsWithItems.length) {
      return;
    }

    const exportedAt = Date.now();
    if (format === 'markdown') {
      downloadMarkdownGroups(
        appendDateTimeSuffix('export-groups.md', exportedAt),
        groupsWithItems,
        this.context.pluginConfig.autoExportMarkdownFormat,
      );
    } else {
      downloadJson(appendDateTimeSuffix('export-groups.json', exportedAt), {
        version: 1,
        kind: 'groups',
        exportedAt,
        data: {
          groups: groupsWithItems,
        },
      });
    }

    new Notice(PWM_TEXT.EXPORT_SUCCESS);
  }

  exportItem(itemId: string) {
    const item = this.context.getItem(itemId);
    if (!item) {
      return;
    }

    const exportedAt = Date.now();
    downloadJson(appendDateTimeSuffix(`${item.title || 'item'}.json`, exportedAt), {
      version: 1,
      kind: 'item',
      exportedAt,
      data: item,
    });
    new Notice(PWM_TEXT.EXPORT_SUCCESS);
  }

  exportItems(itemIds: string[], format: 'json' | 'markdown') {
    const items = itemIds
      .map((itemId) => this.context.getItem(itemId))
      .filter((item): item is PasswordItem => !!item);
    if (!items.length) {
      return;
    }

    const exportedAt = Date.now();
    if (format === 'markdown') {
      downloadMarkdownItems(
        appendDateTimeSuffix('export-items.md', exportedAt),
        items,
        this.context.data.groups,
        this.context.pluginConfig.autoExportMarkdownFormat,
      );
    } else {
      downloadJson(appendDateTimeSuffix('export-items.json', exportedAt), {
        version: 1,
        kind: 'items',
        exportedAt,
        data: items,
      });
    }
    new Notice(PWM_TEXT.EXPORT_SUCCESS);
  }

  async importLibraryFromText(text: string) {
    try {
      const encryptedImport = isEncryptedLibraryImportText(text);
      const password = encryptedImport
        ? (await PasswordPromptModal.open(this.app, {
          title: PWM_TEXT.UNLOCK_MANAGER_TITLE,
          fields: [{ key: 'password', label: PWM_TEXT.CURRENT_ENCRYPTION_PASSWORD }],
          confirmText: PWM_TEXT.CONFIRM,
          cancelText: PWM_TEXT.CANCEL,
        }))?.password?.trim()
        : undefined;

      if (encryptedImport && !password) {
        throw new Error('Missing encryption password');
      }

      const imported = await importLibraryFromText(text, password);
      this.context.replaceData(imported);
    } catch {
      throw new Error(PWM_TEXT.IMPORT_FAILED);
    }
  }

  importGroupFromText(text: string) {
    try {
      return importGroupFromText(text, this.context.data);
    } catch {
      throw new Error(PWM_TEXT.IMPORT_FAILED);
    }
  }

  importItemFromText(text: string, groupId: string) {
    try {
      return importItemFromText(text, this.context.data, groupId);
    } catch {
      throw new Error(PWM_TEXT.IMPORT_FAILED);
    }
  }

  importItemsFromText(text: string, groupId: string) {
    try {
      return importItemsFromText(text, this.context.data, groupId);
    } catch {
      throw new Error(PWM_TEXT.IMPORT_FAILED);
    }
  }

  private mergeMarkdownBodyPreservingFrontmatter(existingContent: string, body: string) {
    const frontmatterMatch = existingContent.match(/^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n)*/);
    if (!frontmatterMatch) {
      return body;
    }

    return `${frontmatterMatch[1]}\n\n${body}`;
  }

  private getMarkdownExportPath() {
    const { autoExportMarkdownEnabled, autoExportMarkdownFilePath } = this.context.pluginConfig;
    if (!autoExportMarkdownEnabled || !autoExportMarkdownFilePath) {
      return '';
    }

    return normalizePath(autoExportMarkdownFilePath);
  }

  private async ensureParentFolders(path: string) {
    const segments = path.split('/');
    if (segments.length <= 1) {
      return;
    }

    let currentPath = '';
    for (const segment of segments.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (this.app.vault.getAbstractFileByPath(currentPath)) {
        continue;
      }
      await this.app.vault.createFolder(currentPath);
    }
  }
}