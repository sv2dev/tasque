type Job<T = void> = () => Promise<T>;
type ProgressListener = (progress: number) => void;

export class Queue {
  #maxJobs = 10;
  #queue = [] as [Job<any>, ProgressListener][];
  #current: Promise<any> | null = null;

  constructor(maxJobs = 10) {
    this.#maxJobs = maxJobs;
  }

  get size() {
    return this.#queue.length;
  }

  push<T = void>(job: Job<T>) {
    if (this.#queue.length >= this.#maxJobs) return null;
    const p = new Promise<T>((resolve) => {
      const wrapper = () => job().then(resolve);
      this.#queue.push([wrapper, () => {}]);
      if (this.#current === null) this.#executeNext();
    });
    return p;
  }

  async #executeNext() {
    while (this.#queue.length > 0) {
      const [job] = this.#queue.shift()!;
      await (this.#current = job());
    }
  }
}
