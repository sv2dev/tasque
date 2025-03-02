type Task<T = void> = () => T | Promise<T> | AsyncIterable<T>;
type PositionListener = (position: number) => void;
type IterableValue<T> =
  | readonly [position: number]
  | readonly [position: null, result: T];
type TaskOpts = {
  listener?: PositionListener;
  signal?: AbortSignal;
};
type IterateOpts = Omit<TaskOpts, "listener">;

/**
 * Creates a new task queue.
 *
 * @param opts - Options for the queue.
 * @param opts.max - The maximum number of tasks that can be enqueued (excluding the currently running tasks).
 * @param opts.parallelize - The number of tasks that can be executed in parallel.
 *
 * @example
 * ```ts
 * const queue = createQueue();
 *
 * const result1 = queue.add(async () => {
 *   await new Promise((resolve) => setTimeout(resolve, 1000));
 *   return "Hello, world!";
 * });
 *
 * const result2 = queue.iterate(async function* () {
 *   yield "Hello,";
 *   yield "world!";
 * });
 *
 * await result1;
 * for await (const [position, value] of result2!) {
 *   console.log(position, value);
 * }
 * ```
 */
export function createQueue({
  max = Number.MAX_SAFE_INTEGER,
  parallelize = 1,
} = {}): Tasque {
  let enqueued = 0;
  let running = 0;
  let complete!: () => void;
  let done!: Promise<void>;
  next();
  return {
    get max(): number {
      return max;
    },
    set max(m: number) {
      max = m;
    },
    get parallelize(): number {
      return parallelize;
    },
    set parallelize(p: number) {
      let diff = p - parallelize;
      parallelize = p;
      while (diff-- > 0) setTimeout(() => next());
    },
    get queued(): number {
      return enqueued;
    },
    get running(): number {
      return running;
    },
    add<T = void>(
      task: Task<T>,
      opts?: PositionListener | AbortSignal | TaskOpts
    ): Promise<T> | null {
      if (enqueued >= max) return null;
      opts = normalizeOpts(opts);
      return (async () => {
        let value!: T;
        for await (const [pos, v] of i(task, opts)) {
          if (pos !== null) opts.listener?.(pos);
          else value = v as T;
        }
        return value;
      })();
    },
    iterate<T = void>(
      task: Task<T>,
      opts?: AbortSignal | IterateOpts
    ): AsyncIterable<IterableValue<T>> | null {
      return enqueued >= max ? null : i(task, normalizeOpts(opts));
    },
  };

  async function* i<T>(
    task: Task<T>,
    { signal }: IterateOpts
  ): AsyncGenerator<IterableValue<T>> {
    let t!: T | AsyncIterable<T> | Promise<T> | undefined;
    let pos = parallelize > running ? 0 : ++enqueued;
    const abortPromise = new Promise((_, r) =>
      signal?.addEventListener("abort", () => r(signal.reason))
    );
    try {
      if (pos > 0) {
        while (pos > 0) {
          yield [pos];
          await Promise.race([abortPromise, done]);
          if (parallelize >= running) pos--;
        }
        enqueued--;
      }
      t = task();
      running++;
      yield [0];
      if (t && typeof t === "object" && Symbol.asyncIterator in t)
        for await (const x of t) yield [null, x];
      else yield [null, await t];
      // Will be executed, if iteration is aborted or if the task is finished/errored.
    } finally {
      if (pos > 0) enqueued--;
      if (t) running--;
      next();
    }
  }

  async function next() {
    complete?.();
    return (done = new Promise<void>((r) => (complete = r)));
  }
}

const normalizeOpts = (
  opts: TaskOpts | PositionListener | AbortSignal | undefined
): TaskOpts => {
  return opts instanceof AbortSignal
    ? { signal: opts }
    : typeof opts === "object"
    ? opts
    : { listener: opts };
};

/**
 * A task queue.
 *
 * Allows scheduling tasks to be executed in parallel or sequentially.
 *
 * @example
 * ```ts
 * const queue = createQueue();
 * ```
 */
export interface Tasque {
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
  /**
   * The number of tasks currently enqueued (excluding the currently running tasks).
   */
  readonly queued: number;
  /**
   * The number of tasks currently running.
   */
  readonly running: number;
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
    opts?: PositionListener | AbortSignal | TaskOpts
  ): Promise<T> | null;
  /**
   * Adds a task to the queue and returns an async iterable that yields the queue position and the task result.
   *
   * Yields `[number]` when the queue position changes.
   * Then yields `[null, T]` when the task is finished or yields a value.
   *
   * @example
   * ```ts
   * const queue = createQueue();
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
   * const queue = createQueue();
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
    opts?: AbortSignal | IterateOpts
  ): AsyncIterable<IterableValue<T>> | null;
}
