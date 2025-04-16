import { sleep } from "bun";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createQueue } from "./tasque";

const execute = mock(async () => "test");

beforeEach(() => {
  execute.mockClear();
});

describe("add()", () => {
  it("should defer executing an incoming task, if the queue is empty", async () => {
    const queue = createQueue();

    queue.add(execute);
    await sleep(0);

    expect(queue.queued).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("should enqueue a task, if there is already a task running", async () => {
    const queue = createQueue();
    queue.add(execute);

    queue.add(execute);

    expect(queue.queued).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("should return the result of the task", async () => {
    const queue = createQueue();

    const result = await queue.add(async () => "test");

    expect(result).toBe("test");
  });

  it("should return null, if the queue is full", () => {
    const queue = createQueue({ max: 2 });
    // first is immediately executed
    const result1 = queue.add(execute);
    // second and third are queued
    const result2 = queue.add(execute);
    const result3 = queue.add(execute);

    // queue is full
    const result4 = queue.add(execute);

    expect(result1).toBeInstanceOf(Promise);
    expect(result2).toBeInstanceOf(Promise);
    expect(result3).toBeInstanceOf(Promise);
    expect(result4).toBeNull();
  });

  it("should execute the next task, when the current one is finished", async () => {
    const queue = createQueue();
    const execute = mock(async () => {});

    const result1 = queue.add(execute);
    const result2 = queue.add(execute);

    await result1;
    await result2;

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("should run a configured amount of tasks in parallel", async () => {
    const queue = createQueue({ parallelize: 2 });
    let r1!: (x: string) => void;
    const p1 = new Promise<string>((resolve) => (r1 = resolve));
    let r2!: (x: string) => void;
    const p2 = new Promise<string>((resolve) => (r2 = resolve));
    let r3!: (x: string) => void;
    const p3 = new Promise<string>((resolve) => (r3 = resolve));
    execute.mockImplementationOnce(() => p1);
    execute.mockImplementationOnce(() => p2);
    execute.mockImplementationOnce(() => p3);

    queue.add(execute);
    queue.add(execute);
    queue.add(execute);

    // The first task should be started in parallel with the second one.
    expect(execute).toHaveBeenCalledTimes(2);
    // The third task was not executed immediately, because the queue is full.
    r1("test");
    await sleep(0);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("should continue executing tasks, even if a task throws an error", async () => {
    const queue = createQueue();
    const error = new Error("test");

    const res1 = queue.add(async () => {
      throw error;
    });
    const res2 = queue.add(execute);

    try {
      await res1;
      throw new Error("The error was not thrown");
    } catch (e) {
      expect(e).toBe(error);
    }
    expect(await res2).toBe("test");
  });

  describe("position listener", () => {
    it("should be called with 0, if a task is added to the queue and executed immediately", async () => {
      const queue = createQueue();
      const listener = mock();

      queue.add(execute, listener);
      await sleep(0);

      expect(listener.mock.calls).toEqual([[0]]);
    });

    it("should be called when the queue position changes", async () => {
      const queue = createQueue();
      const listener = mock();

      queue.add(execute);
      const res2 = queue.add(execute, listener);

      await res2;
      expect(listener.mock.calls).toEqual([[1], [0]]);
    });

    it("can be passed as an option", async () => {
      const queue = createQueue();
      const listener = mock();

      queue.add(execute, { listener });
      await sleep(0);

      expect(listener.mock.calls).toEqual([[0]]);
    });
  });
});

describe("iterate()", () => {
  it("should return null, if the queue is full", () => {
    const queue = createQueue({ max: 1 });
    // We need to iterate overt the iterable to pull the values. Otherwise queueing will not work.
    // first is immediately executed
    Array.fromAsync(queue.iterate(execute)!);
    // second is queued
    Array.fromAsync(queue.iterate(execute)!);

    // queue is full
    const iterable = queue.iterate(execute);

    expect(iterable).toBeNull();
  });

  it("should return an async iterable, that yields the queue position and the task result", async () => {
    const queue = createQueue();

    const iterable = queue.iterate(execute);

    expect(await Array.fromAsync(iterable!)).toEqual([[0], [null, "test"]]);
  });

  it("should yield the correct queue positions", async () => {
    const queue = createQueue({ parallelize: 2 });

    const iterable1 = queue.iterate(execute);
    const iterable2 = queue.iterate(execute);
    const iterable3 = queue.iterate(execute);

    const events1 = Array.fromAsync(iterable1!);
    const events2 = Array.fromAsync(iterable2!);
    const events3 = Array.fromAsync(iterable3!);

    expect(await Promise.all([events1, events2, events3])).toEqual([
      [[0], [null, "test"]],
      [[0], [null, "test"]],
      [[1], [0], [null, "test"]],
    ]);
  });

  it("should yield the correct queue positions in the correct order", async () => {
    const queue = createQueue({ parallelize: 2 });

    const iterable1 = queue.iterate(execute);
    const iterable2 = queue.iterate(execute);
    const iterable3 = queue.iterate(execute);

    await Promise.all([
      iterateWithId(1, iterable1!),
      iterateWithId(2, iterable2!),
      iterateWithId(3, iterable3!),
    ]);

    expect(iteratedEvents).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
      [1, null, "test"],
      [2, null, "test"],
      [3, 0],
      [3, null, "test"],
    ]);
  });

  it("should iterate over an async iterable", async () => {
    const queue = createQueue();

    const iterable = queue.iterate(async function* () {
      yield "a";
      yield "b";
    });

    expect(await Array.fromAsync(iterable!)).toEqual([
      [0],
      [null, "a"],
      [null, "b"],
    ]);
  });

  it("should correctly count positions, if the queue is emptied and then filled again", async () => {
    const queue = createQueue();
    const iterable1 = queue.iterate(execute);
    const iterable2 = queue.iterate(execute);
    const iterable3 = queue.iterate(execute);
    await Promise.all([
      iterateWithId(1, iterable1!),
      iterateWithId(2, iterable2!),
      iterateWithId(3, iterable3!),
    ]);
    const iterable4 = queue.iterate(execute);
    const iterable5 = queue.iterate(execute);
    const iterable6 = queue.iterate(execute);

    await Promise.all([
      iterateWithId(4, iterable4!),
      iterateWithId(5, iterable5!),
      iterateWithId(6, iterable6!),
    ]);

    expect(iteratedEvents).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [1, null, "test"],
      [2, 0],
      [3, 1],
      [2, null, "test"],
      [3, 0],
      [3, null, "test"],
      [4, 0],
      [5, 1],
      [6, 2],
      [4, null, "test"],
      [5, 0],
      [6, 1],
      [5, null, "test"],
      [6, 0],
      [6, null, "test"],
    ]);
  });

  it("should unqueue a task when iteration aborts while in the queue", async () => {
    const queue = createQueue();
    const iterable1 = queue.iterate(execute)!;
    const iterable2 = queue.iterate(execute)!;

    await Promise.all([
      iterateWithId(1, iterable1),
      (async function () {
        for await (const [pos, result] of iterable2) {
          iteratedEvents.push([2, pos, result]);
          if (pos === 1) return;
        }
      })(),
    ]);

    expect(queue.queued).toBe(0);
    expect(queue.running).toBe(0);
    expect(iteratedEvents).toEqual([
      [1, 0],
      [2, 1],
      [1, null, "test"],
    ]);
  });

  it("should not queue a task, if it is aborted before it is iterated over", async () => {
    const queue = createQueue();
    const iterable1 = queue.iterate(execute)!;
    const iterable2 = queue.iterate(execute)!;

    iterable1[Symbol.asyncIterator]().return?.();

    await Promise.all([
      iterateWithId(1, iterable1),
      iterateWithId(2, iterable2),
    ]);

    expect(queue.queued).toBe(0);
    expect(queue.running).toBe(0);
    expect(iteratedEvents).toEqual([
      [2, 0],
      [2, null, "test"],
    ]);
  });
});

describe("dynamic parallelization", () => {
  it("should adapt to increased parallelization", async () => {
    const queue = createQueue({ parallelize: 1 });
    let r1!: (x: string) => void;
    let r2!: (x: string) => void;
    let r3!: (x: string) => void;

    const p1 = new Promise<string>((resolve) => (r1 = resolve));
    const p2 = new Promise<string>((resolve) => (r2 = resolve));
    const p3 = new Promise<string>((resolve) => (r3 = resolve));

    const task1 = mock(() => p1);
    const task2 = mock(() => p2);
    const task3 = mock(() => p3);

    // Add three tasks with parallelization = 1
    const res1 = queue.add(task1);
    const res2 = queue.add(task2);
    const res3 = queue.add(task3);

    // Only first task should be running
    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).toHaveBeenCalledTimes(0);
    expect(task3).toHaveBeenCalledTimes(0);

    // Increase parallelization
    queue.parallelize = 3;

    // Complete first task
    r1("result1");
    await sleep(1);

    // Now both remaining tasks should be running
    expect(task2).toHaveBeenCalledTimes(1);
    expect(task3).toHaveBeenCalledTimes(1);

    r2("result2");
    r3("result3");

    const results = await Promise.all([res1, res2, res3]);
    expect(results).toEqual(["result1", "result2", "result3"]);
  });

  it("should handle decreased parallelization correctly", async () => {
    const queue = createQueue({ parallelize: 3 });
    let r1!: (x: string) => void;
    let r2!: (x: string) => void;
    let r3!: (x: string) => void;

    const p1 = new Promise((resolve) => (r1 = resolve));
    const p2 = new Promise((resolve) => (r2 = resolve));
    const p3 = new Promise((resolve) => (r3 = resolve));

    const task1 = mock(() => p1);
    const task2 = mock(() => p2);
    const task3 = mock(() => p3);

    // Add three tasks with parallelization = 3
    queue.add(task1);
    queue.add(task2);
    queue.add(task3);

    // All three tasks should be running
    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).toHaveBeenCalledTimes(1);
    expect(task3).toHaveBeenCalledTimes(1);
    expect(queue.running).toBe(3);
    expect(queue.queued).toBe(0);

    // Decrease parallelization - should not affect already running tasks
    queue.parallelize = 1;

    // Add a fourth task
    let r4!: (x: string) => void;
    const p4 = new Promise((resolve) => (r4 = resolve));
    const task4 = mock(() => p4);
    queue.add(task4);

    // Fourth task should not be running yet
    expect(queue.running).toBe(3);
    expect(queue.queued).toBe(1);
    expect(task4).toHaveBeenCalledTimes(0);

    // Complete first task
    r1("result1");
    await sleep(0);

    // Fourth task should still not be running because parallelization is now 1
    // and we still have tasks 2 and 3 running
    expect(queue.running).toBe(2);
    expect(queue.queued).toBe(1);
    expect(task4).toHaveBeenCalledTimes(0);

    // Complete second and third tasks
    r2("result2");
    r3("result3");
    await sleep(0);

    // Now fourth task should be running
    expect(task4).toHaveBeenCalledTimes(1);
    r4("result4");
  });
});

describe("error handling", () => {
  it("should handle errors in async iterables correctly", async () => {
    const queue = createQueue();
    const error = new Error("async iterable error");

    const iterable = queue.iterate(async function* () {
      yield "first value";
      throw error;
    });

    const results: any[] = [];
    try {
      for await (const event of iterable!) {
        results.push(event);
      }
      throw new Error("Error was not thrown");
    } catch (e) {
      expect(e).toBe(error);
    }

    expect(results).toEqual([[0], [null, "first value"]]);
    expect(queue.queued).toBe(0);
    expect(queue.running).toBe(0);
  });

  it("should continue processing queue after an async iterable throws", async () => {
    const queue = createQueue();
    const error = new Error("async iterable error");

    const iterable1 = queue.iterate(async function* () {
      yield "value";
      throw error;
    });
    const iterable2 = queue.iterate(execute);

    try {
      await Array.fromAsync(iterable1!);
    } catch (e) {
      expect(e).toBe(error);
    }

    const results = await Array.fromAsync(iterable2!);
    expect(results).toEqual([[0], [null, "test"]]);
  });
});

describe("max queue size", () => {
  it("should respect dynamic changes to max queue size", async () => {
    const queue = createQueue({ max: 2, parallelize: 1 });

    // First task runs immediately
    queue.add(execute);
    // Second and third tasks are queued
    queue.add(execute);
    queue.add(execute);

    // Queue is full
    expect(queue.add(execute)).toBeNull();

    // Increase max queue size
    queue.max = 3;

    // Now we can add one more
    const result = queue.add(execute);
    expect(result).toBeInstanceOf(Promise);

    // But no more than that
    expect(queue.add(execute)).toBeNull();
  });

  it("should handle decreasing max queue size", async () => {
    const queue = createQueue({ max: 5, parallelize: 1 });

    // First task runs immediately
    queue.add(execute);
    // Next tasks are queued
    queue.add(execute);
    queue.add(execute);
    queue.add(execute);

    // Decrease max queue size - should not affect already queued tasks
    queue.max = 1;

    // Can't add more tasks now
    expect(queue.add(execute)).toBeNull();

    // But all previously queued tasks should still execute
    expect(execute).toHaveBeenCalledTimes(1);
    await sleep(100);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});

describe("edge cases", () => {
  it("should handle empty tasks correctly", async () => {
    const queue = createQueue();

    const result = await queue.add(async () => {});

    expect(result).toBeUndefined();
  });

  it("should handle synchronous errors in task creation", async () => {
    const queue = createQueue();
    const error = new Error("sync error");

    const task = mock(() => {
      throw error;
    });

    try {
      await queue.add(task);
      throw new Error("Error was not thrown");
    } catch (e) {
      expect(e).toBe(error);
    }

    expect(queue.running).toBe(0);
    expect(queue.queued).toBe(0);
  });

  it("should handle synchronous tasks", async () => {
    const queue = createQueue();

    const result = await queue.add(() => "direct value" as any);

    expect(result).toBe("direct value");
  });
});

describe("abort signal", () => {
  it("should abort a task when queued", async () => {
    const queue = createQueue({ parallelize: 0 });
    let r!: (x: string) => void;
    const p = new Promise<string>((resolve) => (r = resolve));
    const task = mock(() => p);
    const ctrl = new AbortController();

    let res = queue.add(task, { signal: ctrl.signal });
    try {
      ctrl.abort();
      await res;
      throw new Error("Error was not thrown");
    } catch (e) {
      expect(e).toBe(ctrl.signal.reason);
    }

    expect(queue.running).toBe(0);
    expect(queue.queued).toBe(0);
  });
});

const iteratedEvents: any[] = [];

async function iterateWithId(id: number, iterable: AsyncIterable<any>) {
  for await (const event of iterable) {
    iteratedEvents.push([id, ...event]);
  }
}

afterEach(() => {
  iteratedEvents.length = 0;
});
