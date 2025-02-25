import { sleep } from "bun";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Queue } from "./queue";

const execute = mock(async () => "test");

beforeEach(() => {
  execute.mockClear();
});

describe("Queue", () => {
  describe("push()", () => {
    it("should defer executing an incoming task, if the queue is empty", async () => {
      const queue = new Queue();

      queue.add(execute);
      await new Promise((resolve) => setTimeout(resolve));

      expect(queue.queued).toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should enqueue a task, if there is already a task running", async () => {
      const queue = new Queue();
      queue.add(execute);

      queue.add(execute);

      expect(queue.queued).toBe(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should return the result of the task", async () => {
      const queue = new Queue();

      const result = await queue.add(async () => "test");

      expect(result).toBe("test");
    });

    it("should return null, if the queue is full", () => {
      const queue = new Queue({ max: 2 });
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
      const queue = new Queue();
      const execute = mock(async () => {});

      const result1 = queue.add(execute);
      const result2 = queue.add(execute);

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

      const res1 = queue.add(execute);
      const res2 = queue.add(execute);
      const res3 = queue.add(execute);

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
        const queue = new Queue();
        const listener = mock();

        queue.add(execute, listener);
        await new Promise((resolve) => setTimeout(resolve));

        expect(listener.mock.calls).toEqual([[0]]);
      });

      it("should be called when the queue position changes", async () => {
        const queue = new Queue();
        const listener = mock();

        queue.add(execute);
        const res2 = queue.add(execute, listener);

        await res2;
        expect(listener.mock.calls).toEqual([[1], [0]]);
      });
    });
  });

  describe("iterate()", () => {
    it("should return null, if the queue is full", () => {
      const queue = new Queue({ max: 1 });
      // first is immediately executed
      queue.add(execute);
      // second is queued
      queue.add(execute);

      // queue is full
      const iterable = queue.iterate(execute);

      expect(iterable).toBeNull();
    });

    it("should return an async iterable, that yields the queue position and the task result", async () => {
      const queue = new Queue();

      const iterable = queue.iterate(execute);

      expect(await Array.fromAsync(iterable!)).toEqual([[0], [null, "test"]]);
    });

    it("should yield the correct queue positions", async () => {
      const queue = new Queue({ parallelize: 2 });

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
      const queue = new Queue({ parallelize: 2 });
      const events: any[] = [];

      const iterable1 = queue.iterate(execute);
      const iterable2 = queue.iterate(execute);
      const iterable3 = queue.iterate(execute);

      await Promise.all([
        iterate(1, iterable1!),
        iterate(2, iterable2!),
        iterate(3, iterable3!),
      ]);

      expect(events).toEqual([
        [1, 0],
        [2, 0],
        [3, 1],
        [1, null, "test"],
        [2, null, "test"],
        [3, 0],
        [3, null, "test"],
      ]);

      async function iterate(id: number, iterable: AsyncIterable<any>) {
        for await (const event of iterable) {
          events.push([id, ...event]);
        }
      }
    });

    it("should iterate over an async iterable", async () => {
      const queue = new Queue();

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
  });
});
