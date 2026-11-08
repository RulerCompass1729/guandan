import { parentPort } from 'node:worker_threads';
import { decide, type Observation } from './policy.js';
parentPort?.on('message', (message: { id: string; observation: Observation }) => {
  try { parentPort?.postMessage({ id: message.id, decision: decide(message.observation) }); }
  catch { parentPort?.postMessage({ id: message.id, error: 'policy failed' }); }
});
