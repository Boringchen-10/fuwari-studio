const fuwari = require('./fuwari.cjs');

const adapters = new Map([[fuwari.id, fuwari]]);

function getAdapter(id) {
  const adapter = adapters.get(String(id || ''));
  if (!adapter) throw new Error('当前版本还不支持这个网站基座');
  return adapter;
}

module.exports = {getAdapter, listAdapters: () => [...adapters.values()]};
