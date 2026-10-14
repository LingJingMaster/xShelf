export function rowTags(row) {
  return Array.isArray(row?.tags) ? [...new Set(row.tags.filter(Boolean))] : [];
}

export function applyTagsToRows(rows, selectedIds, tags, mode) {
  const ids = new Set(selectedIds || []);
  const changes = new Set(tags || []);
  return rows.map(row => {
    if (!ids.has(row.id)) return row;
    const next = new Set(rowTags(row));
    changes.forEach(tag => mode === "remove" ? next.delete(tag) : next.add(tag));
    return { ...row, tags: [...next] };
  });
}
