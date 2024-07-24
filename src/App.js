import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Flashcard from './Flashcard';
import './App.css';

const App = () => {
  const [words, setWords] = useState([]);

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

  return (
    <div className="App">
      <h1>Flashcard App</h1>
      <div className="flashcard-container">
        {words.map((word, index) => (
          <Flashcard key={index} word={word} />
        ))}
      </div>
    </div>
  );
};

export default App;
