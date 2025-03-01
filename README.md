# @sv2dev/queue

A simple TypeScript task queue.

This library is built with low overhead in mind: [![bundle size](https://badgen.net/bundlephobia/minzip/@sv2dev/queue)](https://bundlephobia.com/package/@sv2dev/queue)

## Features

- [🏎️ Specify the number of parallel tasks](#parallel-execution)
- [🔒 Define capacity](#queue-capacity)
- [⏱️ React to queue position changes](#react-to-queue-position-changes)
- [⏭️ Stream queue position and result](#stream-queue-position-and-result)
- [🚫 Discard tasks](#discard-tasks)

## Installation

You can install this package using your favorite package manager from [npm](https://www.npmjs.com/package/@sv2dev/queue) or [jsr](https://jsr.io/@sv2dev/queue).

you can pick one of the following commands:

```bash
# npm
npm install @sv2dev/queue
bun install @sv2dev/queue
pnpm install @sv2dev/queue
yarn install @sv2dev/queue
deno add npm:@sv2dev/queue
# jsr
npx jsr add @sv2dev/queue
bunx jsr add @sv2dev/queue
pnpm dlx jsr add @sv2dev/queue
yarn dlx jsr add @sv2dev/queue
deno add jsr:@sv2dev/queue
```

## Usage

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue();
```

### Sequential execution

In this example, the tasks are executed one after the other.

```ts
queue.add(async () => {});
queue.add(async () => {});
```

### Synchronous tasks

You can also add synchronous tasks to the queue.

```ts
queue.add(async () => {});
queue.add(() => {});
```

### Parallel execution

In this example, always two tasks are executed in parallel. If one task is finished, another one is started.

```ts
const queue = new Queue({ parallelize: 2 });

queue.add(async () => {});
queue.add(async () => {});
queue.add(async () => {});
queue.add(async () => {});
```

You can also use the `parallelize` property to change the number of parallel tasks at runtime.

Scaling up the number of parallel tasks will immediately start queued tasks to match the new parallel count.

```ts
// schedule some tasks
queue.parallelize = 3;
// more of these tasks will be executed in parallel
```

Scaling down the number of parallel tasks will not affect already running tasks, but queued tasks will wait
until the number of running tasks is reduced to the new parallel count.

```ts
const queue = new Queue({ parallelize: 3 });
// schedule some tasks
queue.parallelize = 1;
// less tasks will be executed in parallel when the running tasks are finished
```

### Queue capacity

The queue will reject new tasks if it is full. By default, the queue can hold an arbitrary number of tasks.
But the capacity can be limited by setting the `max` option.

```ts
const queue = new Queue({ max: 2 });

const res1 = queue.add(async () => {});
const res2 = queue.add(async () => {});
const res3 = queue.add(async () => {});

// res1 and res2 are Promises that resolve when the task is finished.
// res3 is null, because the queue is full.
```

You can also change the capacity at runtime. This will not affect already queued tasks.

```ts
queue.max = 1;
```

### React to queue position changes

In this example, the task will log the queue position whenever it changes.

```ts
queue.add(
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
const iterable = queue.add(async () => {});

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

### Streaming tasks

Tasks that not only return a result but yield values can be streamed as well.

```ts
const iterable = queue.add(async function* () {
  yield "Hello,";
  yield "world!";
});

for await (const [pos, res] of iterable!) {
  if (pos === null) {
    console.log(`The task yielded this value: ${res}`);
  }
}
```

### Discard tasks

If you want to discard a task, you have to use iterable version of the `add` method.

```ts
const iterable = queue.add(async () => {});

for await (const [pos, res] of iterable!) {
  break; // Discards the task
}
```

This only works if the task is not already running.
