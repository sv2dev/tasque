# @sv2dev/queue

A simple TypeScript task queue.

## Features

- [x] Limit the maximum job queue size.
- [x] Specify the number of concurrent jobs.
- [ ] React to queue position changes.

## Usage

```ts
import { Queue } from "@sv2dev/queue";

const queue = new Queue();

const job1 = queue.push(async () => {
  // do something
});

const job2 = queue.push(async () => {
  // do something
});

await job1;
await job2;
```
