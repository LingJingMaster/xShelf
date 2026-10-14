function text(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function heading(value) {
  return text(value).replace(/([\\`*_{}\[\]<>#+.!|~-])/g, "\\$1");
}

function url(value) {
  return String(value || "").replaceAll(" ", "%20").replaceAll(">", "%3E");
}

export function rowsForExport(scopedRows, categoryRows, selectedIds) {
  const selected = new Set(selectedIds || []);
  return selected.size ? categoryRows.filter(row => selected.has(row.id)) : scopedRows;
}

export function rowsToMarkdown(rows, options = {}) {
  const title = options.title || "xShelf";
  const exportedAt = options.exportedAt || new Date().toISOString();
  const lines = ["# " + heading(title), "", "> 导出时间：" + exportedAt, "> 记录数量：" + rows.length, ""];
  rows.forEach((row, index) => {
    const author = [row.authorName, row.authorHandle].filter(Boolean).join(" ") || "Unknown";
    const body = text(row.text || row.description || row.articleTitle || "（没有可显示的正文）");
    lines.push("## " + (index + 1) + ". " + heading(author), "");
    const metadata = [
      row.createdAt ? "日期：" + new Date(row.createdAt * 1000).toISOString().slice(0, 10) : "",
      row.tags?.length ? "标签：" + row.tags.join("、") : ""
    ].filter(Boolean).join(" · ");
    if (metadata) lines.push(metadata, "");
    lines.push(body, "");
    for (const media of row.media || []) {
      if (!media?.url || media.url.includes("/profile_images/") || media.url.includes("/profile_banners/")) continue;
      lines.push("![" + heading(media.alt || "推文附图") + "](<" + url(media.url) + ">)", "");
    }
    if (row.url) lines.push("[在 X 查看原文](<" + url(row.url) + ">)", "");
    lines.push("---", "");
  });
  return lines.join("\n");
}
