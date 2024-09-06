import React, { useEffect, useState, useCallback, useRef } from 'react';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';
import successGif from './assets/success.gif';
import { openDB } from 'idb';
import { levenshteinDistance } from './utils';
import { useNavigate } from 'react-router-dom';

const DB_VERSION = 1;

const languageCodes = {
  russian: 'ru-RU',
  spanish: 'es-ES',
  chinese: 'zh-CN'
};

const App = () => {
  const navigate = useNavigate();
  const [words, setWords] = useState([]);
  const [currentLanguage, setCurrentLanguage] = useState('');
  const [currentWord, setCurrentWord] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [detectedSpeech, setDetectedSpeech] = useState('');
  const [showSuccessGif, setShowSuccessGif] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('idle');
  const [wordStats, setWordStats] = useState({ successes: 0, failures: 0 });
  const [wordStatsMap, setWordStatsMap] = useState({});
  const [audioContext, setAudioContext] = useState(null);
  const audioBuffersRef = useRef({});
  const [wordsInitialized, setWordsInitialized] = useState(false);
  const successHandledRef = useRef(false); // Ref to track if success has been handled
  const nextWordRef = useRef(false); // Ref to ensure `nextRandomWord` only triggers once
  const autoPracticeActiveRef = useRef(false);

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
  
    setWordStatsMap(prev => ({ ...prev, [word]: updatedStats }));
  }, []);
  const nextWordTimeoutRef = useRef(null); // Add this line
  const categorizeWords = (words, wordStatsMap) => {
    const learnedWords = [];
    const unlearnedWords = [];

    words.forEach(word => {
      const stats = wordStatsMap[word.foreign] || { successes: 0, failures: 0 };
      const successRate = stats.successes / (stats.successes + stats.failures);

      if (successRate >= 0.8) { // Consider a word learned if success rate is 80% or higher
        learnedWords.push(word);
      } else {
        unlearnedWords.push(word);
      }
    });

    return { learnedWords, unlearnedWords };
  };

  const nextRandomWord = useCallback(() => {
    console.log('nextRandomWord called');
    if (nextWordRef.current) return; // Prevent multiple calls
    nextWordRef.current = true;

    const { learnedWords, unlearnedWords } = categorizeWords(words, wordStatsMap);

    let newWord;
    if (unlearnedWords.length > 0 && Math.random() < 0.5) {
      // 50% chance to pick an unlearned word
      newWord = unlearnedWords[Math.floor(Math.random() * unlearnedWords.length)];
      console.log('Selected unlearned word:', newWord);
    } else if (learnedWords.length > 0) {
      // Otherwise, pick a learned word
      newWord = learnedWords[Math.floor(Math.random() * learnedWords.length)];
      console.log('Selected learned word:', newWord);
    } else {
      // Fallback to any word if no learned/unlearned words are available
      newWord = words[Math.floor(Math.random() * words.length)];
      console.log('Selected fallback word:', newWord);
    }

    console.log('Setting currentWord to:', newWord);
    setCurrentWord(newWord);
    nextWordRef.current = false; // Reset after selection
    console.log("Next word selected:", newWord.foreign);
  }, [words, wordStatsMap]);

  useEffect(() => {
    const pathLanguage = window.location.pathname.split('/')[1];
    if (pathLanguage && languageCodes[pathLanguage]) {
      setCurrentLanguage(pathLanguage);
    } else {
      setCurrentLanguage('spanish'); 
    }
  }, []);

  useEffect(() => {
    if (currentLanguage) {
      fetch('/data.json')
        .then(response => response.json())
        .then(data => {
          setWords(data[currentLanguage].words || []);
          setWordsInitialized(true); // Mark words as initialized
          console.log('Words initialized:', data[currentLanguage].words);
        })
        .catch(error => console.error('Error loading words:', error));
    }
  }, [currentLanguage]);

  useEffect(() => {
    if (wordsInitialized && words.length > 0) {
      console.log('Words initialized and available, calling nextRandomWord');
      nextRandomWord();
    }
  }, [wordsInitialized, words, nextRandomWord]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const newRecognition = new window.webkitSpeechRecognition();
      newRecognition.lang = languageCodes[currentLanguage] || 'en-US';
      newRecognition.continuous = true;
      newRecognition.interimResults = true;
      setRecognition(newRecognition);
      console.log('Speech recognition initialized');
    }
  }, [currentLanguage]);

  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode ? '#333' : '#fff';
    document.body.style.backgroundColor = darkMode ? '#333' : '#fff';
  }, [darkMode]);

  useEffect(() => {
    const ensureAudioContextRunning = async () => {
      if (audioContext && audioContext.state !== 'running') {
        try {
          await audioContext.resume();
          console.log('AudioContext resumed');
        } catch (error) {
          console.error('Failed to resume AudioContext:', error);
        }
      }
    };

    ensureAudioContextRunning();
  }, [listening, audioContext]);

  const playSound = useCallback((sound) => {
    const ensureAudioContextRunning = async () => {
      if (audioContext && audioContext.state !== 'running') {
        try {
          await audioContext.resume();
          console.log('AudioContext resumed');
        } catch (error) {
          console.error('Failed to resume AudioContext:', error);
        }
      }
    };

    ensureAudioContextRunning().then(() => {
      const audio = new Audio(sound);
      audio.play().catch(error => console.error('Error playing sound:', error));
    });
  }, [audioContext]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const startListening = useCallback(() => {
    if (recognition) {
      recognition.abort();

      let timeoutId;

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setSpeechStatus('listening');
        setListening(true);
        successHandledRef.current = false; // Reset the success handled flag

        timeoutId = setTimeout(() => {
          console.log('Speech recognition timed out');
          recognition.abort();
        }, 5000); // 5 seconds timeout
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
        clearTimeout(timeoutId); // Clear the timeout if recognition ends

        if (!successHandledRef.current) {
          console.log('Failure');
          playSound(failSound);
          setWordStats(prev => ({ ...prev, failures: prev.failures + 1 }));
          updateWordStats(currentWord.foreign, false, 0); // 0% similarity

          setTimeout(() => {
            setDetectedSpeech('');
            setSpeechStatus('idle');
          }, 100);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setListening(false);
        setSpeechStatus('error');
        clearTimeout(timeoutId); // Clear the timeout on error
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');

        const cleanTranscript = transcript.toLowerCase().trim();
        const cleanExpected = currentWord.foreign.toLowerCase().trim();
        setDetectedSpeech(cleanTranscript);

        if (cleanTranscript.includes(cleanExpected) && !successHandledRef.current) {
          console.log('Success detected');
          successHandledRef.current = true;
          recognition.abort();
          playSound(successSound);
          setShowSuccessGif(true);
          setWordStats(prev => ({ ...prev, successes: prev.successes + 1 }));
          updateWordStats(currentWord.foreign, true, 1); // 100% similarity

          setTimeout(() => {
            setDetectedSpeech('');
            setShowSuccessGif(false);
          //  console.log('Calling nextRandomWord after success');
           // nextRandomWord();
          }, 100);
        }
      };

      try {
        recognition.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setSpeechStatus('error');
        clearTimeout(timeoutId);
      }
    }
  }, [recognition, currentWord, playSound, updateWordStats]);

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

      const wordStatsMap = allStats.reduce((acc, curr) => {
        acc[curr.word] = curr;
        return acc;
      }, {});

      setWordStats(totalStats);
      setWordStatsMap(wordStatsMap);
      console.log('Total stats loaded:', totalStats);
    };
    loadTotalStats();
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
    const selectedLanguage = event.target.value;
    setCurrentLanguage(selectedLanguage);
    navigate(`/${selectedLanguage}`);
  };

  const currentWordStats = currentWord ? wordStatsMap[currentWord.foreign] : null;

  const autoPractice = useCallback(() => {
    if (!currentWord) return;

    const readWord = (word, lang) => {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
    };

    const handleRecognitionResult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('')
        .toLowerCase()
        .trim();

      const expected = currentWord.foreign.toLowerCase().trim();
      setDetectedSpeech(transcript);

      if (transcript.includes(expected)) {
        console.log('Success detected');
        successHandledRef.current = true;
        recognition.abort();
        playSound(successSound);
        setShowSuccessGif(true);
        setWordStats(prev => ({ ...prev, successes: prev.successes + 1 }));
        updateWordStats(currentWord.foreign, true, 1); // 100% similarity

        setTimeout(() => {
          setDetectedSpeech('');
          setShowSuccessGif(false);
          setSpeechStatus('idle'); // Update speech status
          if (autoPracticeActiveRef.current) {
          //  nextRandomWord();
          }
        }, 1200);
      }
    };

    const startRecognition = () => {
      if (recognition) {
        recognition.abort();
        recognition.onresult = handleRecognitionResult;
        recognition.start();

        setSpeechStatus('listening'); // Update speech status

        setTimeout(() => {
          if (!successHandledRef.current) {
            console.log('Failure');
            recognition.abort();
            playSound(failSound);
            setWordStats(prev => ({ ...prev, failures: prev.failures + 1 }));
            updateWordStats(currentWord.foreign, false, 0); // 0% similarity

            setTimeout(() => {
              setDetectedSpeech('');
              setSpeechStatus('idle'); // Update speech status
              if (autoPracticeActiveRef.current) {
                nextWordTimeoutRef.current = setTimeout(() => {
                //  nextRandomWord();
                }, 2000); // Wait 2 seconds before continuing the cycle
              }
            }, 1200);
          }
        }, 5000); // 5 seconds timeout
      }
    };

    readWord(currentWord.english, 'en-US');
    setTimeout(() => {
      readWord(currentWord.foreign, languageCodes[currentLanguage]);
      setTimeout(startRecognition, 2000); // Wait 2 seconds before starting recognition
    }, 1500); // Wait 2 seconds after reading the English word
  }, [currentWord, recognition, playSound, updateWordStats, nextRandomWord, currentLanguage]);

  useEffect(() => {
    if (autoPracticeActiveRef.current) {
      nextWordTimeoutRef.current = setTimeout(() => {
        autoPractice();
      }, 1500); // Wait 2 seconds before continuing the cycle
    }

    return () => {
      if (nextWordTimeoutRef.current) {
        clearTimeout(nextWordTimeoutRef.current);
      }
    };
  }, [currentWord, autoPractice]);

  const toggleAutoPractice = () => {
    autoPracticeActiveRef.current = !autoPracticeActiveRef.current;
    if (autoPracticeActiveRef.current) {
      autoPractice();
    }
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      <select value={currentLanguage} onChange={handleLanguageChange} className="language-selector">
        <option value="russian">Russian</option>
        <option value="spanish">Spanish</option>
        <option value="chinese">Chinese</option>
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
        {speechStatus === 'listening' && <p>LIstening...</p>}
        {speechStatus === 'ready' && <p>Ready! Please speak now.</p>}
        {speechStatus === 'speaking' && <p>Listening...</p>}
        {speechStatus === 'processing' && <p>Processing...</p>}
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
        <button
          className="nav-button"
          onClick={toggleAutoPractice}
          disabled={false}
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          Auto
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
          <h3>Current</h3>
          <table>
            <tbody>
              <tr>
                <td>Word:</td>
                <td><strong>{currentWord?.foreign}</strong></td>
              </tr>
              <tr>
                <td>Pass:</td>
                <td><span style={{ color: 'green' }}>{currentWordStats?.successes || 0}</span></td>
              </tr>
              <tr>
                <td>Fail:</td>
                <td><span style={{ color: 'red' }}>{currentWordStats?.failures || 0}</span></td>
              </tr>
              <tr>
                <td>Rate:</td>
                <td><strong>
                  {currentWordStats ? 
                    ((currentWordStats.successes / (currentWordStats.successes + currentWordStats.failures)) * 100).toFixed(2) : 0}%
                </strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="stats" style={{ flex: 1, marginLeft: '10px' }}>
          <h3>Overall</h3>
          <table>
            <tbody>
              <tr>
                <td>Words:</td>
                <td><strong>{words.length}</strong></td>
              </tr>
              <tr>
                <td>Pass:</td>
                <td><span style={{ color: 'green' }}>{wordStats.successes}</span></td>
              </tr>
              <tr>
                <td>Fail:</td>
                <td><span style={{ color: 'red' }}>{wordStats.failures}</span></td>
              </tr>
              <tr>
                <td>Rate:</td>
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
