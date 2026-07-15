/** 简单并发池：limit 个 worker 同时跑，保持顺序地处理 items。 */
export async function asyncPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const size = Math.min(limit, items.length);
  const runners = Array.from({ length: Math.max(size, 0) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}
