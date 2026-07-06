function renderCategoryListResponse({ store, cats, COPY, mergeKeys }) {
  return (
    mergeKeys(COPY.catalogWelcome(store)) +
    '\n\n' +
    mergeKeys(COPY.categoriesIntro()) +
    '\n\n' +
    cats.map((c, i) => `${formatKeycap(i + 1)} ${c.name}`).join('\n')
  );
}

function enterBrowseCategories({ toolResults, store, COPY, mergeKeys, keys, flow }) {
  const cats = toolResults['categories.list']?.categories || flow.categoryList || [];
  if (!cats.length) {
    return {
      needsTool: true,
      reply: mergeKeys(COPY.lookupFiller()),
      patch: { phase: 'browse_categories', lastCopyKeys: keys },
    };
  }
  return {
    needsTool: false,
    reply: renderCategoryListResponse({ store, cats, COPY, mergeKeys }),
    patch: {
      phase: 'browse_categories',
      categoryList: cats.map((c) => ({ id: c.id, name: c.name, productCount: c.productCount })),
      lastCopyKeys: keys,
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { renderCategoryListResponse, enterBrowseCategories };
}
