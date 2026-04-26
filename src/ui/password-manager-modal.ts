import { App, Menu, Modal, Notice, Scope, setIcon } from 'obsidian';
import type PasswordManagerPlugin from '../main';
import { PWM_TEXT, formatPWMText } from '../lang';
import { includesKeyword, normalizeSearchKeyword } from '../util/search';
import type { DeletedPasswordItem, PasswordGroup, PasswordItem, PwmFieldAction, PwmSortMode, PwmTextFieldOptions } from '../util/types';

function setCssProps(element: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value);
  });
}

const GROUP_SORT_OPTIONS: Array<{ value: PwmSortMode; label: string }> = [
  { value: 'custom', label: PWM_TEXT.SORT_CUSTOM },
  { value: 'name-asc', label: PWM_TEXT.SORT_BY_NAME_ASC },
  { value: 'name-desc', label: PWM_TEXT.SORT_BY_NAME_DESC },
  { value: 'created-asc', label: PWM_TEXT.SORT_BY_CREATED_ASC },
  { value: 'created-desc', label: PWM_TEXT.SORT_BY_CREATED_DESC },
  { value: 'item-count-asc', label: PWM_TEXT.SORT_BY_ITEM_COUNT_ASC },
  { value: 'item-count-desc', label: PWM_TEXT.SORT_BY_ITEM_COUNT_DESC },
];

const ITEM_SORT_OPTIONS: Array<{ value: PwmSortMode; label: string }> = [
  { value: 'custom', label: PWM_TEXT.SORT_CUSTOM },
  { value: 'name-asc', label: PWM_TEXT.SORT_BY_NAME_ASC },
  { value: 'name-desc', label: PWM_TEXT.SORT_BY_NAME_DESC },
  { value: 'created-asc', label: PWM_TEXT.SORT_BY_CREATED_ASC },
  { value: 'created-desc', label: PWM_TEXT.SORT_BY_CREATED_DESC },
  { value: 'updated-asc', label: PWM_TEXT.SORT_BY_UPDATED_ASC },
  { value: 'updated-desc', label: PWM_TEXT.SORT_BY_UPDATED_DESC },
];

const TRASH_ITEM_SORT_OPTIONS: Array<{ value: PwmSortMode; label: string }> = [
  { value: 'custom', label: PWM_TEXT.SORT_CUSTOM },
  { value: 'name-asc', label: PWM_TEXT.SORT_BY_NAME_ASC },
  { value: 'name-desc', label: PWM_TEXT.SORT_BY_NAME_DESC },
  { value: 'created-asc', label: PWM_TEXT.SORT_BY_CREATED_ASC },
  { value: 'created-desc', label: PWM_TEXT.SORT_BY_CREATED_DESC },
  { value: 'deleted-asc', label: PWM_TEXT.SORT_BY_DELETED_ASC },
  { value: 'deleted-desc', label: PWM_TEXT.SORT_BY_DELETED_DESC },
];

const SORT_MENU_ICON = 'arrow-up-down';

type PasswordManagerModalMode = 'default' | 'trash';

export class PasswordManagerModal extends Modal {
  private mode: PasswordManagerModalMode;
  private rootEl: HTMLDivElement | null = null;
  private activeResizeCleanup: (() => void) | null = null;
  private selectedGroupId = '';
  private selectedItemId = '';
  private selectedGroupIds = new Set<string>();
  private selectedItemIds = new Set<string>();
  private groupSelectionAnchorId = '';
  private itemSelectionAnchorId = '';
  private keyword = '';
  private draggingGroupId = '';
  private draggingItemId = '';
  private dragGroupMode: 'move' | 'add' = 'move';
  private searchInputEl: HTMLInputElement | null = null;
  private searchClearButtonEl: HTMLButtonElement | null = null;
  private searchActionsEl: HTMLDivElement | null = null;
  private titleCountEl: HTMLDivElement | null = null;
  private groupsListEl: HTMLDivElement | null = null;
  private itemsListEl: HTMLDivElement | null = null;
  private detailsBodyEl: HTMLDivElement | null = null;
  private shouldPreserveScrollOnRender = false;
  private pendingScrollPositions: {
    groups: number;
    items: number;
    details: number;
  } | null = null;
  private editingGroupId = '';
  private detailsDraftItemId = '';
  private detailsDraft = {
    title: '',
    username: '',
    password: '',
    urls: [''],
    notes: '',
  };
  private detailInputs: Partial<Record<'title' | 'username' | 'password' | 'notes', HTMLInputElement | HTMLTextAreaElement>> = {};
  private detailUrlInputs: HTMLInputElement[] = [];
  private isSavingDetails = false;

  constructor(
    app: App,
    private readonly plugin: PasswordManagerPlugin,
    options: { mode?: PasswordManagerModalMode } = {},
  ) {
    super(app);
    this.mode = options.mode ?? plugin.data.view.lastMode;
    this.scope = new Scope(this.app.scope);
    this.selectedGroupId = this.getResolvedSelectedGroupId(this.plugin.data.view.lastSelectedGroupId);
    this.selectedItemId = this.getPreferredSelectedItemId(this.selectedGroupId, this.plugin.data.view.lastSelectedItemId);
    this.resetGroupSelection(this.selectedGroupId);
    this.resetItemSelection(this.selectedItemId);
    this.scope.register([], 'Escape', (evt: KeyboardEvent) => {
      evt.preventDefault();
      return false;
    });
  }

  onOpen() {
    this.plugin.registerManagerModal(this);
    this.titleEl.setText(PWM_TEXT.MODAL_TITLE);
    this.modalEl.addClass('pwm-modal');
    this.applyModalSize();
    this.contentEl.tabIndex = -1;
    this.ensureHeaderSearch();
    this.updateTitleCount();
    this.render();
    window.setTimeout(() => this.contentEl.focus(), 0);
  }

  onClose() {
    this.plugin.unregisterManagerModal(this);
    this.activeResizeCleanup?.();
    this.activeResizeCleanup = null;
    this.rootEl = null;
    void this.persistViewStateOnClose();
    this.searchInputEl?.remove();
    this.searchClearButtonEl?.remove();
    this.searchActionsEl?.remove();
    this.titleCountEl?.remove();
    this.searchInputEl = null;
    this.searchClearButtonEl = null;
    this.searchActionsEl = null;
    this.titleCountEl = null;
    this.titleEl.parentElement?.removeClass('pwm-modal-title-row');
    this.ensureScrollRefsCleared();
    this.contentEl.empty();
  }

  private async persistViewStateOnClose() {
    await this.flushSelectedItemDetailsBeforeNavigate();
    await this.persistViewState(true);
  }

  private async persistViewState(save = false) {
    this.plugin.data.view.lastMode = this.mode;
    this.plugin.data.view.lastSelectedGroupId = this.selectedGroupId;
    this.plugin.data.view.lastSelectedItemId = this.selectedItemId;

    if (save) {
      await this.plugin.savePluginData();
    }
  }

  private applyModalSize() {
    const { modalWidthExpr, modalHeightExpr } = this.plugin.pluginConfig;
    setCssProps(this.modalEl, {
      width: this.toModalCssMinValue(modalWidthExpr),
      'max-width': 'none',
      height: this.toModalCssMinValue(modalHeightExpr),
      'max-height': 'none',
    });
  }

  private toModalCssMinValue(value: string) {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    const firstPart = parts[0];
    if (!firstPart) {
      return 'auto';
    }

    if (parts.length === 1) {
      return firstPart;
    }

    return `min(${parts.join(', ')})`;
  }

  private parseColumnRatios() {
    const parts = this.plugin.pluginConfig.columnRatioExpr
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (parts.length === 3) {
      return parts as [number, number, number];
    }

    return [1, 1, 2] as [number, number, number];
  }

  private syncLayoutLockState(root: HTMLDivElement) {
    root.toggleClass('is-column-ratio-locked', this.plugin.pluginConfig.columnRatioLocked);
  }

  private applyLayoutWidths(root: HTMLDivElement) {
    const [groupRatio, itemRatio, detailRatio] = this.parseColumnRatios();
    this.syncLayoutLockState(root);
    setCssProps(root, {
      'grid-template-columns': `minmax(160px, ${groupRatio}fr) 6px minmax(160px, ${itemRatio}fr) 6px minmax(340px, ${detailRatio}fr)`,
    });
  }

  refreshLayout() {
    if (!this.rootEl) {
      return;
    }

    this.applyModalSize();
    this.applyLayoutWidths(this.rootEl);
  }

  private getColumnElements() {
    if (!this.rootEl) {
      return null;
    }

    const groupColumn = this.rootEl.querySelector<HTMLDivElement>('.pwm-groups-column');
    const itemColumn = this.rootEl.querySelector<HTMLDivElement>('.pwm-items-column');
    const detailsColumn = this.rootEl.querySelector<HTMLDivElement>('.pwm-details-column');
    if (!groupColumn || !itemColumn || !detailsColumn) {
      return null;
    }

    return { groupColumn, itemColumn, detailsColumn };
  }

  private getCurrentColumnWidths() {
    const columns = this.getColumnElements();
    if (!columns) {
      return null;
    }

    return {
      groupWidth: columns.groupColumn.getBoundingClientRect().width,
      itemWidth: columns.itemColumn.getBoundingClientRect().width,
      detailWidth: columns.detailsColumn.getBoundingClientRect().width,
    };
  }

