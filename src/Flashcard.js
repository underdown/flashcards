import React, { useState } from 'react';

const Flashcard = ({ word }) => {
  const [showRussian, setShowRussian] = useState(false);

  return (
    <div className="flashcard" onClick={() => setShowRussian(!showRussian)}>
      <div className="content">
        {showRussian ? word.russian : word.english}
      </div>
    </div>
  );
};

export default Flashcard;
