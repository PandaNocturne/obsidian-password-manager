import { createId } from '../util/id';
import { PWM_TEXT, formatPWMText } from '../lang';
import { validateFileSafeName } from '../util/file-name';
import { getNextDuplicatedTitle } from '../util/duplicate-title';
import { normalizeGroupIds } from './normalize';
import type { PasswordGroup, PasswordItem, PasswordManagerData } from '../util/types';

function touchItem(item: PasswordItem) {
  item.updatedAt = Date.now();
}

export function createGroup(data: PasswordManagerData, name?: string) {
  const group: PasswordGroup = {
    id: createId(),
    name: name?.trim() || `${PWM_TEXT.GENERATED_NEW_GROUP_NAME} ${data.groups.length + 1}`,
    createdAt: Date.now(),
    order: data.groups.length,
  };

  data.groups.push(group);
  return group;
}

export function updateGroupName(data: PasswordManagerData, groupId: string, name: string) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) {
    return PWM_TEXT.GROUP_NOT_FOUND;
  }

  const validationError = validateFileSafeName(name);
  if (validationError) {
    return formatPWMText(PWM_TEXT.INVALID_GROUP_NAME_WITH_REASON, { reason: validationError });
  }

  const nextName = name.trim();
  if (nextName === group.name) {
    return null;
  }

  group.name = nextName;
  return null;
}

export function createItem(data: PasswordManagerData, groupId: string) {
  const now = Date.now();
  const item: PasswordItem = {
    id: createId(),
    groupIds: [groupId],
    title: PWM_TEXT.GENERATED_NEW_ITEM_TITLE,
    username: '',
    password: '',
    urls: [],
    notes: '',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    order: data.items.length,
  };

  data.items.push(item);
  return item;
}

export function duplicateItem(data: PasswordManagerData, itemId: string) {
  const source = data.items.find((item) => item.id === itemId);
  if (!source) {
    return null;
  }

  const now = Date.now();
  const item: PasswordItem = {
    ...structuredClone(source),
    id: createId(),
    title: getNextDuplicatedTitle(data.items, source.title),
    createdAt: now,
    updatedAt: now,
    order: data.items.length,
  };

  const sourceIndex = data.items.findIndex((entry) => entry.id === itemId);
  const nextItems = [...data.items];
  nextItems.splice(sourceIndex + 1, 0, item);
  data.items = nextItems;
  reindexOrders(data);
  return item;
}

export function updateItemTitle(data: PasswordManagerData, itemId: string, title: string) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item) {
    return PWM_TEXT.ITEM_NOT_FOUND;
  }

  const validationError = validateFileSafeName(title);
  if (validationError) {
    return formatPWMText(PWM_TEXT.INVALID_ITEM_TITLE_WITH_REASON, { reason: validationError });
  }

  const nextTitle = title.trim();
  if (nextTitle === item.title) {
    return null;
  }

  item.title = nextTitle;
  touchItem(item);
  return null;
}

export function updateItem(data: PasswordManagerData, itemId: string, patch: Partial<Omit<PasswordItem, 'id'>>) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const nextPatch = { ...patch };
  if ('groupIds' in nextPatch) {
    const fallbackGroupId = item.groupIds[0] ?? getFallbackGroupId(data) ?? data.groups[0]?.id ?? '';
    nextPatch.groupIds = normalizeGroupIds(
      nextPatch.groupIds,
      fallbackGroupId,
      data.groups.map((group) => group.id),
    );
  }

  const before = JSON.stringify(item);
  Object.assign(item, nextPatch);
  const after = JSON.stringify(item);
  if (before !== after) {
    touchItem(item);
  }
}

export function deleteGroup(data: PasswordManagerData, groupId: string) {
  data.items = data.items.filter((item) => {
    if (!item.groupIds.includes(groupId)) {
      return true;
    }

    const nextGroupIds = item.groupIds.filter((id) => id !== groupId);
    if (!nextGroupIds.length) {
      return false;
    }

    item.groupIds = nextGroupIds;
    touchItem(item);
    return true;
  });

  data.groups = data.groups.filter((group) => group.id !== groupId);
  reindexOrders(data);
  return true;
}

