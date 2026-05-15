// Install fake-indexeddb as the global IDBFactory so persistence tests
// (and any test that touches idb-keyval) work in the Node test environment.
import 'fake-indexeddb/auto';
