import React from 'react';

const Flashcard = ({ word }) => {
  const speakWord = () => {
    if (word && word.russian) {
      const utterance = new SpeechSynthesisUtterance(word.russian);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!word) {
    return <div className="flashcard">Loading...</div>;
  }

  return (
    <div className="flashcard" onClick={speakWord}>
      <div className="content">
        <h2>{word.russian}</h2>
        <p>{word.english}</p>
      </div>
    </div>
  );
};

export default Flashcard;