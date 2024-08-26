import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';
import successGif from './assets/success.gif';
import { openDB } from 'idb';

function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

const App = () => {
  const [words, setWords] = useState([]);
  const [currentWord, setCurrentWord] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [detectedSpeech, setDetectedSpeech] = useState('');
  const [showSuccessGif, setShowSuccessGif] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('idle');
  const [wordStats, setWordStats] = useState({successes: 0, failures: 0});

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const response = await axios.get('/data.json');
        const wordsWithIds = response.data.common_words.map((word, index) => ({
          ...word,
          id: word.id || index + 1
        }));
        setWords(wordsWithIds);
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
      newRecognition.interimResults = true; // Added for real-time speech detection
      setRecognition(newRecognition);
    }
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
      recognition.abort();

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setSpeechStatus('listening');
        setListening(true);
      };

      recognition.onaudiostart = () => {
        console.log('Audio capturing started');
        setSpeechStatus('ready');
      };

      recognition.onspeechstart = () => {
        console.log('Speech started');
        setSpeechStatus('speaking');
      };

      recognition.onspeechend = () => {
        console.log('Speech ended');
        setSpeechStatus('processing');
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setListening(false);
        setSpeechStatus('idle');
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setListening(false);
        setSpeechStatus('error');
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        
        setDetectedSpeech(transcript.toLowerCase());
        
        // Check for final result
        if (event.results[0].isFinal) {
          const cleanTranscript = transcript.toLowerCase().trim();
          const cleanExpected = currentWord.russian.toLowerCase().trim();

          // Use levenshteinDistance here
          const distance = levenshteinDistance(cleanTranscript, cleanExpected);
          const similarity = 1 - distance / Math.max(cleanTranscript.length, cleanExpected.length);

          if (similarity > 0.8) { // 80% similarity threshold
            console.log('Success');
            playSound(successSound);
            setShowSuccessGif(true);
            setDetectedSpeech(''); // Reset detected speech on success
            setWordStats(prev => ({...prev, successes: prev.successes + 1}));
            updateWordStats(currentWord.russian, true);
            setTimeout(() => {
              setShowSuccessGif(false);
              nextRandomWord();
            }, 1000);
          } else {
            console.log('Fail');
            playSound(failSound);
            setWordStats(prev => ({...prev, failures: prev.failures + 1}));
            updateWordStats(currentWord.russian, false);
          }
        }
      };

      try {
        recognition.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setSpeechStatus('error');
      }
    } else {
      alert('Web Speech API is not supported in this browser.');
    }
  };

  useEffect(() => {
    return () => {
      if (recognition) {
        recognition.abort();
      }
    };
  }, [recognition]);

  const speakWord = useCallback(() => {
    if (currentWord && currentWord.russian) {
      const utterance = new SpeechSynthesisUtterance(currentWord.russian);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  }, [currentWord]);

  useEffect(() => {
    const initDB = async () => {
      const db = await openDB('flashcards', 1, {
        upgrade(db) {
          db.createObjectStore('wordStats', { keyPath: 'word' });
        },
      });
      return db;
    };
    initDB();
  }, []);

  const updateWordStats = useCallback(async (word, isSuccess) => {
    const db = await openDB('flashcards', 1);
    const tx = db.transaction('wordStats', 'readwrite');
    const store = tx.objectStore('wordStats');
    const item = await store.get(word);
    if (item) {
      await store.put({
        ...item,
        [isSuccess ? 'successes' : 'failures']: item[isSuccess ? 'successes' : 'failures'] + 1,
      });
    } else {
      await store.add({ word, successes: isSuccess ? 1 : 0, failures: isSuccess ? 0 : 1 });
    }
    await tx.done;
  }, []);

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      <h1>карточки</h1>
      <div className="flashcard-container">
        {showSuccessGif && <img src={successGif} alt="Success GIF" className="success-gif" />}
        <Flashcard word={currentWord} />
      </div>
      <div className="detected-speech">
        <p>
          {detectedSpeech || 'No speech detected yet'}
          {showSuccessGif && (
            <img 
              src={successGif} 
              alt="Success" 
              style={{ width: '16px', height: '16px', marginLeft: '5px', verticalAlign: 'middle' }}
            />
          )}
        </p>
      </div>
      <div className="speech-status">
        {speechStatus === 'listening' && <p>Preparing to listen...</p>}
        {speechStatus === 'ready' && <p>Ready! Please speak now.</p>}
        {speechStatus === 'speaking' && <p>Listening...</p>}
        {speechStatus === 'processing' && <p>Processing your speech...</p>}
        {speechStatus === 'error' && <p>Error occurred. Please try again.</p>}
      </div>
      <div className="button-container" style={{ position: 'relative', zIndex: 2 }}>
        <button className="nav-button" onClick={speakWord}>Play</button>
        <button
          onClick={() => {
            console.log('Test button clicked');
            startListening();
          }}
          disabled={false}
          className="nav-button"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          {listening ? 'Listening...' : 'Speak'}
        </button>
        <button className="nav-button" onClick={() => {
          console.log('Skip button clicked');
          nextRandomWord();
        }} disabled={false} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>Skip</button>
      </div>
      <div className="dark-mode-toggle" style={{ paddingTop: '20px' }}>
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          <span className="slider round">
            <img src={darkMode ? moonIcon : sunIcon} alt="mode icon" className="mode-icon" />
          </span>
        </label>
      </div>
      <div className="stats" style={{ marginTop: '20px' }}>
        <span style={{ color: 'green' }}>{wordStats.successes}</span>
        {' / '}
        <span style={{ color: 'red' }}>{wordStats.failures}</span>
      </div>
    </div>
  );
};

export default App;