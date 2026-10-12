import React, { useState } from 'react';
import { useTheme } from './ThemeContext';
import SpectrumBars from './SpectrumBars';

/**
 * Toy-handheld Russian flashcard (feature/russian-card-redesign).
 * Everything lives inside the card: word, stats, AUTO + SKIP controls,
 * EQ, and a MENU button (top right) that opens the in-card menu.
 */
const RussianCard = ({
  word,
  scoreFlash = null,
  speakPrompt = false,
  wordStats = null,
  onAutoToggle,
  isAutoActive = false,
  onSkip,
  onOpenMenu,
}) => {
  const { darkMode, toggleDarkMode } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!word) {
    return <div className="flashcard">Loading...</div>;
  }

  const scoreAnimClass = scoreFlash?.visible
    ? `flashcard--ru ${scoreFlash.pass ? 'flashcard--score-pass' : 'flashcard--score-fail'}`
    : 'flashcard--ru';
  const cardClass = scoreAnimClass
    ? `flashcard ${scoreAnimClass} ${scoreFlash?.visible ? 'flashcard--score-in' : ''}`
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
      {/* top bar: RU tag / category, MENU button top-right */}
      <div className="ru-head">
        <div className="ru-head-left">
          <span className="ru-tag">RU</span>
          <span className="ru-sub">{word.categoryKey || 'word'}</span>
        </div>
        <button
          type="button"
          className="ru-menu-btn"
          onClick={() => (onOpenMenu ? onOpenMenu() : setMenuOpen((v) => !v))}
          aria-label="Menu"
          title="Menu"
        >
          MENU
        </button>
      </div>

      <div className="content content--ru">
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

        {/* toy controls inside the card: AUTO + SKIP */}
        <div className="ru-controls">
          <button
            type="button"
            className={`ru-ctl-btn ru-ctl-auto ${isAutoActive ? 'ru-ctl-active' : ''}`}
            onClick={onAutoToggle}
            aria-label={isAutoActive ? 'Stop auto practice' : 'Auto practice'}
            title={isAutoActive ? 'Stop' : 'Auto'}
          >
            <span className="ru-ctl-icon">{isAutoActive ? '■' : '▶'}</span>
            <span className="ru-ctl-text">{isAutoActive ? 'STOP' : 'AUTO'}</span>
          </button>
          <button
            type="button"
            className="ru-ctl-btn ru-ctl-skip"
            onClick={onSkip}
            aria-label="Skip card"
            title="Skip"
          >
            <span className="ru-ctl-icon">→</span>
            <span className="ru-ctl-text">SKIP</span>
          </button>
        </div>
      </div>

      <div className="card-eq">
        <SpectrumBars height={56} />
      </div>

      {/* in-card menu overlay */}
      {menuOpen && (
        <div className="ru-menu-backdrop" onClick={() => setMenuOpen(false)} role="presentation">
          <div className="ru-menu" role="dialog" aria-modal="true" aria-label="Menu"
               onClick={(e) => e.stopPropagation()}>
            <div className="ru-menu-header">
              <span className="ru-menu-title">MENU</span>
              <button type="button" className="ru-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="ru-menu-body">
              <button
                type="button"
                className="ru-menu-item"
                onClick={() => { toggleDarkMode(); }}
              >
                <span className="ru-menu-item-label">{darkMode ? '☾ Dark mode' : '☀ Light mode'}</span>
                <span className="ru-menu-item-state">{darkMode ? 'ON' : 'OFF'}</span>
              </button>
              <button
                type="button"
                className="ru-menu-item"
                onClick={() => { setMenuOpen(false); onOpenMenu && onOpenMenu(); }}
              >
                <span className="ru-menu-item-label">Card packs</span>
                <span className="ru-menu-item-state">›</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RussianCard;
