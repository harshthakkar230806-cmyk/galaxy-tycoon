/** Test helper: write a raw value directly into the game's IndexedDB store (to simulate corruption). */
export function openDB(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('galaxy-tycoon', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('saves');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}
