// IndexedDB persistence via idb-keyval. Two separate databases — one for
// the in-progress snapshot, one for completed game records.
//
// idb-keyval's `createStore(dbName, storeName)` opens the named DB at
// version 1 with one object store. Putting two stores in the same DB
// requires manual `idb` setup; using separate DBs is the path of least
// resistance and gives us per-domain isolation (clearing history doesn't
// touch the resume snapshot, and vice versa).

import { UseStore, createStore, del, get, keys, set } from 'idb-keyval';
import type { Action } from '@/engine/actions';
import type { GameState } from '@/engine/state';
import type { GameRecord } from './records';

const CURRENT_DB = 'mille-bornes-current';
const COMPLETED_DB = 'mille-bornes-completed';

let _currentStore: UseStore | null = null;
let _completedStore: UseStore | null = null;

function currentStore(): UseStore {
  if (!_currentStore) _currentStore = createStore(CURRENT_DB, 'kv');
  return _currentStore;
}

function completedStore(): UseStore {
  if (!_completedStore) _completedStore = createStore(COMPLETED_DB, 'kv');
  return _completedStore;
}

// Used in tests to reset state.
export function resetStoresForTesting(): void {
  _currentStore = null;
  _completedStore = null;
}

// --- in-progress game ---

export type CurrentGameSnapshot = {
  readonly state: GameState;
  readonly actionLog: ReadonlyArray<Action>;
  readonly seed: number;
  readonly ruleIds: ReadonlyArray<string>;
  readonly startedAt: string;
};

const CURRENT_KEY = 'current';

export async function saveCurrentGame(snapshot: CurrentGameSnapshot): Promise<void> {
  await set(CURRENT_KEY, snapshot, currentStore());
}

export async function loadCurrentGame(): Promise<CurrentGameSnapshot | undefined> {
  return get<CurrentGameSnapshot>(CURRENT_KEY, currentStore());
}

export async function clearCurrentGame(): Promise<void> {
  await del(CURRENT_KEY, currentStore());
}

// --- completed games ---

export async function appendCompletedGame(record: GameRecord): Promise<void> {
  await set(record.id, record, completedStore());
}

export async function getCompletedGame(id: string): Promise<GameRecord | undefined> {
  return get<GameRecord>(id, completedStore());
}

export async function listCompletedGameIds(): Promise<string[]> {
  const ks = await keys(completedStore());
  return ks.filter((k): k is string => typeof k === 'string');
}
