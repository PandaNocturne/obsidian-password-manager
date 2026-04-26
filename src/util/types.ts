import type { PasswordManagerSettings, PasswordPluginConfig } from './settings';

export type PwmSortMode =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'created-asc'
  | 'created-desc'
  | 'updated-asc'
  | 'updated-desc'
  | 'deleted-asc'
  | 'deleted-desc'
  | 'item-count-asc'
  | 'item-count-desc';
export type PasswordCopyFormat = 'markdown' | 'plain-text' | 'callout';
export type PasswordUnlockMode = 'session' | 'interval' | 'always';

export interface PasswordItem {
  id: string;
  groupIds: string[];
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface DeletedPasswordItem extends PasswordItem {
  deletedAt: number;
  deletedGroupNames?: string[];
}

export interface PasswordTrashData {
  items: DeletedPasswordItem[];
}

export interface PasswordGroup {
  id: string;
  name: string;
  createdAt: number;
  order: number;
}

export interface PasswordManagerViewState {
  groupSort: PwmSortMode;
  itemSort: PwmSortMode;
  lastMode: 'default' | 'trash';
  lastSelectedGroupId: string;
  lastSelectedItemId: string;
  groupColumnWidth: number;
  itemColumnWidth: number;
}

export interface PasswordManagerSettings {
  confirmBeforeDelete: boolean;
  copyFormat: PasswordCopyFormat;
  showItemUsername: boolean;
  showItemUrl: boolean;
  showItemGroupTags: boolean;
  showItemNotes: boolean;
}

export interface EncryptedPasswordLibraryPayload {
  version: 1;
  kind: 'encrypted-library';
  encryptedAt: number;
  salt: string;
  iv: string;
  cipherText: string;
}

export interface EncryptedPasswordVerifier {
  version: 1;
  kind: 'password-verifier';
  createdAt: number;
  salt: string;
  iv: string;
  cipherText: string;
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

export interface PasswordManagerData {
  groups: PasswordGroup[];
  items: PasswordItem[];
  trash: DeletedPasswordItem[];
  view: PasswordManagerViewState;
  settings: PasswordManagerSettings;
}

export interface PwmFieldAction {
  icon: string;
  label: string;
  onClick: (input: HTMLInputElement | HTMLTextAreaElement, button: HTMLButtonElement) => void | Promise<void>;
}

export interface PwmTextFieldOptions {
  leadingIcon?: string;
}

export interface PasswordManagerExportPayload {
  version: 1;
  kind: 'library' | 'group' | 'groups' | 'item' | 'items';
  exportedAt: number;
  data:
    | PasswordManagerData
    | { group: PasswordGroup; items: PasswordItem[] }
    | { groups: Array<{ group: PasswordGroup; items: PasswordItem[] }> }
    | PasswordItem
    | PasswordItem[];
}