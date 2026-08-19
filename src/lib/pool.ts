/**
 * Runs tasks with a bounded number in flight, preserving input order in the
 * result. Prefetching fires dozens of requests at once; without a cap that is
 * both rude to the upstream API and a good way to trip its rate limits.
 */
export async function pooled<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  // Filled by index: every slot is assigned before Promise.all resolves.
  const results: PromiseSettledResult<T>[] = [];
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]!() };
      } catch (reason: unknown) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
