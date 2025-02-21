type Task<T = void> = () => Promise<T>;
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
  #q = [] as [Task<any>, PositionListener?][];
  #r: Promise<any>[] = [];
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
   * The number of tasks currently enqueued (excluding the currently running tasks).
   */
  get queued(): number {
    return this.#q.length;
  }

  /**
   * The number of tasks currently running.
   */
  get running(): number {
    return this.#r.length;
  }

  /**
   * Adds a task to the queue.
   *
   * @param task - The task to add to the queue.
   * @param listener - A listener that is called every time the queue position of the task changes.
   * @returns A promise that resolves to the result of the task or `null` if the queue is full.
   */
  add<T = void>(task: Task<T>, listener?: PositionListener): Promise<T> | null {
    if (this.#q.length >= this.max) return null;
    return new Promise<T>((resolve, reject) => {
      const wrapper = () => task().then(resolve, reject);
      this.#q.push([wrapper, listener]);
      listener?.(this.#q.length);
      if (!this.#running) this.#run();
    });
  }

  /**
   * Adds a task to the queue and returns an async iterable that yields the queue position and the task result.
   *
   * Yields `[number]` when the queue position changes.
   * Then yields `[null, T]` when the task is finished.
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
   * @param task - The task to add to the queue.
   * @returns An async iterable that yields the queue position and the task result or `null` if the queue is full.
   */
  iterate<T>(task: Task<T>): AsyncIterable<IterableValue<T>> | null {
    let resolve: (value: number) => void;
    let positionPromise = new Promise<number>((r) => (resolve = r));
    const taskPromise = this.add(task, (pos) => resolve(pos));
    if (taskPromise === null) return null;
    return (async function* () {
      while (true) {
        const res = await Promise.race([
          positionPromise.then((pos) => [pos] as const),
          taskPromise.then((value) => [null, value] as const),
        ]);
        yield res;
        if (res[0] === null) return;
        positionPromise = new Promise<number>((r) => (resolve = r));
      }
    })();
  }

  async #run() {
    if (this.#running) return;
    this.#running = true;
    while (this.queued > 0) {
      // Defer execution to pick up all synchronously enqueued tasks.
      await new Promise((resolve) => setTimeout(resolve));

      // Execute as many tasks as possible in parallel.
      while (this.queued > 0 && this.running < this.parallelize) {
        const [task, positionListener] = this.#q.shift()!;
        positionListener?.(0);
        const res = task();
        res.finally(() => this.#r.splice(this.#r.indexOf(res), 1));
        this.#r.push(res);
      }
      for (let i = 0; i < this.queued; i++) this.#q[i][1]?.(i + 1);
      // Wait for one of the current tasks to finish before executing the next one(s).
      await Promise.race(this.#r);
    }
    this.#running = false;
  }
}
