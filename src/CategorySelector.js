import React from 'react';
import './CategorySelector.css';

/** Kanji first, then kana decks, for Japanese category modal. */
const JAPANESE_CATEGORY_ORDER = ['kanji', 'hiragana', 'katakana'];

function getOrderedCategoryEntries(categories, language) {
  const entries = Object.entries(categories);
  if (language !== 'japanese') return entries;
  return [...entries].sort(([keyA], [keyB]) => {
    const ia = JAPANESE_CATEGORY_ORDER.indexOf(keyA);
    const ib = JAPANESE_CATEGORY_ORDER.indexOf(keyB);
    if (ia === -1 && ib === -1) return keyA.localeCompare(keyB);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function countLabel(language, n) {
  if (language === 'japanese') {
    return `${n} ${n === 1 ? 'character' : 'characters'}`;
  }
  return `${n} ${n === 1 ? 'word' : 'words'}`;
}

const CategorySelector = ({ categories, selectedCategories, onCategoryToggle, onClose, currentLanguage }) => {
  // Close modal when clicking on backdrop
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="category-modal-backdrop" onClick={handleBackdropClick}>
      <div className="category-modal">
        <div className="category-modal-header">
          <h3>Select Categories to Study</h3>
          <button className="category-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="category-modal-content">
          <div className="category-list">
            {getOrderedCategoryEntries(categories, currentLanguage).map(([key, category]) => (
              <div key={key} className="category-item">
                <label className="category-label">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(key)}
                    onChange={() => onCategoryToggle(key)}
                  />
                  <div className="category-info">
                    <span className="category-name">{category.name}</span>
                    <span className="category-description">{category.description}</span>
                    <span className="word-count">({countLabel(currentLanguage, category.words.length)})</span>
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategorySelector; 