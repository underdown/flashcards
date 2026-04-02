import React, { useEffect, useState, useCallback, useRef } from 'react';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';
import successGif from './assets/success.gif';
import { openDB } from 'idb';
import { useNavigate } from 'react-router-dom';
import CategorySelector from './CategorySelector';
import { languages, getLanguageCode, languageIds } from './assets/languages';

const DB_VERSION = 1;

/** Match exact BCP47 first, then same language subtag only (avoids jam-JM matching ja-JP). */
function pickVoiceForLang(voices, langCode) {
  if (!voices?.length || !langCode) return undefined;
  const primary = langCode.split(/[-_]/)[0].toLowerCase();
  const exact = langCode.replace('_', '-').toLowerCase();

  const norm = (v) => String(v.lang).replace('_', '-').toLowerCase();

  const exactMatch = voices.find((v) => norm(v) === exact);
  if (exactMatch) return exactMatch;

  return voices.find((v) => norm(v).split('-')[0] === primary);
}

function loadVoicesWhenReady() {
  return new Promise((resolve) => {
    let list = window.speechSynthesis.getVoices();
    if (list.length > 0) {
      resolve(list);
      return;
    }
    const finish = (voices) => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      clearTimeout(timeout);
      resolve(voices);
    };
    const onVoices = () => {
      list = window.speechSynthesis.getVoices();
      if (list.length > 0) finish(list);
    };
    const timeout = setTimeout(() => finish(window.speechSynthesis.getVoices()), 2500);
    window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    list = window.speechSynthesis.getVoices();
    if (list.length > 0) finish(list);
  });
}

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
  const [isAutoPracticeActive, setIsAutoPracticeActive] = useState(false);
  const [recentlyUsedWords, setRecentlyUsedWords] = useState([]);
  const RECENTLY_USED_LIMIT = 10; // How many recent words to remember
  const currentWordRef = useRef(null);
  const [categories, setCategories] = useState({});
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [showCategorySelector, setShowCategorySelector] = useState(false);

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
    if (nextWordRef.current) return;
    nextWordRef.current = true;

    const { learnedWords, unlearnedWords } = categorizeWords(words, wordStatsMap);
    
    // Filter out recently used words
    const availableUnlearned = unlearnedWords.filter(word => !recentlyUsedWords.includes(word.foreign));
    const availableLearned = learnedWords.filter(word => !recentlyUsedWords.includes(word.foreign));
    
    let newWord;
    if (availableUnlearned.length > 0 && Math.random() < 0.3) { // Reduced chance for unlearned words
      newWord = availableUnlearned[Math.floor(Math.random() * availableUnlearned.length)];
      console.log('Selected unlearned word:', newWord);
    } else if (availableLearned.length > 0) {
      newWord = availableLearned[Math.floor(Math.random() * availableLearned.length)];
      console.log('Selected learned word:', newWord);
    } else {
      // If all words were recently used, pick from all words except the most recent
      const availableWords = words.filter(word => word.foreign !== recentlyUsedWords[0]);
      newWord = availableWords[Math.floor(Math.random() * availableWords.length)];
      console.log('Selected fallback word:', newWord);
    }

    // Update recently used words
    setRecentlyUsedWords(prev => {
      const updated = [newWord.foreign, ...prev.slice(0, RECENTLY_USED_LIMIT - 1)];
      console.log('Recently used words:', updated);
      return updated;
    });

    setCurrentWord(newWord);
    nextWordRef.current = false;
    console.log("Next word selected:", newWord.foreign);
  }, [words, wordStatsMap, recentlyUsedWords]);

  useEffect(() => {
    const pathLanguage = window.location.pathname.split('/')[1];
    if (pathLanguage && languages[pathLanguage]) {
      setCurrentLanguage(pathLanguage);
    } else {
      setCurrentLanguage('spanish'); 
    }
  }, []);

  useEffect(() => {
    if (!currentLanguage || !languages[currentLanguage]) {
      return;
    }

    const loadLanguageData = (languageData) => {
      const categoriesObj = languageData.categories || {};
      const catKeys = Object.keys(categoriesObj);

      let categoriesToUse = selectedCategories.filter((k) => catKeys.includes(k));
      if (categoriesToUse.length === 0 && catKeys.length > 0) {
        const defaultKey = catKeys.includes('basics') ? 'basics' : catKeys[0];
        categoriesToUse = defaultKey ? [defaultKey] : [];
      }

      const sorted = (arr) => [...arr].sort().join(',');
      if (sorted(categoriesToUse) !== sorted(selectedCategories)) {
        setSelectedCategories(categoriesToUse);
      }

      setCategories(categoriesObj);

      const selectedWords = categoriesToUse.reduce((acc, categoryKey) => {
        const categoryWords = categoriesObj[categoryKey]?.words || [];
        return [...acc, ...categoryWords];
      }, []);

      setWords(selectedWords);
      setWordsInitialized(true);
    };

    languages[currentLanguage]
      .data()
      .then((module) => {
        loadLanguageData(module.default);
      })
      .catch((error) => {
        console.error('Error loading words:', error);
        fetch(`/languages/${currentLanguage}.json`)
          .then((response) => response.json())
          .then((data) => {
            loadLanguageData(data);
          })
          .catch((err) => console.error('Error loading words:', err));
      });
  }, [currentLanguage, selectedCategories]);

  useEffect(() => {
    if (wordsInitialized && words.length > 0) {
      console.log('Words initialization effect triggered');
      console.log('wordsInitialized:', wordsInitialized);
      console.log('words.length:', words.length);
      console.log('nextWordRef.current:', nextWordRef.current);
      nextRandomWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsInitialized, words]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const newRecognition = new window.webkitSpeechRecognition();
      newRecognition.lang = getLanguageCode(currentLanguage);
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
          updateWordStats(currentWord.foreign, true, 1);

          setTimeout(() => {
            setDetectedSpeech('');
            setShowSuccessGif(false);
            setSpeechStatus('idle');
            if (autoPracticeActiveRef.current) {
              nextRandomWord();
              nextWordTimeoutRef.current = setTimeout(() => {
                autoPractice();
              }, 2000);
            }
          }, 1200);
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
    // nextRandomWord/autoPractice omitted to avoid resetting recognition handlers every word
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [recognition, currentWord, playSound, updateWordStats]);

  useEffect(() => {
    return () => {
      if (recognition) {
        recognition.abort();
      }
    };
  }, [recognition]);

  const speakWord = useCallback(() => {
    if (!currentWord?.foreign) return;

    const langCode = getLanguageCode(currentLanguage);
    const text = currentWord.foreign;

    const runSpeak = (voices) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;

      const languageVoice = pickVoiceForLang(voices, langCode);
      if (languageVoice) {
        utterance.voice = languageVoice;
        console.log('Using voice:', languageVoice.name, languageVoice.lang);
      } else {
        console.log('No specific voice found for', langCode, '(voices:', voices.length, ')');
      }

      utterance.rate = 0.9;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    };

    loadVoicesWhenReady().then(runSpeak);
  }, [currentWord, currentLanguage]);

  // Add this effect to handle voice loading
  useEffect(() => {
    // Some browsers need a little time to load voices
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      }
    };

    loadVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

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

  const readWord = useCallback((word, lang) => {
    console.log('Reading word:', word, 'in language:', lang);
    return loadVoicesWhenReady().then((voices) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = lang;

      const languageVoice = pickVoiceForLang(voices, lang);
      if (languageVoice) {
        utterance.voice = languageVoice;
        console.log('Using voice:', languageVoice.name, languageVoice.lang);
      }

      utterance.rate = 0.9;
      utterance.pitch = 1;

      return new Promise((resolve) => {
        utterance.onend = () => {
          console.log('Finished speaking:', word);
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      });
    });
  }, []);

  const startRecognition = useCallback(() => {
    return new Promise((resolve) => {
      if (!recognition) {
        resolve(false);
        return;
      }

      successHandledRef.current = false;
      recognition.abort();

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('')
          .toLowerCase()
          .trim();

        console.log('Transcript:', transcript);
        setDetectedSpeech(transcript);

        const expectedWord = currentWordRef.current.foreign.toLowerCase().trim();
        console.log('Expected word:', expectedWord);
        
        if (transcript.includes(expectedWord)) {
          console.log('Success! Transcript matches expected word');
          successHandledRef.current = true;
          recognition.abort();
          playSound(successSound);
          setShowSuccessGif(true);
          setWordStats(prev => ({ ...prev, successes: prev.successes + 1 }));
          updateWordStats(currentWordRef.current.foreign, true, 1);
          resolve(true);
        }
      };

      recognition.onend = () => {
        if (!successHandledRef.current) {
          console.log('Recognition ended without success');
          playSound(failSound);
          setWordStats(prev => ({ ...prev, failures: prev.failures + 1 }));
          updateWordStats(currentWordRef.current.foreign, false, 0);
          resolve(false);
        }
      };

      recognition.start();
      setSpeechStatus('listening');

      // Set timeout for recognition
      setTimeout(() => {
        if (!successHandledRef.current) {
          recognition.abort();
        }
      }, 5000);
    });
  }, [recognition, playSound, updateWordStats]);

  useEffect(() => {
    currentWordRef.current = currentWord;
  }, [currentWord]);

  const autoPractice = useCallback(() => {
    if (!currentWordRef.current) return;

    const practiceSequence = async () => {
      if (!autoPracticeActiveRef.current) return;

      try {
        // Always use currentWordRef.current to get the latest word
        console.log('Starting practice sequence for word:', currentWordRef.current);

        // Speak English word and wait for completion
        console.log('Speaking English word:', currentWordRef.current.english);
        await readWord(currentWordRef.current.english, 'en-US');
        if (!autoPracticeActiveRef.current) return;
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Speak foreign word and wait for completion
        console.log('Speaking foreign word:', currentWordRef.current.foreign);
        if (!autoPracticeActiveRef.current) return;
        await readWord(currentWordRef.current.foreign, getLanguageCode(currentLanguage));
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Start recognition
        console.log('Starting recognition for word:', currentWordRef.current.foreign);
        if (!autoPracticeActiveRef.current) return;
        await startRecognition();

        // Clean up
        setDetectedSpeech('');
        setShowSuccessGif(false);
        setSpeechStatus('idle');

        // Wait for all state updates and speech to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Move to next word if still in auto practice mode
        if (autoPracticeActiveRef.current) {
          nextRandomWord();
          // Wait for the new word to be set
          await new Promise(resolve => setTimeout(resolve, 500));
          if (autoPracticeActiveRef.current) {
            practiceSequence();
          }
        }
      } catch (error) {
        console.error('Error in practice sequence:', error);
        if (autoPracticeActiveRef.current) {
          setTimeout(practiceSequence, 2000);
        }
      }
    };

    practiceSequence();
  }, [currentLanguage, readWord, nextRandomWord, startRecognition]); // Remove currentWord from dependencies

  const toggleAutoPractice = () => {
    const newState = !isAutoPracticeActive;
    setIsAutoPracticeActive(newState);
    autoPracticeActiveRef.current = newState;
    
    if (newState) {
      // Clear any existing timeouts
      if (nextWordTimeoutRef.current) {
        clearTimeout(nextWordTimeoutRef.current);
      }
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      // Abort any ongoing recognition
      if (recognition) {
        recognition.abort();
      }
      // Reset states
      setSpeechStatus('idle');
      setDetectedSpeech('');
      // Start auto practice
      autoPractice();
    } else {
      // Clean up when stopping auto practice
      if (nextWordTimeoutRef.current) {
        clearTimeout(nextWordTimeoutRef.current);
      }
      window.speechSynthesis.cancel();
      if (recognition) {
        recognition.abort();
      }
      setSpeechStatus('idle');
      setDetectedSpeech('');
    }
  };

  const handleCategoryToggle = (categoryKey) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryKey)) {
        return prev.filter(key => key !== categoryKey);
      } else {
        return [...prev, categoryKey];
      }
    });
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      <select value={currentLanguage} onChange={handleLanguageChange} className="language-selector">
        {languageIds.map((id) => (
          <option key={id} value={id}>
            {languages[id].name}
          </option>
        ))}
      </select>
      {showCategorySelector && (
        <CategorySelector
          categories={categories}
          selectedCategories={selectedCategories}
          onCategoryToggle={handleCategoryToggle}
          onClose={() => setShowCategorySelector(false)}
        />
      )}
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
          className={`nav-button ${isAutoPracticeActive ? 'active' : ''}`}
          onClick={toggleAutoPractice}
          disabled={false}
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          {isAutoPracticeActive ? 'Stop' : 'Auto'}
        </button>
        <button
          className="nav-button"
          onClick={() => setShowCategorySelector(!showCategorySelector)}
        >
          Categories
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
      <div className="stats-container">
        <div className="stats">
          <h3>Current</h3>
          <table>
            <tbody>
              <tr>
                <td>Word:</td>
                <td><strong>{currentWord?.foreign}</strong></td>
              </tr>
              <tr>
                <td>Pass:</td>
                <td><span className="success-text">{currentWordStats?.successes || 0}</span></td>
              </tr>
              <tr>
                <td>Fail:</td>
                <td><span className="failure-text">{currentWordStats?.failures || 0}</span></td>
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

        <div className="stats">
          <h3>Overall</h3>
          <table>
            <tbody>
              <tr>
                <td>Words:</td>
                <td><strong>{words.length}</strong></td>
              </tr>
              <tr>
                <td>Pass:</td>
                <td><span className="success-text">{wordStats.successes}</span></td>
              </tr>
              <tr>
                <td>Fail:</td>
                <td><span className="failure-text">{wordStats.failures}</span></td>
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
