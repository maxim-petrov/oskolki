/** A timed animation step: engine events are replayed as a queue of these. */
export interface Step {
  dur: number;
  t?: number;
  begin?: () => void;
  tick?: (k: number) => void;
  end?: () => void;
}

export class Steps {
  list: Step[] = [];
  cur: Step | null = null;

  push(s: Step) {
    this.list.push(s);
  }

  wait(ms: number) {
    this.push({ dur: ms / 1000 });
  }

  /** Runs `fn` when the queue reaches this point. */
  then(fn: () => void) {
    this.push({ dur: 0, end: fn });
  }

  busy() {
    return this.cur !== null || this.list.length > 0;
  }

  clear() {
    this.list = [];
    this.cur = null;
  }

  run(dt: number) {
    let budget = dt;
    let guard = 0;
    while (budget > 0 && guard++ < 400) {
      if (!this.cur) {
        const next = this.list.shift();
        if (!next) break;
        this.cur = next;
        next.t = 0;
        next.begin?.();
      }
      const s = this.cur!;
      const need = s.dur - (s.t ?? 0);
      if (need <= budget) {
        s.t = s.dur;
        s.tick?.(1);
        this.cur = null;
        s.end?.();
        budget -= Math.max(need, 0);
      } else {
        s.t = (s.t ?? 0) + budget;
        s.tick?.(s.dur > 0 ? s.t / s.dur : 1);
        budget = 0;
      }
    }
  }
}
