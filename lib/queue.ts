type Task<T = void> = () => Promise<T>;
type ProgressListener = (progress: number) => void;

/**
 * A simple task queue.
 *
 * @example
 * ```ts
 * const queue = new Queue();
 *
 * const result1 = queue.push(async () => {
 *   await new Promise((resolve) => setTimeout(resolve, 1000));
 *   return "Hello, world!";
 * });
 *
 * const result = queue.push(async () => {
 *   await new Promise((resolve) => setTimeout(resolve, 1000));
 *   return "Hello, world!";
 * });
 *
 * await result1;
 * await result2;
 * ```
 */
export class Queue {
  #maxJobs = 10;
  #queue = [] as [Task<any>, ProgressListener][];
  #current: Promise<any> | null = null;

  /**
   * Creates a new queue.
   *
   * @param maxJobs - The maximum number of jobs that can be executed in parallel.
   */
  constructor(maxJobs = 10) {
    this.#maxJobs = maxJobs;
  }

  /**
   * The number of jobs currently in the queue.
   */
  get size(): number {
    return this.#queue.length;
  }

  /**
   * Pushes a job to the queue.
   *
   * @param task - The job to push to the queue.
   * @returns A promise that resolves to the result of the job or `null` if the queue is full.
   */
  push<T = void>(task: Task<T>): Promise<T> | null {
    if (this.#queue.length >= this.#maxJobs) return null;
    const p = new Promise<T>((resolve) => {
      const wrapper = () => task().then(resolve);
      this.#queue.push([wrapper, () => {}]);
      if (this.#current === null) this.#executeNext();
    });
    return p;
  }

  async #executeNext() {
    while (this.#queue.length > 0) {
      const [job] = this.#queue.shift()!;
      await (this.#current = job());
    }
  }
}
