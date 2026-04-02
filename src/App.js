import React, { useEffect, useState, useCallback, useRef } from 'react';
import Flashcard from './Flashcard';
import './App.css';
import sunIcon from './assets/sun.svg';
import moonIcon from './assets/moon.svg';
import iconPlay from './assets/icon-play.svg';
import iconMic from './assets/icon-mic.svg';
import iconSkip from './assets/icon-skip.svg';
import iconStop from './assets/icon-stop.svg';
import iconSettings from './assets/icon-settings.svg';
import iconSound from './assets/icon-sound.svg';
import successSound from './assets/success.wav';
import failSound from './assets/fail.wav';
import successGif from './assets/success.gif';
import { openDB } from 'idb';
import { useNavigate } from 'react-router-dom';
import CategorySelector from './CategorySelector';
import { languages, getLanguageCode, languageIds } from './assets/languages';
import Modal from './Modal';
import { ReactComponent as HelpIcon } from './assets/icon-help.svg';
import {
  getJapaneseSpeechText,
  getKanjiEnglishSpeechText,
  speechMatchesExpected,
  getKanjiVariants,
} from './kanjiVariants';

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

/** Must wait for the previous session to finish before start() or the engine throws / misbehaves. */
function waitForRecognitionIdle(recognition) {
  return new Promise((resolve) => {
    if (!recognition) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(done, 450);
    const onEnd = () => {
      recognition.removeEventListener('end', onEnd);
      done();
    };
    recognition.addEventListener('end', onEnd);
    try {
      recognition.abort();
    } catch {
      recognition.removeEventListener('end', onEnd);
      done();
    }
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
  const [kanjiVariantIndex, setKanjiVariantIndex] = useState(0);
  const kanjiVariantIndexRef = useRef(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    kanjiVariantIndexRef.current = kanjiVariantIndex;
  }, [kanjiVariantIndex]);

  useEffect(() => {
    if (!currentWord) return;
    if (currentWord.categoryKey === 'kanji') {
      const n = Math.max(1, getKanjiVariants(currentWord).length);
      const next = Math.floor(Math.random() * n);
      kanjiVariantIndexRef.current = next;
      setKanjiVariantIndex(next);
    } else {
      kanjiVariantIndexRef.current = 0;
      setKanjiVariantIndex(0);
    }
  }, [currentWord]);

  const cycleKanjiVariant = useCallback(() => {
    if (!currentWord || currentWord.categoryKey !== 'kanji') return;
    const vars = getKanjiVariants(currentWord);
    if (vars.length <= 1) return;
    setKanjiVariantIndex((i) => {
      const next = (i + 1) % vars.length;
      kanjiVariantIndexRef.current = next;
      return next;
    });
  }, [currentWord]);

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
        let defaultKey;
        if (currentLanguage === 'japanese' && catKeys.includes('kanji')) {
          defaultKey = 'kanji';
        } else if (catKeys.includes('basics')) {
          defaultKey = 'basics';
        } else {
          defaultKey = catKeys[0];
        }
        categoriesToUse = defaultKey ? [defaultKey] : [];
      }

      // If the user opts into kana in Japanese, always include both decks so the
      // card can show both hiragana and katakana simultaneously.
      if (currentLanguage === 'japanese') {
        const wantsKana =
          categoriesToUse.includes('hiragana') || categoriesToUse.includes('katakana');
        if (wantsKana) {
          categoriesToUse = Array.from(
            new Set([...categoriesToUse, 'hiragana', 'katakana'])
          );
        }
      }

      const sorted = (arr) => [...arr].sort().join(',');
      if (sorted(categoriesToUse) !== sorted(selectedCategories)) {
        setSelectedCategories(categoriesToUse);
      }

      setCategories(categoriesObj);

      let selectedWords = [];

      // Special pairing for Japanese kana cards: one card shows both hiragana
      // and katakana, while speech detection targets the active deck.
      if (
        currentLanguage === 'japanese' &&
        (categoriesToUse.includes('hiragana') || categoriesToUse.includes('katakana'))
      ) {
        const hiraWords = categoriesObj.hiragana?.words || [];
        const kataWords = categoriesObj.katakana?.words || [];

        const hiraBy = new Map(hiraWords.map((w) => [w.english, w]));
        const kataBy = new Map(kataWords.map((w) => [w.english, w]));

        const kanaKeys = Array.from(new Set([...hiraBy.keys(), ...kataBy.keys()])).filter(
          (k) => hiraBy.has(k) && kataBy.has(k)
        );

        const kanaWords = kanaKeys.flatMap((englishKey) => {
          const h = hiraBy.get(englishKey);
          const k = kataBy.get(englishKey);

          // Hiragana-active card
          const hiraganaCard = {
            ...h,
            categoryKey: 'hiragana',
            kanaHiragana: h.foreign,
            kanaKatakana: k.foreign,
          };

          // Katakana-active card
          const katakanaCard = {
            ...k,
            categoryKey: 'katakana',
            kanaHiragana: h.foreign,
            kanaKatakana: k.foreign,
          };

          return [hiraganaCard, katakanaCard];
        });

        selectedWords = [...kanaWords];
      }

      // Add all other decks (and kanji) normally.
      const nonKanaCategories = categoriesToUse.filter(
        (k) => k !== 'hiragana' && k !== 'katakana'
      );
      const nonKanaWords = nonKanaCategories.reduce((acc, categoryKey) => {
        const categoryWords = categoriesObj[categoryKey]?.words || [];
        const tagged = categoryWords.map((w) => ({ ...w, categoryKey }));
        return [...acc, ...tagged];
      }, []);

      selectedWords = [...selectedWords, ...nonKanaWords];

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
      newRecognition.continuous = false;
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
    if (!recognition) return;

    waitForRecognitionIdle(recognition).then(() => {
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
        setDetectedSpeech(cleanTranscript);

        if (
          speechMatchesExpected(cleanTranscript, currentWord, kanjiVariantIndexRef.current) &&
          !successHandledRef.current
        ) {
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
    });
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
    const text = getJapaneseSpeechText(currentWord, kanjiVariantIndexRef.current);

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
    if (!recognition) {
      return Promise.resolve(false);
    }

    return waitForRecognitionIdle(recognition).then(() => {
      return new Promise((resolve) => {
        let finished = false;
        let listenTimeoutId;

        const finish = (value) => {
          if (finished) return;
          finished = true;
          clearTimeout(listenTimeoutId);
          resolve(value);
        };

        successHandledRef.current = false;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join('')
            .toLowerCase()
            .trim();

          console.log('Transcript:', transcript);
          setDetectedSpeech(transcript);

          const wordNow = currentWordRef.current;
          const idx = kanjiVariantIndexRef.current;
          const ok = speechMatchesExpected(transcript, wordNow, idx);
          console.log('Speech match (variant', idx, '):', ok);

          if (ok) {
            console.log('Success! Transcript matches expected word');
            successHandledRef.current = true;
            try {
              recognition.abort();
            } catch (e) {
              console.error(e);
            }
            playSound(successSound);
            setShowSuccessGif(true);
            setWordStats((prev) => ({ ...prev, successes: prev.successes + 1 }));
            updateWordStats(currentWordRef.current.foreign, true, 1);
            finish(true);
          }
        };

        recognition.onerror = (event) => {
          if (finished || event.error === 'aborted') return;
          console.log('Recognition error:', event.error);
        };

        recognition.onend = () => {
          if (!successHandledRef.current) {
            console.log('Recognition ended without success');
            playSound(failSound);
            setWordStats((prev) => ({ ...prev, failures: prev.failures + 1 }));
            updateWordStats(currentWordRef.current.foreign, false, 0);
            finish(false);
          }
        };

        try {
          recognition.start();
          setSpeechStatus('listening');
        } catch (e) {
          console.error('recognition.start failed:', e);
          finish(false);
          return;
        }

        listenTimeoutId = setTimeout(() => {
          if (!successHandledRef.current) {
            try {
              recognition.abort();
            } catch (err) {
              console.error(err);
            }
          }
        }, 12000);
      });
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
        const word = currentWordRef.current;
        console.log('Starting practice sequence for word:', word);

        const skipEnglishInAuto =
          currentLanguage === 'japanese' &&
          (word.categoryKey === 'hiragana' || word.categoryKey === 'katakana');

        if (!skipEnglishInAuto) {
          const englishSpeak =
            word.categoryKey === 'kanji'
              ? getKanjiEnglishSpeechText(word, kanjiVariantIndexRef.current)
              : word.english;
          console.log('Speaking English word:', englishSpeak);
          await readWord(englishSpeak, 'en-US');
          if (!autoPracticeActiveRef.current) return;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Speak foreign word and wait for completion (active kana for kanji)
        const jpSpeak =
          word.categoryKey === 'kanji'
            ? getJapaneseSpeechText(word, kanjiVariantIndexRef.current)
            : word.foreign;
        console.log('Speaking Japanese word:', jpSpeak);
        if (!autoPracticeActiveRef.current) return;
        await readWord(jpSpeak, getLanguageCode(currentLanguage));
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Start recognition
        console.log('Starting recognition for word:', word.foreign);
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
      if (
        currentLanguage === 'japanese' &&
        (categoryKey === 'hiragana' || categoryKey === 'katakana')
      ) {
        const otherKey = categoryKey === 'hiragana' ? 'katakana' : 'hiragana';
        const hasThis = prev.includes(categoryKey);
        const hasOther = prev.includes(otherKey);

        // Selecting either hiragana or katakana should enable both so cards can show
        // both symbols at once; toggling one off removes both.
        if (hasThis && hasOther) {
          return prev.filter((k) => k !== categoryKey && k !== otherKey);
        }

        // Otherwise add both.
        const next = new Set(prev);
        next.add('hiragana');
        next.add('katakana');
        return Array.from(next);
      }

      if (prev.includes(categoryKey)) {
        return prev.filter(key => key !== categoryKey);
      }
      return [...prev, categoryKey];
    });
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
      {currentLanguage !== 'japanese' && (
        <select value={currentLanguage} onChange={handleLanguageChange} className="language-selector">
          {languageIds.map((id) => (
            <option key={id} value={id}>
              {languages[id].name}
            </option>
          ))}
        </select>
      )}
      {showCategorySelector && (
        <CategorySelector
          categories={categories}
          selectedCategories={selectedCategories}
          onCategoryToggle={handleCategoryToggle}
          onClose={() => setShowCategorySelector(false)}
          currentLanguage={currentLanguage}
        />
      )}
      <div className="flashcard-container">
        {showSuccessGif && <img src={successGif} alt="Success GIF" className="success-gif" />}
        <Flashcard
          word={currentWord}
          activeKanjiVariantIndex={currentWord?.categoryKey === 'kanji' ? kanjiVariantIndex : undefined}
          onCycleKanjiVariant={currentWord?.categoryKey === 'kanji' ? cycleKanjiVariant : undefined}
        />
        <button
          type="button"
          className={`help-button ${
            currentWord?.categoryKey === 'kanji' ? 'help-button--kanji' : ''
          }`}
          aria-label="Help"
          title="Help"
          onClick={() => setShowHelp(true)}
        >
          <HelpIcon className="help-button-icon" />
        </button>
        <Modal isOpen={showHelp}>
          <div className="help-modal">
            <button
              type="button"
              className="help-modal-close"
              aria-label="Close help"
              onClick={() => setShowHelp(false)}
            >
              ×
            </button>
            <h3>How to use</h3>
            <div className="help-modal-body">
              <h4>Quick overview</h4>
              <p>
                This is a pronunciation flashcard app. Your browser speaks a card, and then you respond. It uses speech recognition
                built into your browser, so the results depend on your system's available voices and language packs.
              </p>

              <h4>Buttons</h4>
              <p>
                <strong>Play / Auto</strong>: auto-plays kanji/kana and then listens for you to pronounce the active reading correctly.
                When you turn Auto on, it keeps looping through cards until you click Stop.
              </p>
              <p>
                <strong>Sound</strong>: replays the pronunciation for the current card (useful for review).
              </p>
              <p>
                <strong>Speak (microphone)</strong>: manually tests pronunciation using speech detection.
              </p>
              <p>
                <strong>Skip</strong>: moves to the next card without scoring.
              </p>
              <p>
                <strong>Categories / Options</strong>: opens the category picker. For Japanese, you can enable:
                <strong>Kanji</strong> (cards may include multiple meanings/readings; the app picks one active reading for Auto/Speak),
                and kana decks (hiragana/katakana) which are practiced together as a single kana-focused card.
              </p>

              <h4>Kanji practice tip</h4>
              <p>
                Some kanji have multiple pronunciations. For those cards, the UI shows all meaning/sound options, but Auto/Speak only listens
                for the active pronunciation. If you want to change what's considered active, click the kanji card to cycle the active reading.
              </p>

              <h4>Stats + privacy</h4>
              <p>
                The app has no tracking and no external database. Pronunciation stats are stored locally in your browser (IndexedDB),
                and more kanji are being added over time.
              </p>

              <h4>Most likely causes (sound or speech detection)</h4>
              <p>
                <strong>Sound doesn't play</strong>:
                try clicking <strong>Play</strong> or <strong>Sound</strong> again (some browsers require user interaction to start audio),
                confirm your device isn't muted, and check Chrome's audio/tab mute and site sound permissions.
              </p>
              <p>
                <strong>Speech detection doesn't work</strong>:
                confirm your microphone permission for the site, ensure your system has Japanese speech recognition support installed,
                and try Chrome (Web Speech API behavior varies by browser).
              </p>

              <h4>How to add Japanese voices (recommended: Chrome)</h4>
              <p>
                <strong>Windows</strong>:
                Settings -> Time &amp; language -> Language &amp; region -> Add a language -> <strong>Japanese</strong>.
                Then open the Japanese language options and install speech-related features/voices. Restart Chrome after installing.
              </p>
              <p>
                <strong>macOS</strong>:
                System Settings -> General -> Language &amp; Region -> add <strong>Japanese</strong>.
                Then open Accessibility/Spoken Content (or Dictation &amp; Speech) and select/enable Japanese voices. Restart Chrome after changes.
              </p>
            </div>
          </div>
        </Modal>
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
        <button
          type="button"
          className={`nav-button ${isAutoPracticeActive ? 'active' : ''}`}
          onClick={toggleAutoPractice}
          aria-label={isAutoPracticeActive ? 'Stop auto practice' : 'Auto practice'}
          title={isAutoPracticeActive ? 'Stop' : 'Auto'}
        >
          <img
            src={isAutoPracticeActive ? iconStop : iconPlay}
            alt=""
            className="nav-button-icon"
          />
        </button>
        <button
          type="button"
          className="nav-button"
          onClick={nextRandomWord}
          aria-label="Skip card"
          title="Skip"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          <img src={iconSkip} alt="" className="nav-button-icon" />
        </button>
        <button
          type="button"
          className="nav-button"
          onClick={speakWord}
          aria-label="Play"
          title="Play"
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          <img
            src={iconSound}
            alt=""
            className="nav-button-icon"
          />
        </button>
        <button
          type="button"
          onClick={startListening}
          disabled={listening}
          className="nav-button"
          aria-label={listening ? 'Listening' : 'Speak'}
          title={listening ? 'Listening' : 'Speak'}
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          <img src={iconMic} alt="" className="nav-button-icon" />
        </button>
        <button
          type="button"
          className="nav-button"
          onClick={() => setShowCategorySelector(!showCategorySelector)}
          aria-label="Categories"
          title="Categories"
        >
          <img src={iconSettings} alt="" className="nav-button-icon" />
        </button>
      </div>
      <div className="dark-mode-toggle" style={{ paddingTop: '10px' }}>
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
                <td>{currentLanguage === 'japanese' ? 'Kanji:' : 'Word:'}</td>
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
                <td>{currentLanguage === 'japanese' ? 'Kanji:' : 'Words:'}</td>
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
