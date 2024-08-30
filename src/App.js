import React, { useEffect, useState, useCallback, useRef } from 'react';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';
import successGif from './assets/success.gif';
import { openDB } from 'idb';

const DB_VERSION = 1; // Increment this when changing DB schema

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

const languageCodes = {
  russian: 'ru-RU',
  spanish: 'es-ES'
};

const App = () => {
  const [words, setWords] = useState([]);
  const [currentLanguage, setCurrentLanguage] = useState('russian');
  const [currentWord, setCurrentWord] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [detectedSpeech, setDetectedSpeech] = useState('');
  const [showSuccessGif, setShowSuccessGif] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('idle');
  const [wordStats, setWordStats] = useState({ successes: 0, failures: 0 });
  const [audioContext, setAudioContext] = useState(null);
  const audioBuffersRef = useRef({});
  const [currentWordStats, setCurrentWordStats] = useState(null);

  const ensureAudioContextRunning = useCallback(async () => {
    if (audioContext && audioContext.state !== 'running') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
      }
    }
  }, [audioContext]);

  const playSound = useCallback((sound) => {
    ensureAudioContextRunning().then(() => {
      const audio = new Audio(sound);
      audio.play().catch(error => console.error('Error playing sound:', error));
    });
  }, [ensureAudioContextRunning]);

  useEffect(() => {
    fetch('/data.json')
      .then(response => response.json())
      .then(data => {
        setWords(data[currentLanguage].words || []);
      })
      .catch(error => console.error('Error loading words:', error));
  }, [currentLanguage]);

  useEffect(() => {
    if (words.length > 0) {
      setCurrentWord(words[Math.floor(Math.random() * words.length)]);
    }
  }, [words]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const newRecognition = new window.webkitSpeechRecognition();
      newRecognition.lang = languageCodes[currentLanguage] || 'en-US';
      newRecognition.continuous = false;
      newRecognition.interimResults = true;
      setRecognition(newRecognition);
    }
  }, [currentLanguage]);

  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode ? '#333' : '#fff';
    document.body.style.backgroundColor = darkMode ? '#333' : '#fff';
  }, [darkMode]);

  useEffect(() => {
    if (currentWord) {
      updateCurrentWordStats(currentWord.foreign);
    }
  }, [currentWord]);

  const updateCurrentWordStats = useCallback(async (word) => {
    const db = await openDB('flashcards', DB_VERSION);
    const tx = db.transaction('wordStats', 'readonly');
    const store = tx.objectStore('wordStats');
    const stats = await store.get(word) || { word, successes: 0, failures: 0 };
    setCurrentWordStats(stats);
    await tx.done;
  }, []);

  const nextRandomWord = useCallback(() => {
    let newWord;
    do {
      newWord = words[Math.floor(Math.random() * words.length)];
    } while (newWord === currentWord);
    setCurrentWord(newWord);
  }, [words, currentWord]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

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

        const cleanTranscript = transcript.toLowerCase().trim();
        const cleanExpected = currentWord.foreign.toLowerCase().trim();
        setDetectedSpeech(cleanTranscript);

        // Check for match immediately
        const distance = levenshteinDistance(cleanTranscript, cleanExpected);
        const similarity = 1 - distance / Math.max(cleanTranscript.length, cleanExpected.length);

        if (similarity > 0.8) { // 80% similarity threshold
          console.log('Success');
          recognition.abort(); // Stop listening immediately
          playSound(successSound);
          setShowSuccessGif(true);
          setWordStats(prev => ({ ...prev, successes: prev.successes + 1 }));
          updateWordStats(currentWord.foreign, true, similarity);

          setTimeout(() => {
            setDetectedSpeech('');
            setShowSuccessGif(false);
            nextRandomWord();
          }, 1000);
        }
      };

      try {
        recognition.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setSpeechStatus('error');
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

  const speakWord = useCallback(() => {
    if (currentWord && currentWord.foreign) {
      const utterance = new SpeechSynthesisUtterance(currentWord.foreign);
      utterance.lang = languageCodes[currentLanguage] || 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [currentWord, currentLanguage]);

  useEffect(() => {
    const initDB = async () => {
      const db = await openDB('flashcards', DB_VERSION, {
        upgrade(db, oldVersion) {
          if (!db.objectStoreNames.contains('wordStats')) {
            db.createObjectStore('wordStats', { keyPath: 'word' });
          }
        },
      });
      return db;
    };
    initDB();

    const loadTotalStats = async () => {
      const db = await openDB('flashcards', DB_VERSION);
      const allStats = await db.getAll('wordStats');
      const totalStats = allStats.reduce((acc, curr) => ({
        successes: acc.successes + (curr.successes || 0),
        failures: acc.failures + (curr.failures || 0),
      }), { successes: 0, failures: 0 });
      setWordStats(totalStats);
    };
    loadTotalStats();
  }, []);

  const updateWordStats = useCallback(async (word, isSuccess, similarity) => {
    const db = await openDB('flashcards', DB_VERSION);
    const tx = db.transaction('wordStats', 'readwrite');
    const store = tx.objectStore('wordStats');
    const item = await store.get(word) || { word, successes: 0, failures: 0 };
    
    const updatedStats = {
      ...item,
      successes: isSuccess ? item.successes + 1 : item.successes,
      failures: isSuccess ? item.failures : item.failures + 1,
      lastAttempt: { success: isSuccess, similarity }
    };
    
    await store.put(updatedStats);
    await tx.done;
  
    setCurrentWordStats(updatedStats);
  }, []);

  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(ctx);

    const loadAudio = async (url, name) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBuffersRef.current[name] = audioBuffer;
    };

    loadAudio(successSound, 'success');
    loadAudio(failSound, 'fail');

    return () => {
      ctx.close();
    };
  }, []);

  const handleLanguageChange = (event) => {
    setCurrentLanguage(event.target.value);
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      <select value={currentLanguage} onChange={handleLanguageChange} className="language-selector">
        <option value="russian">Russian</option>
        <option value="spanish">Spanish</option>
      </select>
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
          onClick={startListening}
          disabled={listening}
          className="nav-button"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          {listening ? 'Listening...' : 'Speak'}
        </button>
        <button
          className="nav-button"
          onClick={nextRandomWord}
          disabled={false}
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          Skip
        </button>
      </div>
      <div className="dark-mode-toggle" style={{ paddingTop: '20px' }}>
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={toggleDarkMode} />
          <span className="slider round">
            <img src={darkMode ? moonIcon : sunIcon} alt="mode icon" className="mode-icon" />
          </span>
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', fontSize: '11px' }}>
        <div className="stats" style={{ flex: 1, marginRight: '10px' }}>
          <h3>Current Word</h3>
          <table>
            <tbody>
              <tr>
                <td>Word:</td>
                <td><strong>{currentWord?.foreign}</strong></td>
              </tr>
              <tr>
                <td>Successes:</td>
                <td><span style={{ color: 'green' }}>{currentWordStats?.successes || 0}</span></td>
              </tr>
              <tr>
                <td>Failures:</td>
                <td><span style={{ color: 'red' }}>{currentWordStats?.failures || 0}</span></td>
              </tr>
              <tr>
                <td>Success Rate:</td>
                <td><strong>
                  {currentWordStats ? 
                    ((currentWordStats.successes / (currentWordStats.successes + currentWordStats.failures)) * 100).toFixed(2) : 0}%
                </strong></td>
              </tr>

            </tbody>
          </table>
        </div>

        <div className="stats" style={{ flex: 1, marginLeft: '10px' }}>
          <h3>Overall Statistics</h3>
          <table>
            <tbody>
              <tr>
                <td>Words:</td>
                <td><strong>{words.length}</strong></td>
              </tr>
              <tr>
                <td>Successes:</td>
                <td><span style={{ color: 'green' }}>{wordStats.successes}</span></td>
              </tr>
              <tr>
                <td>Failures:</td>
                <td><span style={{ color: 'red' }}>{wordStats.failures}</span></td>
              </tr>
              <tr>
                <td>Success Rate:</td>
                <td><strong>
                  {wordStats.successes + wordStats.failures > 0 ? 
                    ((wordStats.successes / (wordStats.successes + wordStats.failures)) * 100).toFixed(2) : 0}%
                </strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
