import React from 'react';
import './App.css';

const HomePage = () => {
  return (
    <div className="home-page">
      <h1>Welcome</h1>
      <p>Select a language to start practicing:</p>
      <div className="language-links">
        <a href="/russian" className="language-link">Russian Flashcards</a>
        <a href="/spanish" className="language-link">Spanish Flashcards</a>
        <a href="/chinese" className="language-link">Chinese Flashcards</a>
      </div>
    </div>
  );
};

export default HomePage;
