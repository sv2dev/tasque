# tasque

<img src="./logo.svg" alt="tasque logo" width="200" />

A simple TypeScript task queue.

This library is built with low overhead in mind: [![bundle size](https://badgen.net/bundlephobia/minzip/tasque)](https://bundlephobia.com/package/tasque)

## Features

- [🏎️ Specify the number of parallel tasks](#parallel-execution)
- [🔒 Define capacity](#queue-capacity)
- [⏱️ React to queue position changes](#react-to-queue-position-changes)
- [⏭️ Stream queue position and values](#stream-queue-position-and-values)
- [🚫 Discard tasks](#discard-tasks)

## Installation

You can install this package using your favorite package manager from [npm](https://www.npmjs.com/package/tasque) or [jsr](https://jsr.io/@sv2dev/tasque).

you can pick one of the following commands:

```bash
# npm
npm install tasque
bun install tasque
pnpm install tasque
yarn install tasque
deno add npm:tasque
# jsr
npx jsr add @sv2dev/tasque
bunx jsr add @sv2dev/tasque
pnpm dlx jsr add @sv2dev/tasque
yarn dlx jsr add @sv2dev/tasque
deno add jsr:@sv2dev/tasque
```

## Usage

```ts
import { Tasque } from "tasque";

const queue = new Tasque();
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
const queue = new Tasque({ parallelize: 2 });

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
const queue = new Tasque({ parallelize: 3 });
// schedule some tasks
queue.parallelize = 1;
// less tasks will be executed in parallel when the running tasks are finished
```

### Tasque capacity

The queue will reject new tasks if it is full. By default, the queue can hold an arbitrary number of tasks.
But the capacity can be limited by setting the `max` option.

```ts
const queue = new Tasque({ max: 2 });

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

In this example, a position listener is passed to the `add` method. It will be called every time the queue position changes.

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

Alternatively, you can also use the `listener` option to pass a listener function to the `add` method.

```ts
queue.add(async () => {}, {
  listener: (pos) => {
    console.log(`This task is at queue position ${pos}`);
  },
});
```

### Stream queue position and values

In this example, the task will stream the queue position and the task values.

```ts
const iterable = queue.iterate(async () => {});

for await (const [pos, value] of iterable!) {
  if (pos === null) {
    console.log(`Task emitted a value: ${value}`);
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
const iterable = queue.iterate(async function* () {
  yield "Hello,";
  yield "world!";
});

for await (const [pos, value] of iterable!) {
  if (pos === null) {
    console.log(`The task yielded this value: ${value}`);
  }
}
```

This can also be used with the `add` method. In this case, only the last yielded value is returned.

```ts
const result = await queue.add(async function* () {
  yield "Hello,";
  yield "world!";
});

console.log(result); // "world!"
```

### Discard tasks

There are several ways to discard tasks.

#### Breaking iteration

If you have an iterable, you can break the iteration to discard the task.

```ts
const iterable = queue.iterate(async () => {});

for await (const [pos, value] of iterable!) {
  break; // Discards the task
}
```

This only works if the task is not already running.

#### Aborting tasks

If you pass an `AbortSignal` to the `add` or `iterate` method, the task will be discarded if the signal is aborted.

```ts
const ctrl = new AbortController();
const promise = queue.add(async () => {}, { signal: ctrl.signal });
```

You can also pass the `AbortSignal` directly as the options object.

```ts
const ctrl = new AbortController();
const promise = queue.add(async () => {}, ctrl.signal);
```

For example, if you want to discard a task after a certain time, you can do something like this:

```ts
const promise = queue.add(async () => {}, AbortSignal.timeout(10_000));
```
