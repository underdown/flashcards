/**
 * Parse slash-separated kanji card fields into aligned { english, kana, romaji } rows.
 */
export function getKanjiVariants(word) {
  if (!word || word.categoryKey !== 'kanji') return [];
  const sep = /\s*\/\s*/;
  const rawEn = (word.english || '').split(sep).map((s) => s.trim());
  const rawKana = (word.phonetic || '').split(sep).map((s) => s.trim());
  const rawRomaji = (word.readingRomaji || '').split(sep).map((s) => s.trim());
  const n = Math.max(rawEn.length, rawKana.length, rawRomaji.length, 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      english: rawEn[i] ?? '',
      kana: rawKana[i] ?? '',
      romaji: rawRomaji[i] ?? '',
    });
  }
  return out.length ? out : [{ english: '', kana: '', romaji: '' }];
}

/** Text for Japanese TTS: active kana reading, not the whole slash-separated line. */
export function getJapaneseSpeechText(word, activeVariantIndex) {
  if (!word || word.categoryKey !== 'kanji') return word?.foreign ?? '';
  const variants = getKanjiVariants(word);
  const v = variants[activeVariantIndex];
  return (v && v.kana) || word.foreign;
}

/** English gloss for auto mode: only the active meaning when kanji. */
export function getKanjiEnglishSpeechText(word, activeVariantIndex) {
  if (!word || word.categoryKey !== 'kanji') return word?.english ?? '';
  const variants = getKanjiVariants(word);
  const v = variants[activeVariantIndex];
  return (v && v.english) || word.english;
}

/**
 * Whether speech transcript matches the expected answer for this card.
 * For kanji, only the active variant's kana (and romaji fallback) counts.
 */
export function speechMatchesExpected(transcript, word, activeKanjiVariantIndex) {
  const t = transcript.toLowerCase().trim();
  if (!word) return false;

  if (word.categoryKey === 'kanji') {
    const variants = getKanjiVariants(word);
    const v = variants[activeKanjiVariantIndex];
    if (!v) return false;
    if (v.kana && t.includes(v.kana.toLowerCase())) return true;
    if (v.romaji) {
      const r = v.romaji.toLowerCase().replace(/\s+/g, '');
      const tc = t.replace(/\s+/g, '');
      if (r.length > 0 && tc.includes(r)) return true;
    }
    if (word.foreign && t.includes(String(word.foreign).toLowerCase())) return true;
    return false;
  }

  const expected = String(word.foreign || '')
    .toLowerCase()
    .trim();
  return Boolean(expected && t.includes(expected));
}
