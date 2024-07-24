import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Flashcard from './Flashcard';
import './App.css';

const App = () => {
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  const nextCard = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length);
  };

  const prevCard = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + words.length) % words.length);
  };

  return (
    <div className="App">
      <h1>Flashcard App</h1>
      <div className="flashcard-container">
        {words.length > 0 && <Flashcard word={words[currentIndex]} />}
      </div>
      <div className="navigation">
        <button className="nav-button" onClick={prevCard}>◀</button>
        <button className="nav-button" onClick={nextCard}>▶</button>
      </div>
    </div>
  );
};

export default App;
