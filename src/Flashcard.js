import React from 'react';

const Flashcard = ({ word }) => {
  if (!word) {
    return <div className="flashcard">Loading...</div>;
  }

  return (
    <div className="flashcard">
      <div className="content">
        <h2>{word.russian}</h2>
        <p>{word.english}</p>
      </div>
    </div>
  );
};

export default Flashcard;