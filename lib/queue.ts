type Task<T = void> = () => Promise<T> | AsyncIterable<T>;
type PositionListener = (position: number) => void;
type IterableValue<T> =
  | readonly [position: number]
  | readonly [position: null, result: T];

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
  /** The number of tasks currently enqueued (excluding the currently running tasks). */
  private _q = 0;
  /** The number of currently running tasks. */
  private _r = 0;
  /** Notifies completion of a task. */
  private _c!: () => void;
  /** A promise which is resolved and recreated, every time a task is done. */
  private _d = new Promise<void>((r) => (this._c = r));

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
   * The number of tasks currently enqueued (excluding the currently running tasks).
   */
  get queued(): number {
    return this._q;
  }

  /**
   * The number of tasks currently running.
   */
  get running(): number {
    return this._r;
  }

  /**
   * Adds a task to the queue.
   *
   * @param task - The task to add to the queue.
   * @param listener - A listener that is called every time the queue position of the task changes.
   * @returns A promise that resolves to the result of the task or `null` if the queue is full.
   */
  add<T = void>(task: Task<T>, listener: PositionListener): Promise<T> | null;
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
  add<T = void>(task: Task<T>): AsyncIterable<IterableValue<T>> | null;
  add<T = void>(
    task: Task<T>,
    listener?: PositionListener
  ): AsyncIterable<IterableValue<T>> | Promise<T> | null {
    if (this._q >= this.max) return null;
    const iterator = this.#iterate(task);
    if (!listener) return iterator;
    return (async () => {
      for await (const [pos, value] of iterator) {
        if (pos !== null) listener?.(pos);
        else return value as T;
      }
      throw new Error("Unexpected end of iteration");
    })();
  }

  async *#iterate<T>(task: Task<T>): AsyncGenerator<IterableValue<T>> {
    let t: AsyncIterable<T> | Promise<T> | null = null;
    let pos = this.parallelize > this._r ? 0 : ++this._q;
    try {
      if (pos > 0) {
        while (pos > 0) {
          yield [pos--];
          await this._d;
        }
        this._q--;
      }
      t = task();
      this._r++;
      yield [0];
      if (t instanceof Promise) yield [null, await t];
      else for await (const x of t) yield [null, x];
      // Will be executed, if iteration is aborted or if the task is finished/errored.
    } finally {
      if (pos > 0) this._q--;
      if (t) this._r--;
      this._c();
      this._d = new Promise<void>((r) => (this._c = r));
    }
  }
}
