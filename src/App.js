import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';
import successGif from './assets/success.gif';

const App = () => {
  const [words, setWords] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [detectedSpeech, setDetectedSpeech] = useState('');
  const [showSuccessGif, setShowSuccessGif] = useState(false);

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
    const newRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    newRecognition.continuous = false;
    newRecognition.interimResults = true;
    newRecognition.lang = 'ru-RU';

    setRecognition(newRecognition);

    return () => {
      if (newRecognition) {
        newRecognition.abort();
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode ? '#333' : '#fff';
    document.body.style.backgroundColor = darkMode ? '#333' : '#fff';
  }, [darkMode]);

  const nextRandomWord = () => {
    console.log('Skip button clicked');
    let newWord;
    do {
      newWord = words[Math.floor(Math.random() * words.length)];
    } while (newWord === currentWord);
    setCurrentWord(newWord);
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
      // Stop any ongoing recognition
      recognition.abort();

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setListening(true);
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setListening(false);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setListening(false);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('').toLowerCase();

        setDetectedSpeech(transcript);

        if (event.results[0].isFinal) {
          if (transcript === currentWord.russian.toLowerCase()) {
            console.log('Success');
            playSound(successSound);
            setShowSuccessGif(true);
            setTimeout(() => {
              setShowSuccessGif(false);
              nextRandomWord();
            }, 1000);
          } else {
            console.log('Fail');
            playSound(failSound);
          }
          recognition.stop();
        }
      };

      try {
        recognition.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (recognition) {
        recognition.abort();
      }
    };
  }, [recognition]);

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      <h1>карточки</h1>
      <div className="flashcard-container">
        {showSuccessGif && <img src={successGif} alt="Success GIF" className="success-gif" />}
        <Flashcard word={currentWord} />
      </div>
      <div className="detected-speech">
        <p>{detectedSpeech || 'No speech detected yet'}</p>
      </div>
      <div className="button-container" style={{ position: 'relative', zIndex: 2 }}>
        <button
          onClick={() => {
            console.log('Test button clicked');
            startListening();
          }}
          disabled={false}
          className="nav-button"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          {listening ? 'Listening...' : 'Test'}
        </button>
        <button className="nav-button" onClick={() => {
          console.log('Skip button clicked');
          nextRandomWord();
        }} disabled={false} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>Skip</button>
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