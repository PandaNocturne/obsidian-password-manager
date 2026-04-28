import { formatPasswordItemAsMarkdown } from './markdown-item-format';
import type { PasswordCopyFormat, PasswordGroup, PasswordItem } from './types';

function getGroupNames(item: PasswordItem, groups: PasswordGroup[]) {
  const groupNameMap = new Map(groups.map((group) => [group.id, group.name]));
  return item.groupIds.map((groupId) => groupNameMap.get(groupId)).filter((name): name is string => !!name && !!name.trim());
}

export function formatPasswordItemForCopy(
  item: PasswordItem,
  groups: PasswordGroup[],
  format: PasswordCopyFormat,
  copyBlankFields: boolean,
) {
  void getGroupNames(item, groups);

  return formatPasswordItemAsMarkdown(item, {
    headingLevel: 3,
    format,
    exportBlankFields: copyBlankFields,
  });
}