  private buildColumnRatioExpr(groupWidth: number, itemWidth: number, detailWidth: number) {
    const widths = [groupWidth, itemWidth, detailWidth].map((value) => Math.max(1, value));
    const minWidth = Math.min(...widths);
    const ratios = widths.map((value) => {
      const ratio = value / minWidth;
      return Number.parseFloat(ratio.toFixed(3)).toString();
    });
    return ratios.join(',');
  }

  private async persistColumnRatios(groupWidth: number, itemWidth: number, detailWidth: number) {
    this.plugin.data.view.groupColumnWidth = Math.round(groupWidth);
    this.plugin.data.view.itemColumnWidth = Math.round(itemWidth);
    this.plugin.updatePluginConfig({
      columnRatioExpr: this.buildColumnRatioExpr(groupWidth, itemWidth, detailWidth),
    });
    await this.plugin.savePluginConfig();
  }

  private createResizeHandle(container: HTMLElement, column: 'group' | 'item') {
    const handle = container.parentElement?.createDiv({ cls: 'pwm-resize-handle' });
    if (!handle) {
      return;
    }

    handle.dataset.column = column;
    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      this.startColumnResize(event, column, handle);
    });
  }

  private startColumnResize(event: PointerEvent, column: 'group' | 'item', handle: HTMLElement) {
    if (!this.rootEl || this.plugin.pluginConfig.columnRatioLocked) {
      return;
    }

    const currentWidths = this.getCurrentColumnWidths();
    if (!currentWidths) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.activeResizeCleanup?.();

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startGroupWidth = currentWidths.groupWidth;
    const startItemWidth = currentWidths.itemWidth;
    const startDetailWidth = currentWidths.detailWidth;
    const minGroupWidth = 160;
    const minItemWidth = 160;
    const minDetailWidth = 340;

    handle.addClass('is-resizing');
    document.body.addClass('pwm-column-resizing');
    handle.setPointerCapture(pointerId);

    const updateWidths = (clientX: number) => {
      const deltaX = clientX - startX;
      let groupWidth = startGroupWidth;
      let itemWidth = startItemWidth;
      let detailWidth = startDetailWidth;

      if (column === 'group') {
        const nextGroupWidth = Math.max(minGroupWidth, Math.min(startGroupWidth + deltaX, startGroupWidth + startItemWidth - minItemWidth));
        groupWidth = nextGroupWidth;
        itemWidth = startGroupWidth + startItemWidth - nextGroupWidth;
      } else {
        const nextItemWidth = Math.max(minItemWidth, Math.min(startItemWidth + deltaX, startItemWidth + startDetailWidth - minDetailWidth));
        itemWidth = nextItemWidth;
        detailWidth = startItemWidth + startDetailWidth - nextItemWidth;
      }

      this.plugin.data.view.groupColumnWidth = Math.round(groupWidth);
      this.plugin.data.view.itemColumnWidth = Math.round(itemWidth);
      this.rootEl?.removeClass('is-column-ratio-locked');
      this.rootEl?.style.setProperty(
        'grid-template-columns',
        `${Math.round(groupWidth)}px 6px ${Math.round(itemWidth)}px 6px minmax(${minDetailWidth}px, ${Math.round(detailWidth)}px)`,
      );
    };

    const finishResize = () => {
      handle.removeClass('is-resizing');
      document.body.removeClass('pwm-column-resizing');
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerCancel);
      this.activeResizeCleanup = null;

      const widths = this.getCurrentColumnWidths();
      if (!widths) {
        return;
      }

      void this.persistColumnRatios(widths.groupWidth, widths.itemWidth, widths.detailWidth);
      if (this.rootEl) {
        this.applyLayoutWidths(this.rootEl);
      }
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateWidths(moveEvent.clientX);
    };

    const onPointerUp = () => {
      handle.releasePointerCapture(pointerId);
      finishResize();
    };

    const onPointerCancel = () => {
      handle.releasePointerCapture(pointerId);
      finishResize();
    };

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerCancel);
    this.activeResizeCleanup = () => {
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      handle.removeClass('is-resizing');
      document.body.removeClass('pwm-column-resizing');
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerCancel);
      if (this.rootEl) {
        this.applyLayoutWidths(this.rootEl);
      }
    };
  }

  private render() {
    this.captureScrollPositionsForRender();
    this.contentEl.empty();
    this.reconcileSelectionState();
    this.updateTitleCount();

    if (this.searchInputEl && this.searchInputEl.value !== this.keyword) {
      this.searchInputEl.value = this.keyword;
    }
    this.updateSearchClearButtonVisibility();

    const root = this.contentEl.createDiv({ cls: 'pwm-root' });
    this.rootEl = root;
    this.applyLayoutWidths(root);
    const groupsColumn = root.createDiv({ cls: 'pwm-column pwm-groups-column' });
    this.createResizeHandle(groupsColumn, 'group');
    const itemsColumn = root.createDiv({ cls: 'pwm-column pwm-items-column' });
    this.createResizeHandle(itemsColumn, 'item');
    const detailsColumn = root.createDiv({ cls: 'pwm-column pwm-details-column' });

    this.renderGroups(groupsColumn);
    this.renderItems(itemsColumn);
    this.renderDetails(detailsColumn);
    this.restoreScrollPositionsAfterRender();
  }

  private captureScrollPositionsForRender() {
    if (!this.shouldPreserveScrollOnRender) {
      this.pendingScrollPositions = null;
      return;
    }

    this.pendingScrollPositions = {
      groups: this.groupsListEl?.scrollTop ?? 0,
      items: this.itemsListEl?.scrollTop ?? 0,
      details: this.detailsBodyEl?.scrollTop ?? 0,
    };
    this.shouldPreserveScrollOnRender = false;
  }

  private restoreScrollPositionsAfterRender() {
    if (!this.pendingScrollPositions) {
      return;
    }

    this.groupsListEl?.scrollTo({ top: this.pendingScrollPositions.groups });
    this.itemsListEl?.scrollTo({ top: this.pendingScrollPositions.items });
    this.detailsBodyEl?.scrollTo({ top: this.pendingScrollPositions.details });
    this.pendingScrollPositions = null;
  }

  private preserveScrollForNextRender() {
    this.shouldPreserveScrollOnRender = true;
  }

  private async ensureWriteAccess() {
    return this.plugin.ensureWriteAccess();
  }

  private ensureScrollRefsCleared() {
    this.groupsListEl = null;
    this.itemsListEl = null;
    this.detailsBodyEl = null;
  }

  private ensureHeaderSearch() {
    const titleContainer = this.titleEl.parentElement;
    if (!titleContainer) {
      return;
    }

    titleContainer.addClass('pwm-modal-title-row');

    if (!this.titleCountEl) {
      this.titleCountEl = document.createElement('div');
      this.titleCountEl.addClass('pwm-badge', 'pwm-modal-title-count');
      this.titleEl.insertAdjacentElement('afterend', this.titleCountEl);
    }

    if (this.searchInputEl || this.searchActionsEl) {
      return;
    }

    this.searchActionsEl = titleContainer.createDiv({ cls: 'pwm-modal-header-actions' });
    this.plugin.createIconButton(this.searchActionsEl, 'database-backup', PWM_TEXT.CREATE_BACKUP_NOW, async () => {
      await this.plugin.createBackupNow();
    });
    this.plugin.createIconButton(this.searchActionsEl, 'upload', PWM_TEXT.EXPORT_LIBRARY, async () => {
      await this.plugin.exportLibrary();
    });
    this.plugin.createIconButton(this.searchActionsEl, 'download', PWM_TEXT.IMPORT_LIBRARY, async () => {
      await this.handleImport(async (text) => {
        await this.plugin.importLibraryFromText(text);
        this.reconcileSelectionState();
        this.selectedGroupId = this.getResolvedSelectedGroupId();
        this.selectedItemId = this.getPreferredSelectedItemId(this.selectedGroupId);
        this.resetGroupSelection(this.selectedGroupId);
        this.resetItemSelection(this.selectedItemId);
      }, 'application/json,text/markdown,.json,.md');
    });
    if (this.plugin.pluginConfig.autoExportMarkdownEnabled) {
      this.plugin.createIconButton(this.searchActionsEl, 'file-text', PWM_TEXT.OPEN_MARKDOWN_FILE, async () => {
        await this.plugin.openLibraryMarkdownExportFile();
      });
    }
    const searchField = this.searchActionsEl.createDiv({ cls: 'pwm-modal-header-search-wrap' });
    const searchIcon = searchField.createDiv({ cls: 'pwm-modal-header-search-icon' });
    setIcon(searchIcon, 'search');
    this.searchInputEl = searchField.createEl('input', {
      type: 'text',
      value: this.keyword,
      placeholder: PWM_TEXT.SEARCH_PLACEHOLDER,
      cls: 'pwm-search pwm-modal-header-search',
    });
    this.searchInputEl.addEventListener('click', (event) => event.stopPropagation());
    this.searchInputEl.addEventListener('input', () => {
      if (!this.searchInputEl) {
        return;
      }
      this.keyword = this.searchInputEl.value;
      this.updateSearchClearButtonVisibility();
      this.reconcileSelectionState();
      this.render();
    });
    this.searchClearButtonEl = this.plugin.createIconButton(searchField, 'x', PWM_TEXT.CLEAR_SEARCH, () => {
      if (!this.searchInputEl) {
        return;
      }
      this.keyword = '';
      this.searchInputEl.value = '';
      this.updateSearchClearButtonVisibility();
      this.reconcileSelectionState();
      this.render();
      this.searchInputEl.focus();
    });
    this.searchClearButtonEl.addClass('pwm-modal-header-search-clear');
    this.updateSearchClearButtonVisibility();
  }

  private updateSearchClearButtonVisibility() {
    this.searchClearButtonEl?.toggleClass('is-hidden', !this.keyword.trim());
  }

  private updateTitleCount() {
    if (!this.titleCountEl) {
      return;
    }

    this.titleCountEl.setText(String(this.getVisibleItemTotalCount()));
  }

  private isTrashMode() {
    return this.mode === 'trash';
  }

  private toggleMode() {
    this.mode = this.isTrashMode() ? 'default' : 'trash';
    this.editingGroupId = '';
    this.selectedGroupId = this.getResolvedSelectedGroupId();
    this.selectedItemId = this.getPreferredSelectedItemId(this.selectedGroupId);
    this.resetGroupSelection(this.selectedGroupId);
    this.resetItemSelection(this.selectedItemId);
    this.reconcileSelectionState();
    void this.persistViewState();
    this.render();
  }

  private getCurrentItem(itemId: string) {
    return this.isTrashMode() ? this.plugin.getTrashItem(itemId) : this.plugin.getItem(itemId);
  }

  private getModeGroups(): PasswordGroup[] {
    return this.isTrashMode() ? this.plugin.getTrashGroups() : this.plugin.getSortedGroups();
  }

  private getModeItemsByGroup(groupId: string) {
    return this.isTrashMode() ? this.plugin.getTrashItemsByGroup(groupId) : this.plugin.getSortedItemsByGroup(groupId);
  }

  private getTrashDateKey(item: DeletedPasswordItem) {
    return new Date(item.deletedAt).toISOString().slice(0, 10);
  }

  private renderGroups(container: HTMLElement) {
    container.empty();

    const header = container.createDiv({ cls: 'pwm-header' });
    const title = header.createDiv({ cls: 'pwm-inline-actions' });
    title.createEl('h3', { text: PWM_TEXT.GROUPS });

    const actions = header.createDiv({ cls: 'pwm-actions' });
    if (!this.isTrashMode()) {
      this.plugin.createIconButton(actions, 'plus', PWM_TEXT.ADD_GROUP, async () => {
        const allowed = await this.ensureWriteAccess();
        if (!allowed) {
          return;
        }
        const group = this.plugin.createGroup();
        this.selectedGroupId = group.id;
        this.selectedItemId = '';
        this.editingGroupId = group.id;
        this.resetGroupSelection(group.id);
        this.resetItemSelection('');
        await this.plugin.savePluginData();
        this.render();
      });
    }
    this.createSortMenuButton(actions, this.plugin.data.view.groupSort, PWM_TEXT.SORT_GROUPS, GROUP_SORT_OPTIONS, async (value) => {
      this.plugin.setGroupSort(value);
      await this.plugin.savePluginData();
      this.reconcileSelectionState();
      this.render();
    });
    const deleteGroupButton = this.plugin.createIconButton(actions, 'trash', PWM_TEXT.DELETE_GROUP, async () => {
      await this.deleteSelectedGroups();
    });
    if (this.isTrashMode()) {
      deleteGroupButton.addClass('pwm-button-warning');
    }

    const list = container.createDiv({ cls: 'pwm-list' });
    this.groupsListEl = list;
    const groups = this.getVisibleGroups();

    groups.forEach((group, index) => {
      const row = list.createDiv({ cls: 'pwm-list-item pwm-draggable-row pwm-group-row' });
      row.draggable = !this.isTrashMode() && this.plugin.data.view.groupSort === 'custom' && !this.keyword;
      row.dataset.groupId = group.id;
      if (this.selectedGroupIds.has(group.id)) {
        row.addClass('is-selected');
      }
      if (group.id === this.selectedGroupId) {
        row.addClass('is-active');
      }

      if (!this.isTrashMode()) {
        row.addEventListener('dragstart', () => {
          if (!this.selectedGroupIds.has(group.id)) {
            this.selectedGroupId = group.id;
            this.resetGroupSelection(group.id);
          }
          this.draggingGroupId = group.id;
        });
        row.addEventListener('dragend', () => {
          this.draggingGroupId = '';
        });
        row.addEventListener('dragover', (event) => {
          const canReorderGroups = this.plugin.data.view.groupSort === 'custom' && !this.keyword && !!this.draggingGroupId;
          const canReceiveItem = !!this.draggingItemId;
          if (!canReorderGroups && !canReceiveItem) {
            return;
          }
          event.preventDefault();
          row.addClass('is-drop-target');
        });
        row.addEventListener('dragleave', () => row.removeClass('is-drop-target'));
        row.addEventListener('drop', (event) => {
          void (async () => {
            event.preventDefault();
            row.removeClass('is-drop-target');

            if (this.draggingGroupId) {
              if (this.plugin.data.view.groupSort !== 'custom' || this.keyword) {
                return;
              }
              const draggedGroupIds = this.getDraggedGroupIds();
              if (!draggedGroupIds.length || draggedGroupIds.includes(group.id)) {
                return;
              }
              const allowed = await this.ensureWriteAccess();
              if (!allowed) {
                return;
              }
              this.plugin.moveGroups(draggedGroupIds, index);
              await this.plugin.savePluginData();
              this.render();
              return;
            }

            if (!this.draggingItemId) {
              return;
            }

            this.updateItemDragMode(event.ctrlKey ? 'add' : 'move', event.dataTransfer ?? undefined);
            const mode = this.dragGroupMode;
            const draggedItemIds = this.getDraggedItemIds();
            const previousGroupId = this.selectedGroupId;
            const allowed = await this.ensureWriteAccess();
            if (!allowed) {
              return;
            }
            let changed = false;
            for (const itemId of draggedItemIds) {
              changed = this.plugin.assignItemToGroup(itemId, group.id, mode) || changed;
            }
            if (!changed) {
              return;
            }

            const nextSelectedGroupId = this.getResolvedSelectedGroupId(previousGroupId);
            this.selectedGroupId = nextSelectedGroupId;
            this.resetGroupSelection(nextSelectedGroupId);
            this.selectedItemId = this.getPreferredSelectedItemId(nextSelectedGroupId);
            this.resetItemSelection(this.selectedItemId);
            await this.plugin.savePluginData();
            this.render();
          })();
        });
      }

      const meta = row.createDiv({ cls: 'pwm-item-meta' });
      if (!this.isTrashMode() && this.editingGroupId === group.id) {
        const input = meta.createEl('input', {
          type: 'text',
          value: group.name,
          cls: 'pwm-rename-input',
        });
        const finishEdit = async () => {
          const allowed = await this.ensureWriteAccess();
          if (!allowed) {
            return;
          }
          const error = this.plugin.updateGroupName(group.id, input.value);
          if (error) {
            new Notice(error);
            input.focus();
            input.select();
            return;
          }

          this.editingGroupId = '';
          await this.plugin.savePluginData();
          this.render();
        };
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void finishEdit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            this.editingGroupId = '';
            this.render();
          }
        });
        input.addEventListener('blur', () => {
          void finishEdit();
        });
        window.setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      } else {
        const name = meta.createDiv({ text: group.name, cls: 'pwm-group-name' });
        if (!this.isTrashMode()) {
          name.setAttr('title', PWM_TEXT.EDIT_GROUP_NAME);
          name.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            this.editingGroupId = group.id;
            this.render();
          });
        }
      }

      const badge = row.createDiv({ cls: 'pwm-badge' });
      badge.setText(String(this.getModeItemsByGroup(group.id).length));

      row.addEventListener('click', (event) => {
        void this.handleGroupSelection(group.id, event, groups);
      });
    });

    if (this.isTrashMode()) {
      return;
    }

    const footer = container.createDiv({ cls: 'pwm-footer-actions' });
    this.plugin.createIconButton(footer, 'folder-down', PWM_TEXT.IMPORT_GROUP, async () => {
      await this.handleImport(async (text) => {
        const group = this.plugin.importGroupFromText(text);
        this.selectedGroupId = group.id;
        this.selectedItemId = this.getPreferredSelectedItemId(group.id);
        this.resetGroupSelection(group.id);
        this.resetItemSelection(this.selectedItemId);
      }, 'application/json,text/markdown,.json,.md');
    });
    const exportGroupButton = this.plugin.createIconButton(footer, 'folder-up', PWM_TEXT.EXPORT_GROUP, () => { });
    exportGroupButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const groupIds = this.getSelectedGroupIdsForAction();
      if (!groupIds.length) {
        return;
      }

      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle(PWM_TEXT.EXPORT_FORMAT_JSON);
        item.onClick(() => {
          void this.plugin.exportGroups(groupIds, 'json');
        });
      });
      menu.addItem((item) => {
        item.setTitle(PWM_TEXT.EXPORT_FORMAT_MARKDOWN);
        item.onClick(() => {
          void this.plugin.exportGroups(groupIds, 'markdown');
        });
      });
      menu.showAtMouseEvent(event);
    });
  }

  private renderItems(container: HTMLElement) {
    container.empty();

    const header = container.createDiv({ cls: 'pwm-header' });
    header.createEl('h3', { text: PWM_TEXT.ITEMS });

    const actions = header.createDiv({ cls: 'pwm-actions' });
    if (!this.isTrashMode()) {
      this.plugin.createIconButton(actions, 'plus', PWM_TEXT.ADD_ITEM, async () => {
        if (!this.selectedGroupId) {
          new Notice(PWM_TEXT.SELECT_GROUP_FIRST);
          return;
        }
        const allowed = await this.ensureWriteAccess();
        if (!allowed) {
          return;
        }
        const item = this.plugin.createItem(this.selectedGroupId);
        this.selectedItemId = item.id;
        this.resetItemSelection(item.id);
        await this.plugin.savePluginData();
        this.render();
      });
    }
    const itemSortOptions = this.isTrashMode() ? TRASH_ITEM_SORT_OPTIONS : ITEM_SORT_OPTIONS;
    this.createSortMenuButton(actions, this.plugin.data.view.itemSort, PWM_TEXT.SORT_ITEMS, itemSortOptions, async (value) => {
      this.plugin.setItemSort(value);
      await this.plugin.savePluginData();
      this.reconcileSelectionState();
      this.render();
    });
    this.createDisplayMenuButton(actions);
    if (this.isTrashMode()) {
      const restoreButton = this.plugin.createIconButton(actions, 'rotate-ccw', PWM_TEXT.RESTORE_ITEM, async () => {
        await this.restoreSelectedItems();
      });
      restoreButton.addClass('pwm-button-success');
    }
    const deleteItemButton = this.plugin.createIconButton(actions, 'trash', PWM_TEXT.DELETE_ITEM, async () => {
      await this.deleteSelectedItems();
    });
    if (this.isTrashMode()) {
      deleteItemButton.addClass('pwm-button-warning');
    }

    const list = container.createDiv({ cls: 'pwm-list' });
    this.itemsListEl = list;
    const items = this.getVisibleItems(this.selectedGroupId);

    if (!this.selectedGroupId) {
      list.createDiv({ text: this.keyword ? PWM_TEXT.NO_SEARCH_RESULTS : PWM_TEXT.SELECT_GROUP_FIRST, cls: 'pwm-empty' });
    } else if (!items.length) {
      list.createDiv({ text: this.keyword ? PWM_TEXT.NO_SEARCH_RESULTS : PWM_TEXT.NO_ITEMS_IN_GROUP, cls: 'pwm-empty' });
    } else {
      items.forEach((item, index) => {
        const row = list.createDiv({ cls: 'pwm-list-item pwm-item-row pwm-draggable-row' });
        row.draggable = !this.isTrashMode() && !this.keyword;
        row.toggleClass('is-pinned', item.pinned);
        if (this.selectedItemIds.has(item.id)) {
          row.addClass('is-selected');
        }
        if (item.id === this.selectedItemId) {
          row.addClass('is-active');
        }

        if (!this.isTrashMode()) {
          row.addEventListener('dragstart', (event) => {
            if (!this.selectedItemIds.has(item.id)) {
              this.selectedGroupId = this.getPrimarySelectedGroupId(item) || this.selectedGroupId;
              this.resetItemSelection(item.id);
            }
            this.draggingItemId = item.id;
            this.updateItemDragMode(event.ctrlKey ? 'add' : 'move', event.dataTransfer ?? undefined);
          });
          row.addEventListener('dragend', () => {
            this.draggingItemId = '';
            this.updateItemDragMode('move');
          });
          row.addEventListener('dragover', (event) => {
            if (this.plugin.data.view.itemSort !== 'custom' || this.keyword || !this.draggingItemId) {
              return;
            }
            this.updateItemDragMode(event.ctrlKey ? 'add' : 'move', event.dataTransfer ?? undefined);
            event.preventDefault();
            row.addClass('is-drop-target');
          });
          row.addEventListener('dragleave', () => row.removeClass('is-drop-target'));
          row.addEventListener('drop', (event) => {
            void (async () => {
              if (this.plugin.data.view.itemSort !== 'custom' || this.keyword) {
                return;
              }
              this.updateItemDragMode(event.ctrlKey ? 'add' : 'move', event.dataTransfer ?? undefined);
              event.preventDefault();
              row.removeClass('is-drop-target');
              if (!this.draggingItemId) {
                return;
              }
              const draggedItemIds = this.getDraggedItemIds();
              if (!draggedItemIds.length || draggedItemIds.includes(item.id)) {
                return;
              }
              const allowed = await this.ensureWriteAccess();
              if (!allowed) {
                return;
              }
              this.plugin.moveItemsWithinGroup(draggedItemIds, index, this.selectedGroupId);
              this.selectedItemIds = new Set(draggedItemIds);
              this.selectedItemId = this.getPreferredSelectedItemId(this.selectedGroupId, this.draggingItemId);
              if (this.selectedItemId) {
                this.selectedItemIds.add(this.selectedItemId);
              }
              this.itemSelectionAnchorId = this.selectedItemId;
              await this.plugin.savePluginData();
              this.render();
            })();
          });
        }

        if (!this.isTrashMode()) {
          const pinActions = row.createDiv({ cls: 'pwm-item-row-actions pwm-item-row-actions-top' });
          this.plugin.createIconButton(pinActions, 'pin', item.pinned ? PWM_TEXT.UNPIN_ITEM : PWM_TEXT.PIN_ITEM, async () => {
            const allowed = await this.ensureWriteAccess();
            if (!allowed) {
              return;
            }
            this.plugin.updateItem(item.id, { pinned: !item.pinned });
            await this.plugin.savePluginData();
            this.render();
          });
        }

        const body = row.createDiv({ cls: 'pwm-item-body' });
        const meta = body.createDiv({ cls: 'pwm-item-meta' });
        meta.createDiv({ text: item.title || PWM_TEXT.UNTITLED_ITEM, cls: 'pwm-item-title' });
        this.renderItemMeta(meta, item);

        if (!this.isTrashMode()) {
          const rowActions = row.createDiv({ cls: 'pwm-item-row-actions pwm-item-row-actions-bottom' });
          this.plugin.createIconButton(rowActions, 'copy-plus', PWM_TEXT.COPY_ITEM, async () => {
            const allowed = await this.ensureWriteAccess();
            if (!allowed) {
              return;
            }
            const copiedItem = this.plugin.duplicateItem(item.id);
            if (!copiedItem) {
              return;
            }
            this.selectedItemId = copiedItem.id;
            this.resetItemSelection(copiedItem.id);
            await this.plugin.savePluginData();
            new Notice(PWM_TEXT.COPIED_ITEM);
            this.render();
          });
        }

        row.addEventListener('click', (event) => {
          void this.handleItemSelection(item.id, event, items);
        });
      });
    }

    if (this.isTrashMode()) {
      return;
    }

    const footer = container.createDiv({ cls: 'pwm-footer-actions' });
    this.plugin.createIconButton(footer, 'file-down', PWM_TEXT.IMPORT_ITEMS, async () => {
      await this.handleImport(async (text) => {
        const targetGroupId = this.isTrashMode()
          ? (this.plugin.data.groups[0]?.id ?? '')
          : this.selectedGroupId;
        if (!targetGroupId) {
          return;
        }
        const importedItems = this.plugin.importItemsFromText(text, targetGroupId);
        const firstImportedItem = importedItems[0];
        if (!firstImportedItem) {
          return;
        }
        if (!this.isTrashMode()) {
          this.selectedItemId = firstImportedItem.id;
          this.resetItemSelection(firstImportedItem.id);
        }
      }, 'application/json,text/markdown,.json,.md');
    });
    const exportSelectedItemsButton = this.plugin.createIconButton(footer, 'file-up', PWM_TEXT.EXPORT_SELECTED_ITEMS, () => undefined);
    exportSelectedItemsButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const itemIds = this.getSelectedItemIdsForAction();
      if (!itemIds.length) {
        return;
      }

      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle(PWM_TEXT.EXPORT_FORMAT_JSON);
        item.onClick(() => {
          void this.plugin.exportItems(itemIds, 'json');
        });
      });
      menu.addItem((item) => {
        item.setTitle(PWM_TEXT.EXPORT_FORMAT_MARKDOWN);
        item.onClick(() => {
          void this.plugin.exportItems(itemIds, 'markdown');
        });
      });
      menu.showAtMouseEvent(event);
    });
  }

  private renderDetails(container: HTMLElement) {
    container.empty();

    const header = container.createDiv({ cls: 'pwm-header' });
    header.createEl('h3', { text: PWM_TEXT.DETAILS });
    const actions = header.createDiv({ cls: 'pwm-actions' });
    this.plugin.createIconButton(actions, 'copy', PWM_TEXT.COPY_PASSWORD_INFO, async () => {
      if (!this.selectedItemId) {
        return;
      }
      await this.plugin.copyItemAsConfiguredFormat(this.selectedItemId);
    });
    this.plugin.createIconButton(actions, 'trash', PWM_TEXT.DELETE_ITEM_FROM_DETAILS, async () => {
      await this.deleteSelectedItems();
    });
    if (!this.isTrashMode()) {
      this.plugin.createIconButton(actions, 'save', PWM_TEXT.SAVE_PASSWORD_INFO, async () => {
        await this.saveSelectedItemDetails();
      });
    }

    const body = container.createDiv({ cls: 'pwm-details-body' });
    this.detailsBodyEl = body;
    const detail = body.createDiv({ cls: 'pwm-detail' });
    const item = this.getCurrentItem(this.selectedItemId);
    if (!item) {
      this.detailsDraftItemId = '';
      this.detailInputs = {};
      detail.createDiv({ text: PWM_TEXT.NO_ITEM, cls: 'pwm-empty' });
      this.renderDetailsBottomToolbar(body);
      return;
    }

    this.ensureDetailsDraft(item);
    this.detailInputs = {};
    this.detailUrlInputs = [];

    const titleInput = this.createTextField(detail, PWM_TEXT.TITLE, this.detailsDraft.title, [], { leadingIcon: 'text-cursor-input' });
    titleInput.disabled = this.isTrashMode();
    this.detailInputs.title = titleInput;
    titleInput.addEventListener('input', () => {
      this.detailsDraft.title = titleInput.value;
    });

    const usernameInput = this.createTextField(
      detail,
      PWM_TEXT.USERNAME,
      this.detailsDraft.username,
      [
        {
          icon: 'copy',
          label: PWM_TEXT.COPY_USERNAME,
          onClick: async (input) => {
            await navigator.clipboard.writeText(input.value);
            new Notice(PWM_TEXT.COPIED_USERNAME);
          },
        },
      ],
      { leadingIcon: 'user-round' },
    );
    usernameInput.disabled = this.isTrashMode();
    this.detailInputs.username = usernameInput;
    usernameInput.addEventListener('input', () => {
      this.detailsDraft.username = usernameInput.value;
    });

    const passwordInput = this.createPasswordField(detail, this.detailsDraft.password);
    passwordInput.disabled = this.isTrashMode();
    this.detailInputs.password = passwordInput;
    passwordInput.addEventListener('input', () => {
      this.detailsDraft.password = passwordInput.value;
    });

    this.renderUrlFields(detail);

    const notesTextarea = this.createTextareaField(
      detail,
      PWM_TEXT.NOTES,
      this.detailsDraft.notes,
      [
        {
          icon: 'copy',
          label: PWM_TEXT.COPY_NOTES,
          onClick: async (textarea) => {
            await navigator.clipboard.writeText(textarea.value);
            new Notice(PWM_TEXT.COPIED_NOTES);
          },
        },
      ],
    );
    notesTextarea.disabled = this.isTrashMode();
    this.detailInputs.notes = notesTextarea;
    notesTextarea.addEventListener('input', () => {
      this.detailsDraft.notes = notesTextarea.value;
    });

    this.renderTagsFooter(detail, item);
    this.renderDetailsBottomToolbar(body);
  }

  private renderUrlFields(container: HTMLElement) {
    const field = container.createDiv({ cls: 'pwm-field' });
    const header = field.createDiv({ cls: 'pwm-field-header' });
    header.createEl('label', { text: PWM_TEXT.URL });

    if (!this.isTrashMode()) {
      this.plugin.createIconButton(header, 'plus', PWM_TEXT.ADD_LINK, () => {
        this.detailsDraft.urls = [...this.getNormalizedDraftUrls(), ''];
        this.render();
      });
    }

    const list = field.createDiv({ cls: 'pwm-url-list' });
    const urls = this.detailsDraft.urls.length ? this.detailsDraft.urls : [''];

    urls.forEach((value, index) => {
      const input = this.createUrlFieldRow(list, value, index);
      this.detailUrlInputs.push(input);
    });

    if (!urls.some((value) => value.trim())) {
      list.createDiv({ cls: 'pwm-url-empty', text: PWM_TEXT.EMPTY_LINKS });
    }
  }

  private createUrlFieldRow(container: HTMLElement, value: string, index: number) {
    const row = container.createDiv({ cls: 'pwm-input-row pwm-url-row has-leading-icon has-floating-actions' });
    const prefix = row.createDiv({ cls: 'pwm-input-prefix' });
    setIcon(prefix, 'link');

    const input = row.createEl('input', { type: 'text', value });
    input.disabled = this.isTrashMode();
    this.bindDetailFocus(input);
    input.addEventListener('input', () => {
      const nextUrls = [...this.detailsDraft.urls];
      nextUrls[index] = input.value;
      this.detailsDraft.urls = nextUrls;
    });

    const actions = row.createDiv({ cls: 'pwm-inline-actions pwm-floating-actions' });
    this.plugin.createIconButton(actions, 'external-link', PWM_TEXT.OPEN_URL, () => {
      if (!input.value.trim()) {
        new Notice(PWM_TEXT.NO_OPEN_URL);
        return;
      }
      window.open(input.value, '_blank');
    });
    this.plugin.createIconButton(actions, 'copy', PWM_TEXT.COPY_URL, async () => {
      await navigator.clipboard.writeText(input.value);
      new Notice(PWM_TEXT.COPIED_URL);
    });

    if (!this.isTrashMode()) {
      this.plugin.createIconButton(actions, 'trash', PWM_TEXT.REMOVE_LINK, () => {
        const nextUrls = this.detailsDraft.urls.filter((_, currentIndex) => currentIndex !== index);
        this.detailsDraft.urls = nextUrls.length ? nextUrls : [''];
        this.render();
      });
    }

    return input;
  }

  private getNormalizedDraftUrls() {
    return this.detailsDraft.urls.map((url) => url.trim()).filter(Boolean);
  }

  private renderTagsFooter(container: HTMLElement, item: PasswordItem) {
    const footer = container.createDiv({ cls: 'pwm-footer-actions pwm-tags-footer' });
    const header = footer.createDiv({ cls: 'pwm-tags-header' });
    header.createDiv({ cls: 'pwm-tags-label', text: PWM_TEXT.TAGS });

    if (!this.isTrashMode()) {
      const addTagButton = this.plugin.createIconButton(header, 'plus', PWM_TEXT.ADD_TAG, () => undefined);
      addTagButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const availableGroups = this.plugin.data.groups.filter((group) => !item.groupIds.includes(group.id));
        if (!availableGroups.length) {
          return;
        }

        const menu = new Menu();
        availableGroups.forEach((group) => {
          menu.addItem((menuItem) => {
            menuItem.setTitle(group.name);
            menuItem.onClick(() => {
              void (async () => {
                const changed = this.plugin.assignItemToGroup(item.id, group.id, 'add');
                if (!changed) {
                  return;
                }
                await this.plugin.savePluginData();
                this.render();
              })();
            });
          });
        });
        menu.showAtMouseEvent(event);
      });
    }

    const tags = footer.createDiv({ cls: 'pwm-tag-list' });
    const itemGroups = this.getItemGroups(item);

    if (itemGroups.length) {
      itemGroups.forEach((group) => {
        const tagEl = tags.createEl('a', { cls: 'tag pwm-group-tag' });
        tagEl.setText(group.name);
        tagEl.addEventListener('click', (event) => event.preventDefault());

        if (this.isTrashMode()) {
          return;
        }

        const removeButton = tagEl.createEl('button', {
          cls: 'pwm-tag-remove',
          attr: { type: 'button', 'aria-label': `${PWM_TEXT.REMOVE_TAG}: ${group.name}` },
          text: '×',
        });
        removeButton.addEventListener('click', (event) => {
          event.stopPropagation();
          void (async () => {
            const removed = this.plugin.removeItemFromGroup(item.id, group.id);
            if (!removed) {
              return;
            }
            this.reconcileSelectionState();
            await this.plugin.savePluginData();
            this.render();
          })();
        });
      });
    } else {
      tags.createDiv({ cls: 'pwm-empty pwm-tags-empty', text: PWM_TEXT.NO_TAGS });
    }
  }

  private renderDetailsBottomToolbar(container: HTMLElement) {
    const footer = container.createDiv({ cls: 'pwm-footer-actions pwm-details-bottom-toolbar' });
    footer.createDiv({ cls: 'pwm-footer-spacer' });

    const ratioLockButton = this.plugin.createIconButton(
      footer,
      this.plugin.pluginConfig.columnRatioLocked ? 'lock' : 'unlock',
      this.plugin.pluginConfig.columnRatioLocked ? PWM_TEXT.COLUMN_RATIO_UNLOCK : PWM_TEXT.COLUMN_RATIO_LOCK,
      async () => {
        this.plugin.updatePluginConfig({ columnRatioLocked: !this.plugin.pluginConfig.columnRatioLocked });
        await this.plugin.savePluginConfig();
        if (this.rootEl) {
          this.applyLayoutWidths(this.rootEl);
        }
        this.render();
      },
    );
    ratioLockButton.toggleClass('pwm-button-success', !this.plugin.pluginConfig.columnRatioLocked);

    const modeToggleButton = this.plugin.createIconButton(
      footer,
      this.isTrashMode() ? 'arrow-left' : 'trash-2',
      this.isTrashMode() ? PWM_TEXT.SWITCH_MANAGER : PWM_TEXT.OPEN_TRASH,
      () => {
        this.toggleMode();
      },
    );
    modeToggleButton.addClass(this.isTrashMode() ? 'pwm-button-success' : 'pwm-button-warning');
    this.plugin.createIconButton(footer, 'settings', PWM_TEXT.OPEN_PLUGIN_SETTINGS, () => {
      this.plugin.openSettings();
    });
  }

  private renderItemMeta(container: HTMLElement, item: PasswordItem) {
    const primaryUrl = item.urls[0] ?? '';
    if (this.plugin.data.settings.showItemUsername) {
      container.createDiv({ text: `${PWM_TEXT.USERNAME}：${item.username}`, cls: 'pwm-item-subtitle' });
    }
    if (this.plugin.data.settings.showItemUrl) {
      container.createDiv({ text: `${PWM_TEXT.URL}：${primaryUrl}`, cls: 'pwm-item-subtitle' });
    }
    if (this.plugin.data.settings.showItemNotes) {
      container.createDiv({ text: `${PWM_TEXT.NOTES}：${item.notes}`, cls: 'pwm-item-subtitle' });
    }
    if (this.plugin.data.settings.showItemGroupTags) {
      const groups = this.getItemGroups(item);
      if (groups.length) {
        const tagRow = container.createDiv({ cls: 'pwm-item-subtitle pwm-item-tags-row' });
        tagRow.createSpan({ text: `${PWM_TEXT.TAGS}：` });
        const tagList = tagRow.createDiv({ cls: 'pwm-item-tags' });
        groups.forEach((group) => {
          const tag = tagList.createEl('a', { cls: 'tag pwm-item-group-tag', href: '#' });
          tag.setText(group.name);
          tag.addEventListener('click', (event) => event.preventDefault());
        });
      }
    }
  }

  private createTextField(
    container: HTMLElement,
    label: string,
    value: string,
    actions: PwmFieldAction[] = [],
    options: PwmTextFieldOptions = {},
  ) {
    const field = container.createDiv({ cls: 'pwm-field' });
    field.createEl('label', { text: label });

    const row = field.createDiv({ cls: 'pwm-input-row' });
    if (options.leadingIcon) {
      row.addClass('has-leading-icon');
      const prefix = row.createDiv({ cls: 'pwm-input-prefix' });
      setIcon(prefix, options.leadingIcon);
    }
    if (actions.length) {
      row.addClass('has-floating-actions');
    }

    const input = row.createEl('input', { type: 'text', value });
    this.bindDetailFocus(input);

    if (actions.length) {
      const inlineActions = row.createDiv({ cls: 'pwm-inline-actions pwm-floating-actions' });
      actions.forEach((action) => {
        const button = this.plugin.createIconButton(inlineActions, action.icon, action.label, async () => {
          await action.onClick(input, button);
        });
      });
    }

    return input;
  }

  private createPasswordField(container: HTMLElement, value: string) {
    const field = container.createDiv({ cls: 'pwm-field' });
    field.createEl('label', { text: PWM_TEXT.PASSWORD });

    const row = field.createDiv({ cls: 'pwm-input-row has-leading-icon has-floating-actions' });
    const prefix = row.createDiv({ cls: 'pwm-input-prefix' });
    setIcon(prefix, 'key-round');

    const input = row.createEl('input', { type: 'password', value, cls: 'pwm-password-input' });
    this.bindDetailFocus(input);

    const actions = row.createDiv({ cls: 'pwm-inline-actions pwm-floating-actions' });
    const toggleButton = this.plugin.createIconButton(actions, 'eye', PWM_TEXT.SHOW_PASSWORD, () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      setIcon(toggleButton, isHidden ? 'eye-off' : 'eye');
      toggleButton.setAttr('aria-label', isHidden ? PWM_TEXT.HIDE_PASSWORD : PWM_TEXT.SHOW_PASSWORD);
    });
    this.plugin.createIconButton(actions, 'copy', PWM_TEXT.COPY_PASSWORD, async () => {
      await navigator.clipboard.writeText(input.value);
      new Notice(PWM_TEXT.COPIED_PASSWORD);
    });

    return input;
  }

  private createTextareaField(
    container: HTMLElement,
    label: string,
    value: string,
    actions: PwmFieldAction[] = [],
  ) {
    const field = container.createDiv({ cls: 'pwm-field' });
    field.createEl('label', { text: label });

    const row = field.createDiv({ cls: 'pwm-textarea-row' });
    if (actions.length) {
      row.addClass('has-floating-actions');
    }

    const textarea = row.createEl('textarea');
    textarea.value = value;
    this.bindDetailFocus(textarea);

    if (actions.length) {
      const inlineActions = row.createDiv({ cls: 'pwm-inline-actions pwm-floating-actions' });
      actions.forEach((action) => {
        const button = this.plugin.createIconButton(inlineActions, action.icon, action.label, async () => {
          await action.onClick(textarea, button);
        });
      });
    }

    return textarea;
  }

  private bindDetailFocus(input: HTMLInputElement | HTMLTextAreaElement) {
    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }
      if (!this.moveDetailFocus(input, event.shiftKey ? -1 : 1)) {
        return;
      }
      event.preventDefault();
    });
  }

  private getDetailFocusableInputs() {
    return [
      this.detailInputs.title,
      this.detailInputs.username,
      this.detailInputs.password,
      ...this.detailUrlInputs,
      this.detailInputs.notes,
    ].filter((input): input is HTMLInputElement | HTMLTextAreaElement => !!input && !input.disabled);
  }

  private moveDetailFocus(currentInput: HTMLInputElement | HTMLTextAreaElement, direction: 1 | -1) {
    const inputs = this.getDetailFocusableInputs();
    if (inputs.length <= 1) {
      return false;
    }

    const currentIndex = inputs.indexOf(currentInput);
    if (currentIndex === -1) {
      return false;
    }

    const nextIndex = (currentIndex + direction + inputs.length) % inputs.length;
    const nextInput = inputs[nextIndex];
    if (!nextInput) {
      return false;
    }
    nextInput.focus();
    if ('select' in nextInput && nextInput instanceof HTMLInputElement) {
      nextInput.select();
    } else {
      const cursor = nextInput.value.length;
      nextInput.setSelectionRange?.(cursor, cursor);
    }
    return true;
  }

  private syncDetailsDraftFromInputs() {
    this.detailsDraft.title = this.detailInputs.title?.value ?? this.detailsDraft.title;
    this.detailsDraft.username = this.detailInputs.username?.value ?? this.detailsDraft.username;
    this.detailsDraft.password = this.detailInputs.password?.value ?? this.detailsDraft.password;
    this.detailsDraft.urls = this.detailUrlInputs.map((input) => input.value);
    this.detailsDraft.notes = this.detailInputs.notes?.value ?? this.detailsDraft.notes;
  }

  private async flushSelectedItemDetailsBeforeNavigate() {
    if (this.isTrashMode()) {
      return true;
    }
    this.syncDetailsDraftFromInputs();
    return this.saveSelectedItemDetails({ silent: true });
  }

  private ensureDetailsDraft(item: PasswordItem | DeletedPasswordItem) {
    if (this.detailsDraftItemId === item.id) {
      return;
    }

    this.detailsDraftItemId = item.id;
    this.detailsDraft = {
      title: item.title,
      username: item.username,
      password: item.password,
      urls: item.urls.length ? [...item.urls] : [''],
      notes: item.notes,
    };
  }

  private async saveSelectedItemDetails(options?: { silent?: boolean }) {
    if (this.isTrashMode()) {
      return true;
    }

    const item = this.plugin.getItem(this.selectedItemId);
    if (!item || this.isSavingDetails) {
      return true;
    }

    const normalizedUrls = this.getNormalizedDraftUrls();
    const hasChanged = item.title !== this.detailsDraft.title
      || item.username !== this.detailsDraft.username
      || item.password !== this.detailsDraft.password
      || item.notes !== this.detailsDraft.notes
      || item.urls.length !== normalizedUrls.length
      || item.urls.some((url, index) => url !== normalizedUrls[index]);
    if (!hasChanged) {
      return true;
    }

    this.isSavingDetails = true;
    try {
      const error = this.plugin.updateItemTitle(item.id, this.detailsDraft.title);
      if (error) {
        if (!options?.silent) {
          new Notice(error);
        }
        this.detailInputs.title?.focus();
        this.detailInputs.title?.select();
        return false;
      }
      this.plugin.updateItem(item.id, {
        username: this.detailsDraft.username,
        password: this.detailsDraft.password,
        urls: normalizedUrls,
        notes: this.detailsDraft.notes,
      });
      await this.plugin.savePluginData();
      if (!options?.silent) {
        new Notice(PWM_TEXT.SAVED_PASSWORD_INFO);
      }
      this.render();
      return true;
    } finally {
      this.isSavingDetails = false;
    }
  }

  private createSortMenuButton(
    container: HTMLElement,
    current: PwmSortMode,
    label: string,
    options: Array<{ value: PwmSortMode; label: string }>,
    onChange: (value: PwmSortMode) => Promise<void>,
  ) {
    const currentOption = options.find((option) => option.value === current) ?? options[0];
    if (!currentOption) {
      return;
    }
    const button = this.plugin.createIconButton(container, SORT_MENU_ICON, `${label}: ${currentOption.label}`, () => { });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const menu = new Menu();
      options.forEach((option) => {
        menu.addItem((item) => {
          item.setTitle(option.label);
          item.setChecked(option.value === current);
          item.onClick(async () => {
            if (option.value === current) {
              return;
            }
            await onChange(option.value);
          });
        });
      });

      menu.showAtMouseEvent(event);
    });
  }

  private createDisplayMenuButton(container: HTMLElement) {
    const button = this.plugin.createIconButton(container, 'info', PWM_TEXT.ITEM_DISPLAY_SETTING, () => { });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const menu = new Menu();
      const settings = this.plugin.data.settings;
      const actions: Array<{ key: 'showItemUsername' | 'showItemUrl' | 'showItemGroupTags' | 'showItemNotes'; title: string }> = [
        { key: 'showItemUsername', title: PWM_TEXT.ITEM_DISPLAY_USERNAME },
        { key: 'showItemUrl', title: PWM_TEXT.ITEM_DISPLAY_URL },
        { key: 'showItemGroupTags', title: PWM_TEXT.ITEM_DISPLAY_GROUP_TAGS },
        { key: 'showItemNotes', title: PWM_TEXT.ITEM_DISPLAY_NOTES },
      ];

      actions.forEach(({ key, title }) => {
        menu.addItem((item) => {
          item.setTitle(title);
          item.setChecked(settings[key]);
          item.onClick(async () => {
            this.plugin.updateSettings({ [key]: !settings[key] });
            await this.plugin.savePluginData();
            this.render();
          });
        });
      });

      menu.showAtMouseEvent(event);
    });
  }

  private async handleGroupSelection(groupId: string, event: MouseEvent, groups: PasswordGroup[]) {
    const saved = await this.flushSelectedItemDetailsBeforeNavigate();
    if (!saved) {
      return;
    }

    if (event.shiftKey && this.groupSelectionAnchorId) {
      const rangeIds = this.getRangeSelectionIds(groups, this.groupSelectionAnchorId, groupId);
      if (rangeIds.length) {
        this.selectedGroupIds = new Set(rangeIds);
      }
      this.selectedGroupId = groupId;
      this.selectedItemId = this.getPreferredSelectedItemId(groupId);
      this.resetItemSelection(this.selectedItemId);
      void this.persistViewState();
      this.preserveScrollForNextRender();
      this.render();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (this.selectedGroupIds.has(groupId)) {
        this.selectedGroupIds.delete(groupId);
        if (!this.selectedGroupIds.size) {
          this.selectedGroupIds.add(groupId);
        }
      } else {
        this.selectedGroupIds.add(groupId);
      }
      this.selectedGroupId = groupId;
      this.groupSelectionAnchorId = groupId;
      this.selectedItemId = this.getPreferredSelectedItemId(groupId);
      this.resetItemSelection(this.selectedItemId);
      void this.persistViewState();
      this.preserveScrollForNextRender();
      this.render();
      return;
    }

    this.selectedGroupId = groupId;
    this.selectedItemId = this.getPreferredSelectedItemId(groupId);
    this.resetGroupSelection(groupId);
    this.resetItemSelection(this.selectedItemId);
    void this.persistViewState();
    this.preserveScrollForNextRender();
    this.render();
  }

  private async handleItemSelection(itemId: string, event: MouseEvent, items: Array<PasswordItem | DeletedPasswordItem>) {
    const saved = await this.flushSelectedItemDetailsBeforeNavigate();
    if (!saved) {
      return;
    }

    if (event.shiftKey && this.itemSelectionAnchorId) {
      const rangeIds = this.getRangeSelectionIds(items, this.itemSelectionAnchorId, itemId);
      if (rangeIds.length) {
        this.selectedItemIds = new Set(rangeIds);
      }
      this.selectedItemId = itemId;
      void this.persistViewState();
      this.preserveScrollForNextRender();
      this.render();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (this.selectedItemIds.has(itemId)) {
        this.selectedItemIds.delete(itemId);
        if (!this.selectedItemIds.size) {
          this.selectedItemIds.add(itemId);
        }
      } else {
        this.selectedItemIds.add(itemId);
      }
      this.selectedItemId = itemId;
      this.itemSelectionAnchorId = itemId;
      void this.persistViewState();
      this.preserveScrollForNextRender();
      this.render();
      return;
    }

    this.selectedItemId = itemId;
    this.resetItemSelection(itemId);
    void this.persistViewState();
    this.preserveScrollForNextRender();
    this.render();
  }

  private resetGroupSelection(groupId: string) {
    this.selectedGroupIds = groupId ? new Set([groupId]) : new Set<string>();
    this.groupSelectionAnchorId = groupId;
  }

  private resetItemSelection(itemId: string) {
    this.selectedItemIds = itemId ? new Set([itemId]) : new Set<string>();
    this.itemSelectionAnchorId = itemId;
  }

  private reconcileSelectionState() {
    const visibleGroups = this.getVisibleGroups();
    const visibleGroupIds = new Set(visibleGroups.map((group) => group.id));
    this.selectedGroupIds = new Set([...this.selectedGroupIds].filter((groupId) => visibleGroupIds.has(groupId)));
    if (!this.selectedGroupIds.size && visibleGroups.length) {
      const fallbackGroup = this.selectedGroupId && visibleGroupIds.has(this.selectedGroupId)
        ? this.selectedGroupId
        : (visibleGroups[0]?.id ?? '');
      if (fallbackGroup) {
        this.selectedGroupIds.add(fallbackGroup);
      }
    }

    this.selectedGroupId = this.getResolvedSelectedGroupId([...this.selectedGroupIds][0]);
    if (this.selectedGroupId && !this.selectedGroupIds.has(this.selectedGroupId)) {
      this.selectedGroupIds.add(this.selectedGroupId);
    }
    if (!this.selectedGroupId) {
      this.selectedGroupIds.clear();
    }
    if (!this.groupSelectionAnchorId || !visibleGroupIds.has(this.groupSelectionAnchorId)) {
      this.groupSelectionAnchorId = this.selectedGroupId;
    }

    const visibleItems = this.getVisibleItems(this.selectedGroupId);
    const visibleItemIds = new Set(visibleItems.map((item) => item.id));
    this.selectedItemIds = new Set([...this.selectedItemIds].filter((itemId) => visibleItemIds.has(itemId)));
    const firstSelectedItemId = [...this.selectedItemIds][0] ?? '';
    this.selectedItemId = this.getPreferredSelectedItemId(this.selectedGroupId, firstSelectedItemId);
    if (this.selectedItemId) {
      this.selectedItemIds.add(this.selectedItemId);
    } else {
      this.selectedItemIds.clear();
    }
    if (!this.itemSelectionAnchorId || !visibleItemIds.has(this.itemSelectionAnchorId)) {
      this.itemSelectionAnchorId = this.selectedItemId;
    }
  }

  private getRangeSelectionIds<T extends { id: string }>(items: T[], fromId: string, toId: string) {
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex === -1 || toIndex === -1) {
      return [toId];
    }
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    return items.slice(start, end + 1).map((item) => item.id);
  }

  private async deleteSelectedGroups() {
    const groupIds = this.getSelectedGroupIdsForAction();
    if (!groupIds.length) {
      return;
    }

    const deletedItemCount = this.getDeletedItemCountForGroups(groupIds);
    const deleteMessage = this.isTrashMode()
      ? formatPWMText(PWM_TEXT.DELETE_GROUP_PERMANENT_MESSAGE, { count: deletedItemCount })
      : formatPWMText(PWM_TEXT.DELETE_GROUP_TRASH_MESSAGE, { count: deletedItemCount });
    if (!(await this.confirmDelete(PWM_TEXT.CONFIRM_DELETE_GROUP_TITLE, deleteMessage))) {
      return;
    }

    if (!this.isTrashMode()) {
      const allowed = await this.ensureWriteAccess();
      if (!allowed) {
        return;
      }
    }

    let changed = false;
    this.editingGroupId = '';

    if (this.isTrashMode()) {
      for (const groupId of groupIds) {
        const itemIds = this.plugin.getTrashItemsByGroup(groupId).map((item) => item.id);
        for (const itemId of itemIds) {
          changed = this.plugin.deleteTrashItem(itemId) || changed;
        }
      }
    } else {
      changed = this.plugin.deleteGroups(groupIds);
    }

    if (!changed) {
      return;
    }

    this.reconcileSelectionState();
    await this.plugin.savePluginData();
    this.render();
  }

  private async deleteSelectedItems() {
    const itemIds = this.getSelectedItemIdsForAction();
    if (!itemIds.length) {
      return;
    }
    const deleteMessage = this.getDeleteItemsMessage(itemIds);
    if (!(await this.confirmDelete(PWM_TEXT.CONFIRM_DELETE_ITEM_TITLE, deleteMessage))) {
      return;
    }

    if (!this.isTrashMode()) {
      const allowed = await this.ensureWriteAccess();
      if (!allowed) {
        return;
      }
    }

    let changed = false;
    const currentGroupId = this.selectedGroupId;
    for (const itemId of itemIds) {
      if (this.isTrashMode()) {
        changed = this.plugin.deleteTrashItem(itemId) || changed;
      } else {
        const deleted = this.plugin.deleteItem(itemId);
        changed = changed || !!deleted;
      }
    }

    if (!changed) {
      return;
    }

    this.selectedGroupId = this.getResolvedSelectedGroupId(currentGroupId);
    this.reconcileSelectionState();
    await this.plugin.savePluginData();
    this.render();
  }

  private getDeleteItemsMessage(itemIds: string[]) {
    if (this.isTrashMode()) {
      return formatPWMText(PWM_TEXT.DELETE_ITEM_PERMANENT_MESSAGE, { count: itemIds.length });
    }

    const directDeleteCount = itemIds.filter((itemId) => this.plugin.shouldDeleteItemDirectlyById(itemId)).length;
    const trashCount = itemIds.length - directDeleteCount;

    if (directDeleteCount && trashCount) {
      return formatPWMText(PWM_TEXT.DELETE_ITEM_MIXED_MESSAGE, {
        directCount: directDeleteCount,
        trashCount,
      });
    }

    if (directDeleteCount) {
      return formatPWMText(PWM_TEXT.DELETE_ITEM_DIRECT_MESSAGE, { count: directDeleteCount });
    }

    return formatPWMText(PWM_TEXT.DELETE_ITEM_TRASH_MESSAGE, { count: trashCount });
  }

  private async restoreSelectedItems() {
    if (!this.isTrashMode()) {
      return;
    }

    const itemIds = this.getSelectedItemIdsForAction();
    if (!itemIds.length) {
      return;
    }

    let changed = false;
    const currentGroupId = this.selectedGroupId;
    for (const itemId of itemIds) {
      changed = this.plugin.restoreTrashItem(itemId) || changed;
    }

    if (!changed) {
      return;
    }

    this.selectedGroupId = this.getResolvedSelectedGroupId(currentGroupId);
    this.reconcileSelectionState();
    await this.plugin.savePluginData();
    this.render();
  }

  private getDeletedItemCountForGroups(groupIds: string[]) {
    const selectedGroupIds = new Set(groupIds);

    if (this.isTrashMode()) {
      return this.plugin.data.trash.filter((item) => selectedGroupIds.has(this.getTrashDateKey(item))).length;
    }

    let deletedItemCount = 0;

    this.plugin.data.items.forEach((item) => {
      if (!item.groupIds.some((groupId) => selectedGroupIds.has(groupId))) {
        return;
      }

      const remainingGroupIds = item.groupIds.filter((groupId) => !selectedGroupIds.has(groupId));
      if (!remainingGroupIds.length) {
        deletedItemCount += 1;
      }
    });

    return deletedItemCount;
  }

  private updateItemDragMode(mode: 'move' | 'add', dataTransfer?: DataTransfer) {
    this.dragGroupMode = mode;
    this.contentEl.toggleClass('is-item-drag-move', mode === 'move');
    this.contentEl.toggleClass('is-item-drag-add', mode === 'add');

    if (!dataTransfer) {
      return;
    }

    dataTransfer.effectAllowed = 'copyMove';
    dataTransfer.dropEffect = mode === 'add' ? 'copy' : 'move';
  }

  private getDraggedGroupIds() {
    if (!this.draggingGroupId) {
      return [];
    }
    if (this.selectedGroupIds.has(this.draggingGroupId)) {
      return [...this.selectedGroupIds];
    }
    return [this.draggingGroupId];
  }

  private getDraggedItemIds() {
    if (!this.draggingItemId) {
      return [];
    }
    if (this.selectedItemIds.has(this.draggingItemId)) {
      return [...this.selectedItemIds];
    }
    return [this.draggingItemId];
  }

  private getSelectedGroupIdsForAction() {
    if (this.selectedGroupIds.has(this.selectedGroupId)) {
      return [...this.selectedGroupIds];
    }
    return this.selectedGroupId ? [this.selectedGroupId] : [];
  }

  private getSelectedItemIdsForAction() {
    if (this.selectedItemIds.has(this.selectedItemId)) {
      return [...this.selectedItemIds];
    }
    return this.selectedItemId ? [this.selectedItemId] : [];
  }

  private async confirmDelete(title: string, message: string) {
    if (!this.plugin.data.settings.confirmBeforeDelete) {
      return true;
    }
    return new Promise<boolean>((resolve) => {
      new ConfirmModal(this.app, title, message, resolve).open();
    });
  }

  private handleImport(importer: (text: string) => Promise<void>, accept = 'application/json,.json'): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    return new Promise<void>((resolve, reject) => {
      input.addEventListener('change', () => {
        void (async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve();
            return;
          }

          try {
            const text = await file.text();
            await importer(text);
            await this.plugin.savePluginData();
            new Notice(PWM_TEXT.IMPORT_SUCCESS);
            this.render();
            resolve();
          } catch (error) {
            new Notice(PWM_TEXT.IMPORT_FAILED);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      }, { once: true });
      input.click();
    });
  }

  private getVisibleGroups(): PasswordGroup[] {
    const keyword = normalizeSearchKeyword(this.keyword);
    const groups = this.getModeGroups();
    if (!keyword) {
      return groups;
    }
    return groups.filter((group) => this.matchesGroupKeyword(group, keyword) || this.getVisibleItems(group.id).length > 0);
  }

  private getVisibleItems(groupId: string): Array<PasswordItem | DeletedPasswordItem> {
    const keyword = normalizeSearchKeyword(this.keyword);
    const items = this.prioritizePinnedItems(this.getModeItemsByGroup(groupId));

    if (!keyword) {
      return items;
    }

    const group = this.getModeGroups().find((currentGroup: PasswordGroup) => currentGroup.id === groupId);
    if (group && this.matchesGroupKeyword(group, keyword)) {
      return items;
    }

    return this.prioritizePinnedItems(items.filter((item) => this.matchesItemKeyword(item, keyword)));
  }

  private getVisibleItemTotalCount() {
    const itemIds = new Set<string>();
    this.getVisibleGroups().forEach((group) => {
      this.getVisibleItems(group.id).forEach((item) => {
        itemIds.add(item.id);
      });
    });
    return itemIds.size;
  }

  private prioritizePinnedItems(items: Array<PasswordItem | DeletedPasswordItem>) {
    return [...items].sort((left, right) => Number(right.pinned) - Number(left.pinned));
  }

  private matchesGroupKeyword(group: PasswordGroup, keyword: string) {
    return includesKeyword(group.name, keyword);
  }

  private matchesItemKeyword(item: PasswordItem | DeletedPasswordItem, keyword: string) {
    const groupNames = this.getItemGroups(item).map((group) => group.name);
    const trashDate = this.isTrashMode() && 'deletedAt' in item ? this.getTrashDateKey(item) : '';
    return [item.title, item.username, item.urls.join(' '), item.notes, ...groupNames, trashDate].some((value) => includesKeyword(value, keyword));
  }

  private getResolvedSelectedGroupId(preferredGroupId?: string) {
    const visibleGroups = this.getVisibleGroups();
    const nextGroupId = preferredGroupId || this.selectedGroupId;
    if (visibleGroups.some((group: PasswordGroup) => group.id === nextGroupId)) {
      return nextGroupId;
    }
    return visibleGroups[0]?.id ?? '';
  }

  private getPreferredSelectedItemId(groupId?: string, preferredItemId?: string) {
    const nextGroupId = groupId ?? this.getResolvedSelectedGroupId();
    const items = this.getVisibleItems(nextGroupId);
    const nextItemId = preferredItemId || this.selectedItemId;
    if (items.some((item) => item.id === nextItemId)) {
      return nextItemId;
    }
    return items[0]?.id ?? '';
  }

  private getPrimarySelectedGroupId(item: PasswordItem) {
    if (item.groupIds.includes(this.selectedGroupId)) {
      return this.selectedGroupId;
    }
    return item.groupIds[0] ?? '';
  }

  private getItemGroups(item: PasswordItem | DeletedPasswordItem) {
    const groups = new Map(this.plugin.data.groups.map((group) => [group.id, group]));
    const matchedGroups = item.groupIds
      .map((groupId) => groups.get(groupId))
      .filter((group): group is PasswordGroup => !!group);
    if (!('deletedAt' in item)) {
      return matchedGroups;
    }

    const missingCount = Math.max(0, item.groupIds.length - matchedGroups.length);
    const deletedGroupNames = (item.deletedGroupNames ?? []).slice(0, missingCount);
    return [
      ...matchedGroups,
      ...deletedGroupNames.map((name, index) => ({
        id: `deleted-group-${item.id}-${index}`,
        name,
        createdAt: item.deletedAt,
        order: Number.MAX_SAFE_INTEGER + index,
      })),
    ];
  }
}

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly onResolve: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText(this.title);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('pwm-confirm-modal');
    contentEl.createEl('p', { text: this.message });

    const actions = contentEl.createDiv({ cls: 'modal-button-container' });
    const cancelButton = actions.createEl('button', { text: PWM_TEXT.CANCEL });
    const confirmButton = actions.createEl('button', { text: PWM_TEXT.CONFIRM, cls: 'mod-cta' });

    cancelButton.addEventListener('click', () => {
      this.onResolve(false);
      this.close();
    });
    confirmButton.addEventListener('click', () => {
      this.onResolve(true);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
