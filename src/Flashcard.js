import React, { useState } from 'react';

const Flashcard = ({ word }) => {
  const [showRussian, setShowRussian] = useState(false);

  const flagUrl = showRussian
    ? 'https://upload.wikimedia.org/wikipedia/en/f/f3/Flag_of_Russia.svg' // Russian flag
    : 'https://upload.wikimedia.org/wikipedia/en/a/a4/Flag_of_the_United_States.svg'; // American flag

  return (
    <div className="flashcard" onClick={() => setShowRussian(!showRussian)}>
      <div className="content">
        {showRussian ? word.russian : word.english}
      </div>
      <img src={flagUrl} alt="flag" className="flag-icon" />
    </div>
  );
};

export default Flashcard;
