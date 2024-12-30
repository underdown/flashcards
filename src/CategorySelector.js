import React from 'react';
import './CategorySelector.css';

const CategorySelector = ({ categories, selectedCategories, onCategoryToggle }) => {
  return (
    <div className="category-selector">
      <h3>Select Categories to Study</h3>
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
  );
};

export default CategorySelector; 