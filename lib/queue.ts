type Task<T = void> = () => T | Promise<T> | AsyncIterable<T>;
type PositionListener = (position: number) => void;
type IterableValue<T> =
  | readonly [position: number]
  | readonly [position: null, result: T];
type TaskOpts = {
  listener?: PositionListener;
};
type IterateOpts = Omit<TaskOpts, "listener">;

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
  get parallelize(): number {
    return this.p;
  }
  set parallelize(p: number) {
    let diff = p - this.p;
    this.p = p;
    while (diff-- > 0) setTimeout(() => this.n());
  }
  private p = 1;
  /** Internal: The number of tasks currently enqueued (excluding the currently running tasks). */
  private q = 0;
  /** Internal: The number of currently running tasks. */
  private r = 0;
  /** Internal: Notifies completion of a task. */
  private c!: () => void;
  /** Internal: A promise which is resolved and recreated, every time a task is done. */
  private d!: Promise<void>;

  /**
   * Creates a new queue.
   *
   * @param max - The maximum number of tasks that can be enqueued (excluding the currently running tasks).
   * @param parallelize - The number of tasks that can be executed in parallel.
   */
  constructor({ max = Number.MAX_SAFE_INTEGER, parallelize = 1 } = {}) {
    this.max = max;
    this.p = parallelize;
    this.n();
  }

  /**
   * The number of tasks currently enqueued (excluding the currently running tasks).
   */
  get queued(): number {
    return this.q;
  }

  /**
   * The number of tasks currently running.
   */
  get running(): number {
    return this.r;
  }

  /**
   * Adds a task to the queue.
   *
   * @param task - The task to add to the queue.
   * @param opts - A listener that is called every time the queue position of the task changes or options.
   * @returns A promise that resolves to the result of the task or `null` if the queue is full.
   *   If the task is iterable, the last yielded value is returned.
   */
  add<T = void>(
    task: Task<T>,
    opts?: PositionListener | TaskOpts
  ): Promise<T> | null {
    if (this.q >= this.max) return null;
    if (typeof opts === "function") opts = { listener: opts };
    const iterator = this.i(task, opts);
    return (async () => {
      let value!: T;
      for await (const [pos, v] of iterator) {
        if (pos !== null) opts?.listener?.(pos);
        else value = v as T;
      }
      return value;
    })();
  }

  /**
   * Adds a task to the queue and returns an async iterable that yields the queue position and the task result.
   *
   * Yields `[number]` when the queue position changes.
   * Then yields `[null, T]` when the task is finished or yields a value.
   *
   * @example
   * ```ts
   * const queue = new Queue();
   *
   * const iterable = queue.iterate(async () => "Hello, world!");
   * for await (const [position, result] of iterable!) {
   *   if(position === null) {
   *     console.log("Task finished", result);
   *   } else {
   *     console.log("Queue position changed");
   *   }
   * }
   * ```
   *
   * @example
   * ```ts
   * const queue = new Queue();
   *
   * const iterable = queue.iterate(async function* () {
   *   yield "Hello,";
   *   yield "world!";
   * });
   * for await (const [position, value] of iterable!) {
   *   if(position === null) {
   *     console.log("Task emitted value", value);
   *   } else {
   *     console.log("Queue position changed");
   *   }
   * }
   * ```
   * @param task - The task to add to the queue.
   * @returns An async iterable that yields the queue position and the task result or `null` if the queue is full.
   */
  iterate<T = void>(
    task: Task<T>,
    opts?: IterateOpts
  ): AsyncIterable<IterableValue<T>> | null {
    return this.q >= this.max ? null : this.i(task, opts);
  }

  private async *i<T>(
    task: Task<T>,
    opts?: IterateOpts
  ): AsyncGenerator<IterableValue<T>> {
    let t!: T | AsyncIterable<T> | Promise<T> | undefined;
    let pos = this.p > this.r ? 0 : ++this.q;
    try {
      if (pos > 0) {
        while (pos > 0) {
          yield [pos];
          await this.d;
          if (this.p >= this.r) pos--;
        }
        this.q--;
      }
      t = task();
      this.r++;
      yield [0];
      if (t && typeof t === "object" && Symbol.asyncIterator in t)
        for await (const x of t) yield [null, x];
      else yield [null, await t];
      // Will be executed, if iteration is aborted or if the task is finished/errored.
    } finally {
      if (pos > 0) this.q--;
      if (t) this.r--;
      this.n();
    }
  }

  private n() {
    this.c?.();
    return (this.d = new Promise<void>((r) => (this.c = r)));
  }
}