export function deleteItem(data: PasswordManagerData, itemId: string) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  data.items = data.items.filter((entry) => entry.id !== itemId);
  reindexOrders(data);
  return item;
}

export function moveGroup(data: PasswordManagerData, groupId: string, toIndex: number) {
  moveGroups(data, [groupId], toIndex);
}

export function moveGroups(data: PasswordManagerData, groupIds: string[], toIndex: number) {
  const groups = [...data.groups];
  const selectedIds = new Set(groupIds);
  const movingGroups = groups.filter((group) => selectedIds.has(group.id));
  if (!movingGroups.length) {
    return;
  }

  const remainingGroups = groups.filter((group) => !selectedIds.has(group.id));
  const boundedIndex = Math.max(0, Math.min(toIndex, remainingGroups.length));
  remainingGroups.splice(boundedIndex, 0, ...movingGroups);
  data.groups = remainingGroups;
  reindexOrders(data);
}

export function moveItemWithinGroup(data: PasswordManagerData, itemId: string, toIndex: number, groupId: string) {
  moveItemsWithinGroup(data, [itemId], toIndex, groupId);
}

export function moveItemsWithinGroup(data: PasswordManagerData, itemIds: string[], toIndex: number, groupId: string) {
  const visibleItems = data.items.filter((item) => item.groupIds.includes(groupId));
  const selectedIds = new Set(itemIds.filter((itemId) => visibleItems.some((item) => item.id === itemId)));
  const movingItems = visibleItems.filter((item) => selectedIds.has(item.id));
  if (!movingItems.length) {
    return;
  }

  const remainingVisibleItems = visibleItems.filter((item) => !selectedIds.has(item.id));
  const boundedIndex = Math.max(0, Math.min(toIndex, remainingVisibleItems.length));
  const reordered = [...remainingVisibleItems];
  reordered.splice(boundedIndex, 0, ...movingItems);

  const reorderedIds = reordered.map((item) => item.id);
  const nextItems = [...data.items];
  const visibleIndexSet = new Set(visibleItems.map((item) => item.id));
  let orderCursor = 0;

  for (let index = 0; index < nextItems.length; index += 1) {
    const currentItem = nextItems[index];
    if (!currentItem || !visibleIndexSet.has(currentItem.id)) {
      continue;
    }

    const reorderedId = reorderedIds[orderCursor];
    const reorderedItem = reordered.find((item) => item.id === reorderedId);
    if (reorderedItem) {
      nextItems[index] = reorderedItem;
    }
    orderCursor += 1;
  }

  data.items = nextItems;
  reindexOrders(data);
}

export function assignItemToGroup(data: PasswordManagerData, itemId: string, groupId: string, mode: 'move' | 'add') {
  const item = data.items.find((entry) => entry.id === itemId);
  const group = data.groups.find((entry) => entry.id === groupId);
  if (!item || !group) {
    return false;
  }

  if (mode === 'add') {
    if (item.groupIds.includes(groupId)) {
      return false;
    }
    item.groupIds = [...item.groupIds, groupId];
    touchItem(item);
    return true;
  }

  if (item.groupIds.length === 1 && item.groupIds[0] === groupId) {
    return false;
  }

  item.groupIds = [groupId];
  touchItem(item);
  return true;
}

export function removeItemFromGroup(data: PasswordManagerData, itemId: string, groupId: string) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item || !item.groupIds.includes(groupId)) {
    return false;
  }

  if (item.groupIds.length <= 1) {
    return false;
  }

  item.groupIds = item.groupIds.filter((id) => id !== groupId);
  touchItem(item);
  return true;
}

export function reindexOrders(data: PasswordManagerData) {
  data.groups.forEach((group, index) => {
    group.order = index;
  });
  data.items.forEach((item, index) => {
    item.order = index;
  });
}

export function getFallbackGroupId(data: PasswordManagerData) {
  return data.groups[0]?.id;
}