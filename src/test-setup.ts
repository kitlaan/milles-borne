// Install fake-indexeddb as the global IDBFactory so persistence tests
// (and any test that touches idb-keyval) work in the Node test environment.
import 'fake-indexeddb/auto';

// Lightweight in-memory localStorage shim — enough for settings round-trip
// tests without dragging in jsdom. Real browsers provide a full
// implementation; this just covers get/set/remove/clear.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    writable: false,
    configurable: true,
  });
}
