import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Queue } from "./queue";

const execute = mock(async () => {});

beforeEach(() => {
  execute.mockClear();
});

describe("Queue", () => {
  describe("push()", () => {
    it("should defer executing an incoming task, if the queue is empty", async () => {
      const queue = new Queue();

      queue.push(execute);
      await new Promise((resolve) => setTimeout(resolve));

      expect(queue.size).toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should enqueue a task, if there is already a task running", async () => {
      const queue = new Queue();
      queue.push(execute);
      await new Promise((resolve) => setTimeout(resolve));

      queue.push(execute);

      expect(queue.size).toBe(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should return the result of the task", async () => {
      const queue = new Queue();

      const result = await queue.push(async () => "test");

      expect(result).toBe("test");
    });

    it("should return null, if the queue is full", () => {
      const queue = new Queue({ max: 2 });
      const result1 = queue.push(execute);
      const result2 = queue.push(execute);

      const result3 = queue.push(execute);

      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      expect(result3).toBeNull();
    });

    it("should execute the next task, when the current one is finished", async () => {
      const queue = new Queue();
      const execute = mock(async () => {});

      const result1 = queue.push(execute);
      const result2 = queue.push(execute);

      await result1;
      await result2;

      expect(execute).toHaveBeenCalledTimes(2);
    });

    it("should run a configured amount of tasks in parallel", async () => {
      const queue = new Queue({ parallelize: 2 });

      const res1 = queue.push(execute);
      queue.push(execute);
      const res3 = queue.push(execute);

      // The first task should be started in parallel with the second one.
      await res1;
      expect(execute).toHaveBeenCalledTimes(2);

      // The third task was not executed immediately, because the queue is full.
      await res3;
      expect(execute).toHaveBeenCalledTimes(3);
    });
  });

  describe("position listener", () => {
    it("should be called when a task is added to the queue", () => {
      const queue = new Queue();
      const listener = mock();

      queue.push(execute, listener);

      expect(listener).toHaveBeenCalledWith(1);
    });

    it("should be called when the queue position changes", async () => {
      const queue = new Queue();
      const listener = mock();

      const res1 = queue.push(execute);
      queue.push(execute, listener);

      await res1;
      expect(listener.mock.calls).toEqual([[2], [1]]);
    });

    it("should not be called when the task is executed", async () => {
      const queue = new Queue();
      const listener = mock();

      const res = queue.push(execute, listener);

      await res;
      expect(listener.mock.calls).toEqual([[1]]);
    });
  });
});
