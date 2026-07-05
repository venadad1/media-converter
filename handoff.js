// ============================================================
// ClipForge — File Handoff (index.html → editor.html)
// Videos can't be passed via URL, so we stash the File object
// in IndexedDB on the landing page and pick it up on /editor.
// IndexedDB (unlike sessionStorage) can store Blob/File objects
// directly, no base64 encoding needed.
// ============================================================

const CF_DB_NAME    = 'clipforge-handoff';
const CF_STORE_NAME = 'files';
const CF_KEY        = 'pending';

function cfOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CF_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(CF_STORE_NAME)) {
        req.result.createObjectStore(CF_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Call from index.html when a file is chosen/dropped
async function cfStashFile(file) {
  const db = await cfOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CF_STORE_NAME, 'readwrite');
    tx.objectStore(CF_STORE_NAME).put(file, CF_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Call from editor.html on load — returns the file (or null) and clears it
async function cfTakeFile() {
  try {
    const db = await cfOpenDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CF_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CF_STORE_NAME);
      const getReq = store.get(CF_KEY);
      getReq.onsuccess = () => {
        const file = getReq.result || null;
        store.delete(CF_KEY);
        resolve(file);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (e) {
    console.warn('[ClipForge] handoff read failed', e);
    return null;
  }
}
