import { setIcon } from 'obsidian';

export const createIconButton = (
  container: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void | Promise<void>,
) => {
  const button = container.createEl('button', {
    cls: 'clickable-icon pwm-icon-button',
    attr: { 'aria-label': label, type: 'button' },
  });
  setIcon(button, icon);
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await onClick();
  });
  return button;
};