// Локальное резервное хранилище (IndexedDB + localStorage).

const DB_NAME = 'toe26_persistence';
const DB_VERSION = 1;
const DB_STORE = 'data';

function openPersistenceDB() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступна'));
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const dbLocal = request.result;
            if (!dbLocal.objectStoreNames.contains(DB_STORE)) dbLocal.createObjectStore(DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Ошибка IndexedDB'));
    });
}

export async function dbPut(key, value) {
    const dbLocal = await openPersistenceDB();
    return new Promise((resolve, reject) => {
        const tx = dbLocal.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = () => { dbLocal.close(); resolve(true); };
        tx.onerror = () => { dbLocal.close(); reject(tx.error); };
    });
}

export async function dbGet(key) {
    const dbLocal = await openPersistenceDB();
    return new Promise((resolve, reject) => {
        const tx = dbLocal.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => { dbLocal.close(); resolve(req.result || null); };
        req.onerror = () => { dbLocal.close(); reject(req.error); };
    });
}

export async function dbDelete(key) {
    const dbLocal = await openPersistenceDB();
    return new Promise((resolve, reject) => {
        const tx = dbLocal.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = () => { dbLocal.close(); resolve(true); };
        tx.onerror = () => { dbLocal.close(); reject(tx.error); };
    });
}

export async function savePersistentValue(key, value) {
    localStorage.setItem(key, value);
    try { await dbPut(key, value); } catch (e) { console.warn('Резервное сохранение не сработало', e); }
}
