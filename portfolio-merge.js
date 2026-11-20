function mergeItems(base, local, remote, mergeItem) {
  const before = new Map(base.map(item => [item.id, item]));
  const after = new Map(local.map(item => [item.id, item]));
  const result = new Map(remote.map(item => [item.id, item]));

  for (const id of before.keys()) {
    if (!after.has(id)) result.delete(id);
  }
  for (const [id, item] of after) {
    if (!before.has(id)) {
      result.set(id, item);
    } else if (result.has(id)) {
      result.set(id, mergeItem(before.get(id), item, result.get(id)));
    }
  }
  return [...result.values()];
}

function mergeFields(base, local, remote, excludedField) {
  const result = { ...remote };
  for (const [key, value] of Object.entries(local)) {
    if (key !== excludedField && value !== base[key]) result[key] = value;
  }
  return result;
}

export function mergeProjects(base, local, remote) {
  return mergeItems(base, local, remote, (before, after, current) => ({
    ...mergeFields(before, after, current, 'tasks'),
    tasks: mergeItems(before.tasks, after.tasks, current.tasks, mergeFields)
  }));
}
