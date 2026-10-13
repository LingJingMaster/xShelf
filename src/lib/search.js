const escapeRegex = value => value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

export function parseQuery(input = "") {
  const groups = [[]];
  const tokens = input.match(/"[^"]*"|\S+/g) || [];
  for (const token of tokens) {
    const word = token.toLowerCase();
    if (word === "or") {
      if (groups.at(-1).length) groups.push([]);
      continue;
    }
    if (word === "and") continue;
    const phrase = token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token;
    if (phrase) groups.at(-1).push(phrase);
  }
  return groups.filter(group => group.length);
}

export function createSearchPredicate(input = "") {
  const groups = parseQuery(input).map(group => group.map(term => {
    const pattern = escapeRegex(term).replace(/\*/g, ".*");
    return new RegExp(pattern, "iu");
  }));
  if (!groups.length) return () => true;
  return text => groups.some(group => group.every(pattern => pattern.test(text || "")));
}

export function searchableText(post) {
  return [post.text, post.articleTitle, post.articlePreview, post.authorName, post.authorHandle].filter(Boolean).join(" ");
}

export function filterPosts(posts, filters = {}) {
  const matches = createSearchPredicate(filters.query);
  const authors = new Set(filters.authors || []);
  return posts.filter(post => {
    if (!matches(searchableText(post))) return false;
    if (filters.folder && filters.folder !== "all" && post.folder !== filters.folder) return false;
    if (authors.size && !authors.has(post.authorHandle)) return false;
    if (filters.contentType && filters.contentType !== "all" && !post.contentTypes?.includes(filters.contentType)) return false;
    if (filters.postType && filters.postType !== "all" && post.postType !== filters.postType) return false;
    if (filters.startDate && post.createdAt < Date.parse(filters.startDate) / 1000) return false;
    if (filters.endDate && post.createdAt >= Date.parse(filters.endDate + "T23:59:59") / 1000) return false;
    return true;
  }).sort((a, b) => filters.oldest ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
}
