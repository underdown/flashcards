import React from 'react';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import { useTheme } from './ThemeContext';

const HomePage = () => {
  const { darkMode, toggleDarkMode } = useTheme();

  return (
    <div
      className={`App home-page-wrapper ${darkMode ? 'dark-mode' : ''}`}
      style={{ position: 'relative', zIndex: 1 }}
    >
      <div className="home-page">
        <h1>Welcome</h1>
        <p>Select a language to start practicing:</p>
        <div className="language-links">
          <a href="/russian" className="language-link button">
            Russian
          </a>
          <a href="/spanish" className="language-link button">
            Spanish
          </a>
          <a href="/chinese" className="language-link button">
            Chinese
          </a>
          <a href="/japanese" className="language-link button">
            Japanese
          </a>
        </div>
      </div>
      <div className="dark-mode-toggle home-page-theme-toggle">
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          <span className="slider round">
            <img src={darkMode ? moonIcon : sunIcon} alt="" className="mode-icon" />
          </span>
        </label>
      </div>
    </div>
  );
};

export default HomePage;
