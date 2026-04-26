import { PWM_TEXT as EN_TEXT } from './en';
import { PWM_TEXT as ZH_CN_TEXT } from './zh-cn';

type PwmText = typeof EN_TEXT;

const resolveLocale = () => {
  const language = (
    globalThis.localStorage?.getItem('language')
    || globalThis.navigator?.language
    || 'zh-CN'
  ).toLowerCase();

  if (language.startsWith('en')) {
    return 'en';
  }

  return 'zh-cn';
};

export const PWM_TEXT = resolveLocale() === 'en' ? EN_TEXT : ZH_CN_TEXT;

export function formatPWMText(template: string, params: Record<string, string | number>) {
  return Object.entries(params).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template,
  );
}

export type { PwmText };
