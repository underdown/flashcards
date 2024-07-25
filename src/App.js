import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Flashcard from './Flashcard';
import './App.css';

const App = () => {
  const [words, setWords] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const response = await axios.get('/data.json');
        setWords(response.data.common_words);
      } catch (error) {
        console.error('Error fetching the words:', error);
      }
    };

    fetchWords();
  }, []);

  useEffect(() => {
    if (words.length > 0) {
      setCurrentWord(words[Math.floor(Math.random() * words.length)]);
    }
  }, [words]);

  const nextRandomWord = () => {
    setCurrentWord(words[Math.floor(Math.random() * words.length)]);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
      <h1>карточки</h1>
      <div className="flashcard-container">
        {currentWord && <Flashcard word={currentWord} />}
      </div>
      <div className="navigation">
        <button className="nav-button" onClick={nextRandomWord}>Next Random Word</button>
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          <span className="slider round"></span>
        </label>
        <a href="https://x.com/youlikeryan" target="_blank" rel="noopener noreferrer" className="twitter-link">
          @youlikeryan
        </a>
      </div>
    </div>
  );
};

export default App;
