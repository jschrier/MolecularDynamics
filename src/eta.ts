/** Estimates a run length from the first progress event at or beyond 1%. */
export class RemainingTimeEstimator {
  private startedAt?: number;
  private estimatedTotalMs?: number;
  private lastPublishedAt?: number;

  start(now: number): void {
    this.startedAt = now;
    this.estimatedTotalMs = undefined;
    this.lastPublishedAt = undefined;
  }

  reset(): void {
    this.startedAt = undefined;
    this.estimatedTotalMs = undefined;
    this.lastPublishedAt = undefined;
  }

  update(completed: number, total: number, now: number): number | undefined {
    if (this.startedAt === undefined || total <= 0) return undefined;
    const fraction = completed / total;
    if (fraction < 0.01) return undefined;
    if (this.estimatedTotalMs === undefined) this.estimatedTotalMs = (now - this.startedAt) / fraction;
    if (this.lastPublishedAt !== undefined && now - this.lastPublishedAt < 1000) return undefined;
    this.lastPublishedAt = now;
    return Math.max(0, Math.round((this.estimatedTotalMs - (now - this.startedAt)) / 1000));
  }
}
