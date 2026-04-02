import React from 'react';
import { getKanjiVariants } from './kanjiVariants';

const ROMAJIDESU_KANJI_BASE = 'https://www.romajidesu.com/kanji/';

const Flashcard = ({ word, activeKanjiVariantIndex = 0, onCycleKanjiVariant }) => {
  if (!word) {
    return <div className="flashcard">Loading...</div>;
  }

  const isKanji = word.categoryKey === 'kanji';
  const variants = isKanji ? getKanjiVariants(word) : [];
  const activeIdx =
    isKanji && typeof activeKanjiVariantIndex === 'number'
      ? Math.min(activeKanjiVariantIndex, Math.max(0, variants.length - 1))
      : 0;
  const showVariantUi = isKanji && variants.length > 0;
  const canCycle = Boolean(onCycleKanjiVariant) && variants.length > 1;

  const kanjiLookupUrl =
    isKanji && word.foreign
      ? `${ROMAJIDESU_KANJI_BASE}${encodeURIComponent(word.foreign)}`
      : null;

  return (
    <div className="flashcard">
      <div className="content">
        {showVariantUi ? (
          <div
            className={canCycle ? 'kanji-variant-block kanji-variant-block--clickable' : 'kanji-variant-block'}
            onClick={canCycle ? onCycleKanjiVariant : undefined}
            onKeyDown={
              canCycle
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCycleKanjiVariant();
                    }
                  }
                : undefined
            }
            role={canCycle ? 'button' : undefined}
            tabIndex={canCycle ? 0 : undefined}
            title={
              canCycle ? 'Click to switch which reading you are practicing' : undefined
            }
          >
            <p className="english kanji-variant-row">
              {variants.map((v, i) => (
                <span
                  key={`en-${i}`}
                  className={`variant-chip ${i === activeIdx ? 'variant-chip--active' : 'variant-chip--muted'}`}
                >
                  {v.english || '—'}
                </span>
              ))}
            </p>
            <h2 className="foreign">
              {kanjiLookupUrl ? (
                <a
                  href={kanjiLookupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="foreign-kanji-link"
                  title="Look up this kanji on RomajiDesu"
                  onClick={(e) => e.stopPropagation()}
                >
                  {word.foreign}
                </a>
              ) : (
                word.foreign
              )}
            </h2>
            <p className="phonetic kanji-variant-row">
              {variants.map((v, i) => (
                <span
                  key={`kana-${i}`}
                  className={`variant-chip variant-chip--kana ${i === activeIdx ? 'variant-chip--active' : 'variant-chip--muted'}`}
                >
                  {v.kana || '—'}
                </span>
              ))}
            </p>
            {word.readingRomaji && (
              <p className="phonetic-latin kanji-variant-row">
                {variants.map((v, i) => (
                  <span
                    key={`ro-${i}`}
                    className={`variant-chip variant-chip--romaji ${i === activeIdx ? 'variant-chip--active' : 'variant-chip--muted'}`}
                  >
                    {v.romaji || '—'}
                  </span>
                ))}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="english">{word.english}</p>
            <h2 className="foreign">
              {kanjiLookupUrl ? (
                <a
                  href={kanjiLookupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="foreign-kanji-link"
                  title="Look up this kanji on RomajiDesu"
                >
                  {word.foreign}
                </a>
              ) : (
                word.foreign
              )}
            </h2>
            <p className="phonetic">{word.phonetic}</p>
            {word.readingRomaji && (
              <p className="phonetic-latin">{word.readingRomaji}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Flashcard;
