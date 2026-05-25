export const PWM_MODAL_CLASS = 'pwm-modal';

const MODAL_SIZE_PROPERTIES = ['width', 'max-width', 'height', 'max-height'] as const;

export function applyPwmModalClass(modalEl: HTMLElement) {
  modalEl.addClass(PWM_MODAL_CLASS);
}

export function clearPwmModalShell(modalEl: HTMLElement) {
  modalEl.removeClass(PWM_MODAL_CLASS);
  MODAL_SIZE_PROPERTIES.forEach((property) => {
    modalEl.style.removeProperty(property);
  });
}
