// 列表页跨路由缓存：保留已加载数据与滚动位置，从播放页返回时列表不重置、不跳动
const cache = new Map();

export function getCache(key) {
  return cache.get(key) || null;
}

export function setCache(key, value) {
  cache.set(key, value);
}

export function removeCache(key) {
  cache.delete(key);
}

// 本次观看结果（进度 / 是否看完 / 是否取消收藏），列表页返回时原地合并
const watchResults = new Map();

export function recordWatch(bvid, info) {
  const old = watchResults.get(bvid) || {};
  watchResults.set(bvid, { ...old, ...info });
}

export function getWatchResults() {
  return watchResults;
}

export function clearWatchResults() {
  watchResults.clear();
}
