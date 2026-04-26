import { normalizePath, type App } from 'obsidian';
import type { DeletedPasswordItem, PasswordItem, PasswordTrashData } from '../util/types';

export class PasswordTrashStore {
  private readonly trashFilePath: string;

  constructor(
    private readonly app: App,
    private readonly pluginId: string,
  ) {
    this.trashFilePath = normalizePath(`${this.app.vault.configDir}/plugins/${pluginId}/trash.json`);
  }

  async moveItemToTrash(item: PasswordItem) {
    const trash = await this.load();
    const deletedItem: DeletedPasswordItem = {
      ...structuredClone(item),
      deletedAt: Date.now(),
    };
    trash.items.unshift(deletedItem);
    await this.save(trash);
  }

  async load(): Promise<PasswordTrashData> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.trashFilePath))) {
      return { items: [] };
    }

    try {
      const content = await adapter.read(this.trashFilePath);
      const parsed = JSON.parse(content) as Partial<PasswordTrashData>;
      return {
        items: Array.isArray(parsed?.items)
          ? parsed.items
              .filter((item): item is DeletedPasswordItem => !!item && typeof item === 'object' && typeof item.id === 'string')
              .map((item) => ({
                ...item,
                deletedAt: typeof item.deletedAt === 'number' ? item.deletedAt : Date.now(),
              }))
          : [],
      };
    } catch {
      return { items: [] };
    }
  }

  private async save(trash: PasswordTrashData) {
    const adapter = this.app.vault.adapter;
    const pluginDir = normalizePath(`${this.app.vault.configDir}/plugins/${this.pluginId}`);
    if (!(await adapter.exists(pluginDir))) {
      await adapter.mkdir(pluginDir);
    }
    await adapter.write(this.trashFilePath, JSON.stringify(trash, null, 2));
  }
}