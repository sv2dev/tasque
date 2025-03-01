import { sleep } from "bun";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Queue } from "./queue";

const execute = mock(async () => "test");
const noop = mock(() => {});

beforeEach(() => {
  execute.mockClear();
});

describe("add()", () => {
  describe("as promise", () => {
    it("should defer executing an incoming task, if the queue is empty", async () => {
      const queue = new Queue();

      queue.add(execute, noop);
      await new Promise((resolve) => setTimeout(resolve));

      expect(queue.queued).toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should enqueue a task, if there is already a task running", async () => {
      const queue = new Queue();
      queue.add(execute, noop);

      queue.add(execute, noop);

      expect(queue.queued).toBe(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should return the result of the task", async () => {
      const queue = new Queue();

      const result = await queue.add(async () => "test", noop);

      expect(result).toBe("test");
    });

    it("should return null, if the queue is full", () => {
      const queue = new Queue({ max: 2 });
      // first is immediately executed
      const result1 = queue.add(execute, noop);
      // second and third are queued
      const result2 = queue.add(execute, noop);
      const result3 = queue.add(execute, noop);

      // queue is full
      const result4 = queue.add(execute, noop);

      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      expect(result3).toBeInstanceOf(Promise);
      expect(result4).toBeNull();
    });

    it("should execute the next task, when the current one is finished", async () => {
      const queue = new Queue();
      const execute = mock(async () => {});

      const result1 = queue.add(execute, noop);
      const result2 = queue.add(execute, noop);

      await result1;
      await result2;

      expect(execute).toHaveBeenCalledTimes(2);
    });

    it("should run a configured amount of tasks in parallel", async () => {
      const queue = new Queue({ parallelize: 2 });
      let r1!: (x: string) => void;
      const p1 = new Promise<string>((resolve) => (r1 = resolve));
      let r2!: (x: string) => void;
      const p2 = new Promise<string>((resolve) => (r2 = resolve));
      let r3!: (x: string) => void;
      const p3 = new Promise<string>((resolve) => (r3 = resolve));
      execute.mockImplementationOnce(() => p1);
      execute.mockImplementationOnce(() => p2);
      execute.mockImplementationOnce(() => p3);

      const res1 = queue.add(execute, noop);
      const res2 = queue.add(execute, noop);
      const res3 = queue.add(execute, noop);

      // The first task should be started in parallel with the second one.
      expect(execute).toHaveBeenCalledTimes(2);
      // The third task was not executed immediately, because the queue is full.
      r1("test");
      await sleep(0);
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it("should continue executing tasks, even if a task throws an error", async () => {
      const queue = new Queue();
      const error = new Error("test");

      const res1 = queue.add(async () => {
        throw error;
      }, noop);
      const res2 = queue.add(execute, noop);

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
        const queue = new Queue();
        const listener = mock();

        queue.add(execute, listener);
        await new Promise((resolve) => setTimeout(resolve));

        expect(listener.mock.calls).toEqual([[0]]);
      });

      it("should be called when the queue position changes", async () => {
        const queue = new Queue();
        const listener = mock();

        queue.add(execute, noop);
        const res2 = queue.add(execute, listener);

        await res2;
        expect(listener.mock.calls).toEqual([[1], [0]]);
      });
    });
  });
  describe("as async iterable", () => {
    it("should return null, if the queue is full", () => {
      const queue = new Queue({ max: 1 });
      // We need to iterate overt the iterable to pull the values. Otherwise queueing will not work.
      // first is immediately executed
      Array.fromAsync(queue.add(execute)!);
      // second is queued
      Array.fromAsync(queue.add(execute)!);

      // queue is full
      const iterable = queue.add(execute);

      expect(iterable).toBeNull();
    });

    it("should return an async iterable, that yields the queue position and the task result", async () => {
      const queue = new Queue();

      const iterable = queue.add(execute);

      expect(await Array.fromAsync(iterable!)).toEqual([[0], [null, "test"]]);
    });

    it("should yield the correct queue positions", async () => {
      const queue = new Queue({ parallelize: 2 });

      const iterable1 = queue.add(execute);
      const iterable2 = queue.add(execute);
      const iterable3 = queue.add(execute);

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
      const queue = new Queue({ parallelize: 2 });

      const iterable1 = queue.add(execute);
      const iterable2 = queue.add(execute);
      const iterable3 = queue.add(execute);

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
      const queue = new Queue();

      const iterable = queue.add(async function* () {
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
      const queue = new Queue();
      const iterable1 = queue.add(execute);
      const iterable2 = queue.add(execute);
      const iterable3 = queue.add(execute);
      await Promise.all([
        iterateWithId(1, iterable1!),
        iterateWithId(2, iterable2!),
        iterateWithId(3, iterable3!),
      ]);
      const iterable4 = queue.add(execute);
      const iterable5 = queue.add(execute);
      const iterable6 = queue.add(execute);

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
      const queue = new Queue();
      const iterable1 = queue.add(execute)!;
      const iterable2 = queue.add(execute)!;

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
      const queue = new Queue();
      const iterable1 = queue.add(execute)!;
      const iterable2 = queue.add(execute)!;

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
});

describe("error handling", () => {
  it("should handle errors in async iterables correctly", async () => {
    const queue = new Queue();
    const error = new Error("async iterable error");

    const iterable = queue.add(async function* () {
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
    const queue = new Queue();
    const error = new Error("async iterable error");

    const iterable1 = queue.add(async function* () {
      yield "value";
      throw error;
    });
    const iterable2 = queue.add(execute);

    try {
      await Array.fromAsync(iterable1!);
    } catch (e) {
      expect(e).toBe(error);
    }

    const results = await Array.fromAsync(iterable2!);
    expect(results).toEqual([[0], [null, "test"]]);
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
