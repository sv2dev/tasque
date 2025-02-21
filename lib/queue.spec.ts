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
      await new Promise((resolve) => setTimeout(resolve));

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
      const result1 = queue.add(execute);
      const result2 = queue.add(execute);

      const result3 = queue.add(execute);

      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      expect(result3).toBeNull();
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

      const res1 = queue.add(execute);
      queue.add(execute);
      const res3 = queue.add(execute);

      // The first task should be started in parallel with the second one.
      await res1;
      expect(execute).toHaveBeenCalledTimes(2);

      // The third task was not executed immediately, because the queue is full.
      await res3;
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
      it("should be called when a task is added to the queue", () => {
        const queue = new Queue();
        const listener = mock();

        queue.add(execute, listener);

        expect(listener).toHaveBeenCalledWith(1);
      });

      it("should be called when the queue position changes", async () => {
        const queue = new Queue();
        const listener = mock();

        const res1 = queue.add(execute);
        const res2 = queue.add(execute, listener);

        await res1;
        expect(listener.mock.calls).toEqual([[2], [1]]);
        await res2;
        expect(listener.mock.calls).toEqual([[2], [1], [0]]);
      });

      it("should not be called when the task is executed", async () => {
        const queue = new Queue();
        const listener = mock();

        const res = queue.add(execute, listener);

        await res;
        expect(listener.mock.calls).toEqual([[1], [0]]);
      });
    });
  });

  describe("pushAndIterate()", () => {
    it("should return null, if the queue is full", () => {
      const queue = new Queue({ max: 1 });

      queue.add(execute);
      const iterable = queue.iterate(execute);

      expect(iterable).toBeNull();
    });

    it("should return an async iterable, that yields the queue position and the task result", async () => {
      const queue = new Queue();

      const iterable = queue.iterate(execute);

      expect(await Array.fromAsync(iterable!)).toEqual([
        [1],
        [0],
        [null, "test"],
      ]);
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
        [[1], [0], [null, "test"]],
        [[2], [0], [null, "test"]],
        [[3], [1], [0], [null, "test"]],
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
        [1, 1],
        [2, 2],
        [3, 3],
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
  });
});
