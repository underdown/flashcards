import { openDB } from 'idb';

const dbPromise = openDB('FlashcardStats', 1, {
  upgrade(db) {
    db.createObjectStore('word_stats', { keyPath: 'id' });
  },
});

export const updateWordStats = async (wordId, isSuccess) => {
  const db = await dbPromise;
  const tx = db.transaction('word_stats', 'readwrite');
  const store = tx.objectStore('word_stats');

  const existingStats = await store.get(wordId);
  if (existingStats) {
    if (isSuccess) {
      existingStats.successes += 1;
    } else {
      existingStats.failures += 1;
    }
    await store.put(existingStats);
  } else {
    await store.add({
      id: wordId,
      successes: isSuccess ? 1 : 0,
      failures: isSuccess ? 0 : 1,
    });
  }

  await tx.done;
};

export const getWordStats = async (wordId) => {
  const db = await dbPromise;
  const stats = await db.get('word_stats', wordId);
  return stats || { id: wordId, successes: 0, failures: 0 };
};