import React from 'react';
import './CategorySelector.css';

const CategorySelector = ({ categories, selectedCategories, onCategoryToggle, onClose }) => {
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
            {Object.entries(categories).map(([key, category]) => (
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
                    <span className="word-count">({category.words.length} words)</span>
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