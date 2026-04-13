/** Category keys that use kanji variant UI (multi-reading cards, TTS, speech). */
const KANJI_CATEGORY_KEYS = new Set(['kanji', 'kanji_beginner_ii']);

export function isKanjiCategory(categoryKey) {
  return KANJI_CATEGORY_KEYS.has(categoryKey);
}
