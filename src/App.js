import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';

const App = () => {
  const [words, setWords] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

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

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const newRecognition = new window.webkitSpeechRecognition();
      newRecognition.lang = 'ru-RU';
      newRecognition.continuous = false;
      newRecognition.interimResults = false;
      setRecognition(newRecognition);
    }
  }, []);

  const nextRandomWord = () => {
    setCurrentWord(words[Math.floor(Math.random() * words.length)]);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const playSound = useCallback((sound) => {
    const audio = new Audio(sound);
    audio.play().catch(error => console.error('Error playing sound:', error));
  }, []);

  const startListening = () => {
    if (recognition) {
      let resultReceived = false;

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setListening(true);
        resultReceived = false;
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setListening(false);
        if (!resultReceived) {
          console.log('No speech detected');
          playSound(failSound);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setListening(false);
        playSound(failSound);
      };

      recognition.onresult = (event) => {
        resultReceived = true;
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log('Recognized:', transcript);
        console.log('Expected:', currentWord.russian.toLowerCase());
        if (transcript === currentWord.russian.toLowerCase()) {
          console.log('Success');
          playSound(successSound);
          setTimeout(() => {
            alert('Success!');
            nextRandomWord();
          }, 500);
        } else {
          console.log('Fail');
          playSound(failSound);
        }
      };

      recognition.start();
    } else {
      alert('Web Speech API is not supported in this browser.');
    }
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
      <h1>Russian Flashcards</h1>
      <div className="flashcard-container">
        {currentWord && <Flashcard word={currentWord} />}
      </div>
      <div className="button-container">
        <button
          onClick={startListening}
          disabled={listening}
          className="nav-button"
        >
          {listening ? 'Listening...' : 'Test'}
        </button>
        <button className="nav-button" onClick={nextRandomWord}>Skip</button>
      </div>
      <div className="navigation">
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          <span className="slider round">
            <img src={darkMode ? moonIcon : sunIcon} alt="mode icon" className="mode-icon" />
          </span>
        </label>
      </div>
    </div>
  );
};

export default App;