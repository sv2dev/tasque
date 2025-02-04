# @sv2dev/queue

A simple TypeScript task queue.

[![bundle size](https://badgen.net/bundlephobia/minzip/@sv2dev/queue)](https://bundlephobia.com/package/@sv2dev/queue)

## Features

- 🏎️ Specify the number of parallel tasks
- 🔒 Define capacity
- ⏱️ React to queue position changes
- ⏭️ Stream queue position and result

## Usage

### Sequential execution

In this example, the tasks are executed one after the other.

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue();

queue.push(async () => {});
queue.push(async () => {});
```

### Parallel execution

In this example, always two tasks are executed in parallel. If one task is finished, another one is started.

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue({ parallelize: 2 });

queue.push(async () => {});
queue.push(async () => {});
queue.push(async () => {});
queue.push(async () => {});
```

### Queue capacity

The queue will reject new tasks if it is full. By default, the queue can hold an arbitrary number of tasks.
But the capacity can be limited by setting the `max` option.

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue({ max: 2 });

const res1 = queue.push(async () => {});
const res2 = queue.push(async () => {});
const res3 = queue.push(async () => {});

// res1 and res2 are Promises that resolve when the task is finished.
// res3 is null, because the queue is full.
```

### React to queue position changes

In this example, the task will log the queue position whenever it changes.

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue();

queue.push(async () => {});
queue.push(
  async () => {},
  (pos) => {
    if (pos === 0) {
      console.log(`Task is no longer queued and running`);
    } else {
      console.log(`This task is at queue position ${pos}`);
    }
  }
);
```

### Stream queue position and result

In this example, the task will stream the queue position and the task result.

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue();

const iterable = queue.pushAndIterate(async () => {});

for await (const [pos, res] of iterable!) {
  if (pos === null) {
    console.log(`Task is finished with result ${res}`);
  } else if (pos === 0) {
    console.log(`Task is no longer queued and running`);
  } else {
    console.log(`Task is at queue position ${pos}`);
  }
}
```
