import type { DeletedPasswordItem, PasswordGroup, PasswordItem, PwmSortMode } from './types';

export function sortGroups(groups: PasswordGroup[], items: PasswordItem[], mode: PwmSortMode) {
  const itemCountByGroupId = new Map<string, number>();
  items.forEach((item) => {
    item.groupIds.forEach((groupId) => {
      itemCountByGroupId.set(groupId, (itemCountByGroupId.get(groupId) ?? 0) + 1);
    });
  });

  return [...groups].sort((left, right) =>
    compareGroupBySortMode(
      left,
      right,
      itemCountByGroupId.get(left.id) ?? 0,
      itemCountByGroupId.get(right.id) ?? 0,
      mode,
    ),
  );
}

export function sortItems(items: PasswordItem[], mode: PwmSortMode) {
  return [...items].sort((left, right) =>
    comparePinned(left.pinned, right.pinned)
    || compareItemBySortMode(left, right, mode),
  );
}

export function sortDeletedItems(items: DeletedPasswordItem[], mode: PwmSortMode) {
  return [...items].sort((left, right) => compareItemBySortMode(left, right, mode));
}

function comparePinned(leftPinned: boolean, rightPinned: boolean) {
  return Number(rightPinned) - Number(leftPinned);
}

function compareGroupBySortMode(
  left: PasswordGroup,
  right: PasswordGroup,
  leftItemCount: number,
  rightItemCount: number,
  mode: PwmSortMode,
) {
  switch (mode) {
    case 'item-count-asc':
      return leftItemCount - rightItemCount
        || left.name.localeCompare(right.name, 'zh-Hans-CN')
        || left.order - right.order;
    case 'item-count-desc':
      return rightItemCount - leftItemCount
        || left.name.localeCompare(right.name, 'zh-Hans-CN')
        || left.order - right.order;
    default:
      return compareBySortMode(left.name, right.name, left.createdAt, right.createdAt, left.order, right.order, mode);
  }
}

function compareItemBySortMode(left: PasswordItem | DeletedPasswordItem, right: PasswordItem | DeletedPasswordItem, mode: PwmSortMode) {
  switch (mode) {
    case 'updated-asc':
      return left.updatedAt - right.updatedAt
        || left.title.localeCompare(right.title, 'zh-Hans-CN')
        || left.order - right.order;
    case 'updated-desc':
      return right.updatedAt - left.updatedAt
        || left.title.localeCompare(right.title, 'zh-Hans-CN')
        || left.order - right.order;
    case 'deleted-asc':
      return compareDeletedAt(left, right)
        || left.title.localeCompare(right.title, 'zh-Hans-CN')
        || left.order - right.order;
    case 'deleted-desc':
      return compareDeletedAt(right, left)
        || left.title.localeCompare(right.title, 'zh-Hans-CN')
        || left.order - right.order;
    default:
      return compareBySortMode(left.title, right.title, left.createdAt, right.createdAt, left.order, right.order, mode);
  }
}

function compareDeletedAt(left: PasswordItem | DeletedPasswordItem, right: PasswordItem | DeletedPasswordItem) {
  return ('deletedAt' in left ? left.deletedAt : 0) - ('deletedAt' in right ? right.deletedAt : 0);
}

export function compareBySortMode(
  leftName: string,
  rightName: string,
  leftCreatedAt: number,
  rightCreatedAt: number,
  leftOrder: number,
  rightOrder: number,
  mode: PwmSortMode,
) {
  switch (mode) {
    case 'name-asc':
      return leftName.localeCompare(rightName, 'zh-Hans-CN') || leftOrder - rightOrder;
    case 'name-desc':
      return rightName.localeCompare(leftName, 'zh-Hans-CN') || leftOrder - rightOrder;
    case 'created-asc':
      return leftCreatedAt - rightCreatedAt || leftOrder - rightOrder;
    case 'created-desc':
      return rightCreatedAt - leftCreatedAt || leftOrder - rightOrder;
    case 'custom':
    default:
      return leftOrder - rightOrder;
  }
}