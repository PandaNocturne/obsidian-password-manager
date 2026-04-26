import { FuzzySuggestModal, type App, type TFile } from 'obsidian';

export class MarkdownFileSuggestModal extends FuzzySuggestModal<TFile> {
  private resolveSelection!: (file: TFile | null) => void;

  constructor(app: App) {
    super(app);
    this.setPlaceholder('Select a Markdown file');
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.resolveSelection(file);
  }

  onClose(): void {
    super.onClose();
    this.resolveSelection?.(null);
  }

  static open(app: App): Promise<TFile | null> {
    return new Promise((resolve) => {
      const modal = new MarkdownFileSuggestModal(app);
      let settled = false;
      modal.resolveSelection = (file) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(file);
      };
      modal.open();
    });
  }
}