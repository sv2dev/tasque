import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Queue } from "./queue";

const execute = mock(async () => console.log("executed"));

beforeEach(() => {
  execute.mockClear();
});

describe("Queue", () => {
  describe("push()", () => {
    it("should immediately execute an incoming job, if the queue is empty", () => {
      const queue = new Queue();

      queue.push(execute);

      expect(queue.size).toBe(0);
    });

    it("should enqueue a job, if there is already a job running", () => {
      const queue = new Queue();

      queue.push(execute);
      queue.push(execute);

      expect(queue.size).toBe(1);
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("should return the result of the job", async () => {
      const queue = new Queue();

      const result = await queue.push(async () => "test");

      expect(result).toBe("test");
    });

    it("should return null, if the queue is full", () => {
      const queue = new Queue(1);

      const result1 = queue.push(execute);
      const result2 = queue.push(execute);
      const result3 = queue.push(execute);

      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      expect(result3).toBeNull();
    });

    it("should execute the next job, when the current one is finished", async () => {
      const queue = new Queue();
      const execute = mock(async () => {});

      const result1 = queue.push(execute);
      const result2 = queue.push(execute);

      await result1;
      await result2;

      expect(execute).toHaveBeenCalledTimes(2);
    });
  });
});
