import React from 'react';
import SpectrumBars from './SpectrumBars';

/**
 * High-density Russian flashcard (feature/russian-card-redesign).
 * Shows: English · Cyrillic · phonetic · Latinized · DTW score · stats · EQ.
 * Fallbacks to the standard Flashcard for every other language.
 */
const RussianCard = ({
  word,
  scoreFlash = null,
  speakPrompt = false,
  wordStats = null,
}) => {
  if (!word) {
    return <div className="flashcard">Loading...</div>;
  }

  const scoreAnimClass = scoreFlash?.visible
    ? `flashcard--ru ${scoreFlash.pass ? 'flashcard--score-pass' : 'flashcard--score-fail'}`
    : 'flashcard--ru';
  const cardClass = scoreAnimClass
    ? `flashcard ${scoreAnimClass} ${scoreFlash?.visible ? `flashcard--score-in` : ''}`
    : 'flashcard flashcard--ru';

  const chip = scoreFlash?.visible ? (
    <div className="score-flash" role="status" aria-live="polite">
      <span className="score-flash-value">
        {typeof scoreFlash.score === 'number' ? Math.round(scoreFlash.score) : scoreFlash.pass ? 100 : 0}
      </span>
      <span className="score-flash-label">{scoreFlash.pass ? 'pass' : 'try again'}</span>
    </div>
  ) : speakPrompt ? (
    <div className="score-flash score-flash--speak">
      <span className="score-flash-label score-flash-speak-text">speak</span>
    </div>
  ) : null;

  const total = (wordStats?.successes || 0) + (wordStats?.failures || 0);
  const mastery = total > 0 ? Math.round((wordStats.successes / total) * 100) : null;
  const streak = wordStats?.streak || 0;
  const bestStreak = wordStats?.bestStreak || 0;

  return (
    <div className={cardClass} key={scoreFlash?.visible ? `s-${scoreFlash.id}` : undefined}>
      <div className="content content--ru">
        <div className="ru-head">
          <span className="ru-tag">RU</span>
          <span className="ru-sub">{word.categoryKey || 'word'}</span>
        </div>

        <p className="english english--ru">{word.english}</p>

        <div className="ru-main">
          <h2 className="foreign foreign--ru">{word.foreign}</h2>
          {chip}
        </div>

        {word.phonetic && (
          <p className="phonetic phonetic--ru">{word.phonetic}</p>
        )}
        {word.readingRomaji && (
          <p className="phonetic-latin phonetic-latin--ru">{word.readingRomaji}</p>
        )}

        <div className="ru-stats">
          <div className="ru-stat">
            <span className="ru-stat-value">{total}</span>
            <span className="ru-stat-label">reps</span>
          </div>
          <div className="ru-stat">
            <span className="ru-stat-value">
              {mastery === null ? '—' : `${mastery}%`}
            </span>
            <span className="ru-stat-label">mastery</span>
          </div>
          <div className="ru-stat">
            <span className={`ru-stat-value ${streak > 0 ? 'ru-stat-value--streak' : ''}`}>
              {streak}
            </span>
            <span className="ru-stat-label">streak</span>
          </div>
          <div className="ru-stat">
            <span className="ru-stat-value">{bestStreak}</span>
            <span className="ru-stat-label">best</span>
          </div>
        </div>
      </div>
      <div className="card-eq">
        <SpectrumBars height={56} />
      </div>
    </div>
  );
};

export default RussianCard;
