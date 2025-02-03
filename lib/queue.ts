type Task<T = void> = () => Promise<T>;
type PositionListener = (position: number) => void;

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
  /**
   * The maximum number of tasks that can be enqueued (excluding the currently running tasks).
   * Changing this will not affect already enqueued tasks.
   */
  max: number;
  /**
   * The number of tasks that can be executed in parallel.
   * Changing this will not affect already enqueued tasks and if it is scaled up, it will
   * take effect as soon as one running task is finished.
   */
  parallelize: number;
  #queue = [] as [Task<any>, PositionListener?][];
  #runningTasks: Promise<any>[] = [];
  #running = false;
  /**
   * Creates a new queue.
   *
   * @param max - The maximum number of tasks that can be enqueued (excluding the currently running tasks).
   * @param parallelize - The number of tasks that can be executed in parallel.
   */
  constructor({ max = Number.MAX_SAFE_INTEGER, parallelize = 1 } = {}) {
    this.max = max;
    this.parallelize = parallelize;
  }

  /**
   * The number of tasks currently in the queue.
   */
  get size(): number {
    return this.#queue.length;
  }

  /**
   * Whether the queue is currently running.
   */
  get running(): boolean {
    return this.#running;
  }

  /**
   * The number of tasks currently running.
   */
  get runningCount(): number {
    return this.#runningTasks.length;
  }

  /**
   * Pushes a task to the queue.
   *
   * @param task - The task to push to the queue.
   * @param positionListener - A listener that is called every time the queue position of the task changes.
   * @returns A promise that resolves to the result of the task or `null` if the queue is full.
   */
  push<T = void>(
    task: Task<T>,
    positionListener?: PositionListener
  ): Promise<T> | null {
    if (this.#queue.length >= this.max) return null;
    const p = new Promise<T>((resolve, reject) => {
      const wrapper = () => task().then(resolve, reject);
      this.#queue.push([wrapper, positionListener]);
      positionListener?.(this.#queue.length);
      if (this.#runningTasks.length === 0) this.#executeNext();
    });
    return p;
  }

  async #executeNext() {
    if (this.#running) return;
    this.#running = true;
    while (this.#queue.length > 0) {
      // Defer execution to pick up all synchronously enqueued tasks.
      await new Promise((resolve) => setTimeout(resolve));

      // Execute as many tasks as possible in parallel.
      while (
        this.#queue.length > 0 &&
        this.#runningTasks.length < this.parallelize
      ) {
        const [task] = this.#queue.shift()!;
        const res = task();
        res.finally(() =>
          this.#runningTasks.splice(this.#runningTasks.indexOf(res), 1)
        );
        this.#runningTasks.push(res);
      }
      for (let i = 0; i < this.#queue.length; i++) this.#queue[i][1]?.(i + 1);
      // Wait for one of the current tasks to finish before executing the next one(s).
      await Promise.race(this.#runningTasks);
    }
    this.#running = false;
  }
}
