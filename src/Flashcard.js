import React, { useState } from 'react';
import usFlag from './assets/us-flag.svg';
import ruFlag from './assets/ru-flag.svg';

// TTS Function
const speak = (text, lang = 'en-US') => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } else {
    console.error('Your browser does not support the Web Speech API');
  }
};

const Flashcard = ({ word }) => {
  const [isRussian, setIsRussian] = useState(false);

  const flagIcon = isRussian ? ruFlag : usFlag;

  const handleSpeak = (event) => {
    event.stopPropagation();
    if (isRussian) {
      speak(word.russian, 'ru-RU');
    } else {
      speak(word.english, 'en-US');
    }
  };

  const toggleLanguage = () => {
    setIsRussian(!isRussian);
  };

  return (
    <div className="flashcard" onClick={toggleLanguage}>
      <div className="content">{isRussian ? word.russian : word.english}</div>
      <img src={flagIcon} alt="flag" className="flag-icon" />
      <button onClick={handleSpeak}>Speak</button>
    </div>
  );
};

export default Flashcard;
