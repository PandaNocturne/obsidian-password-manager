import { ButtonComponent, Modal, Setting, setIcon, type App } from 'obsidian';
import { PWM_TEXT } from '../lang';

const removeFromTabOrder = (element: HTMLElement | null) => {
  if (!element) {
    return;
  }

  element.tabIndex = -1;
};

export interface PasswordPromptField {
  key: string;
  label: string;
  placeholder?: string;
  value?: string;
}

interface PasswordPromptOptions {
  title: string;
  fields: PasswordPromptField[];
  confirmText: string;
  cancelText: string;
}

export class PasswordPromptModal extends Modal {
  private readonly values = new Map<string, string>();
  private resolver!: (value: Record<string, string> | null) => void;
  private isResolved = false;

  constructor(app: App, private readonly options: PasswordPromptOptions) {
    super(app);
  }

  private submit() {
    const result = Object.fromEntries(this.options.fields.map((field) => [field.key, this.values.get(field.key) ?? '']));
    this.finish(result);
  }

  static open(app: App, options: PasswordPromptOptions) {
    return new Promise<Record<string, string> | null>((resolve) => {
      const modal = new PasswordPromptModal(app, options);
      modal.resolver = resolve;
      modal.open();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(this.options.title);

    for (const field of this.options.fields) {
      new Setting(contentEl)
        .setName(field.label)
        .addText((text) => {
          text.inputEl.type = 'password';
          text.setPlaceholder(field.placeholder ?? '');
          text.setValue(field.value ?? '');
          this.values.set(field.key, field.value ?? '');
          text.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              this.submit();
            }
          });
          text.onChange((value) => {
            this.values.set(field.key, value);
          });

          const inputContainer = text.inputEl.parentElement;
          if (inputContainer) {
            inputContainer.addClass('pwm-input-row', 'has-floating-actions');
            const actions = inputContainer.createDiv({ cls: 'pwm-inline-actions pwm-floating-actions' });
            const toggleButton = actions.createEl('button', {
              cls: 'clickable-icon pwm-icon-button',
              attr: { type: 'button', 'aria-label': PWM_TEXT.showPassword },
            });
            removeFromTabOrder(toggleButton);
            setIcon(toggleButton, 'eye');
            toggleButton.addEventListener('click', (event) => {
              event.preventDefault();
              const isHidden = text.inputEl.type === 'password';
              text.inputEl.type = isHidden ? 'text' : 'password';
              setIcon(toggleButton, isHidden ? 'eye-off' : 'eye');
              toggleButton.setAttr('aria-label', isHidden ? PWM_TEXT.hidePassword : PWM_TEXT.showPassword);
            });
          }

          window.setTimeout(() => {
            if (field === this.options.fields[0]) {
              text.inputEl.focus();
            }
          }, 0);
        });
    }

    const actions = contentEl.createDiv({ cls: 'modal-button-container' });
    const cancelButton = new ButtonComponent(actions)
      .setButtonText(this.options.cancelText)
      .onClick(() => {
        this.finish(null);
      });
    removeFromTabOrder(cancelButton.buttonEl);

    const confirmButton = new ButtonComponent(actions)
      .setButtonText(this.options.confirmText)
      .setCta()
      .onClick(() => {
        this.submit();
      });
    removeFromTabOrder(confirmButton.buttonEl);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.isResolved) {
      this.resolver(null);
      this.isResolved = true;
    }
  }

  private finish(value: Record<string, string> | null) {
    this.isResolved = true;
    this.close();
    this.resolver(value);
  }
}