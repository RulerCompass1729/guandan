import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, openSync, closeSync, chmodSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Room } from './model.js';

export interface Receipt { room: string; player: string; id: string; hash: string; version: number; }
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      closeSync(openSync(path, 'a', 0o600));
      for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) chmodSync(path + suffix, 0o600);
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(room TEXT NOT NULL, player TEXT NOT NULL,
        id TEXT NOT NULL, hash TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(room,player,id));`);
  }
  load(): Room[] {
    return (this.db.prepare('SELECT state FROM rooms').all() as { state: string }[]).map(row => {
      const room: Room = JSON.parse(row.state);
      room.seats.forEach(s => { if (s) s.connected = false; });
      return room;
    });
  }
  save(room: Room, receipt?: Receipt): void {
    const state = JSON.stringify({ ...room, seats: room.seats.map(s => s ? { ...s, connected: false } : null) });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO rooms(code,state) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state').run(room.code, state);
      if (receipt) this.db.prepare('INSERT INTO receipts(room,player,id,hash,version) VALUES(?,?,?,?,?)').run(receipt.room, receipt.player, receipt.id, receipt.hash, receipt.version);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  receipt(room: string, player: string, id: string): Receipt | null {
    return (this.db.prepare('SELECT room,player,id,hash,version FROM receipts WHERE room=? AND player=? AND id=?').get(room, player, id) as unknown as Receipt) ?? null;
  }
  close(): void { this.db.close(); }
}
