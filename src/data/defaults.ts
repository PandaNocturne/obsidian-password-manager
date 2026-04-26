import { PWM_TEXT } from '../lang';
import { DEFAULT_PASSWORD_MANAGER_SETTINGS } from '../settings';
import type { PasswordManagerData } from '../util/types';

const now = Date.now();

export const DEFAULT_DATA: PasswordManagerData = {
  groups: [
    {
      id: 'default-group',
      name: PWM_TEXT.DEFAULT_GROUP_NAME,
      createdAt: now,
      order: 0,
    },
  ],
  items: [
    {
      id: 'default-item',
      groupIds: ['default-group'],
      title: PWM_TEXT.DEFAULT_ITEM_TITLE,
      username: PWM_TEXT.DEFAULT_ITEM_USERNAME,
      password: 'password',
      urls: [],
      notes: '',
      pinned: false,
      createdAt: now,
      updatedAt: now,
      order: 0,
    },
  ],
  trash: [],
  view: {
    groupSort: 'custom',
    itemSort: 'custom',
    lastMode: 'default',
    lastSelectedGroupId: 'default-group',
    lastSelectedItemId: 'default-item',
    groupColumnWidth: 220,
    itemColumnWidth: 320,
  },
  settings: DEFAULT_PASSWORD_MANAGER_SETTINGS,
};
