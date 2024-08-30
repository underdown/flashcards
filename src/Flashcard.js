import React from 'react';

const Flashcard = ({ word }) => {
  if (!word) {
    return <div className="flashcard">Loading...</div>;
  }

  return (
    <div className="flashcard">
      <div className="content">
        <p className="english">{word.english}</p>
        <h2 className="foreign">{word.foreign}</h2>
        <p className="phonetic">{word.phonetic}</p>
      </div>
    </div>
  );
};

export default Flashcard;