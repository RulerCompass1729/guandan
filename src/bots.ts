import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { Decision, Observation } from './policy.js';

export class Bots {
  private workers = new Map<string, Worker>();
  async choose(key: string, observation: Observation): Promise<Decision> {
    let worker = this.workers.get(key);
    if (!worker) {
      worker = new Worker(new URL('./bot-worker.js', import.meta.url), { env: {}, resourceLimits: { maxOldGenerationSizeMb: 64 } });
      this.workers.set(key, worker);
      worker.on('error', () => { this.workers.delete(key); });
    }
    const w = worker, id = randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); w.off('message', message); w.off('error', failed); w.off('exit', exited); };
      const failed = (error: Error) => { cleanup(); reject(error); };
      const exited = () => failed(new Error('policy worker stopped'));
      const message = (value: { id: string; decision?: Decision; error?: string }) => {
        if (value.id !== id) return;
        cleanup(); value.decision ? resolve(value.decision) : reject(new Error('policy unavailable'));
      };
      const timeout = setTimeout(() => { cleanup(); this.release(key); reject(new Error('policy timed out')); }, 4000);
      w.on('message', message); w.once('error', failed); w.once('exit', exited);
      // Structured cloning crosses the worker boundary. No room, DB handle, or credentials.
      w.postMessage({ id, observation });
    });
  }
  release(key: string): void { const w = this.workers.get(key); this.workers.delete(key); if (w) void w.terminate(); }
  releaseRoom(code: string): void { for (const key of this.workers.keys()) if (key.startsWith(code + ':')) this.release(key); }
  async close(): Promise<void> { await Promise.all([...this.workers.values()].map(w => w.terminate())); this.workers.clear(); }
}
