import React from 'react';
import { languages } from './assets/languages';

const VOICE_OS = {
  russian: {
    winLang: 'Russian',
    macLang: 'Russian',
  },
  spanish: {
    winLang: 'Spanish',
    macLang: 'Spanish',
  },
  chinese: {
    winLang: 'Chinese (Simplified, China) or Chinese (Traditional)',
    macLang: 'Chinese, Simplified (or Traditional)',
  },
  japanese: {
    winLang: 'Japanese',
    macLang: 'Japanese',
  },
};

function GenericLanguageHelp({ languageId }) {
  const name = languages[languageId]?.name ?? 'this language';
  const voice = VOICE_OS[languageId] ?? VOICE_OS.russian;

  return (
    <>
      <h4>Quick overview</h4>
      <p>
        This is a pronunciation flashcard app. Your browser speaks a card, and then you respond. It uses speech recognition
        built into your browser, so the results depend on your system&apos;s available voices and language packs.
      </p>

      <h4>Buttons</h4>
      <p>
        <strong>Play / Auto</strong>: auto-plays the spoken answer for the current card and then listens for you to pronounce the
        word (or phrase) shown on the card. When you turn Auto on, it keeps looping through cards until you click Stop.
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
        <strong>Categories / Options</strong>: opens the category picker so you can choose which vocabulary topics to practice for{' '}
        <strong>{name}</strong>.
      </p>

      <h4>Stats + privacy</h4>
      <p>
        The app has no tracking and no external database. Pronunciation stats are stored locally in your browser (IndexedDB).
      </p>

      <h4>Most likely causes (sound or speech detection)</h4>
      <p>
        <strong>Sound doesn&apos;t play</strong>:
        try clicking <strong>Play</strong> or <strong>Sound</strong> again (some browsers require user interaction to start audio),
        confirm your device isn&apos;t muted, and check Chrome&apos;s audio/tab mute and site sound permissions.
      </p>
      <p>
        <strong>Speech detection doesn&apos;t work</strong>:
        confirm your microphone permission for the site, ensure your system has <strong>{name}</strong> speech recognition support
        installed, and try Chrome (Web Speech API behavior varies by browser).
      </p>

      <h4>How to add {name} voices (recommended: Chrome)</h4>
      <p>
        <strong>Windows</strong>:
        Settings -&gt; Time &amp; language -&gt; Language &amp; region -&gt; Add a language -&gt; <strong>{voice.winLang}</strong>.
        Then open that language&apos;s options and install speech-related features/voices. Restart Chrome after installing.
      </p>
      <p>
        <strong>macOS</strong>:
        System Settings -&gt; General -&gt; Language &amp; Region -&gt; add <strong>{voice.macLang}</strong>.
        Then check Accessibility / Spoken Content or Dictation settings for voices, and restart Chrome after changes.
      </p>
    </>
  );
}

function JapaneseHelp() {
  return (
    <>
      <h4>Quick overview</h4>
      <p>
        This is a pronunciation flashcard app. Your browser speaks a card, and then you respond. It uses speech recognition
        built into your browser, so the results depend on your system&apos;s available voices and language packs.
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
        <strong>Kanji Beginner I–III</strong> (three kanji decks of increasing breadth),
        and kana decks (hiragana/katakana) which are practiced together as a single kana-focused card.
        Multi-reading kanji cards pick one active reading for Auto/Speak.
      </p>

      <h4>Kanji practice tip</h4>
      <p>
        Some kanji have multiple pronunciations. For those cards, the UI shows all meaning/sound options, but Auto/Speak only listens
        for the active pronunciation. If you want to change what&apos;s considered active, click the kanji card to cycle the active reading.
      </p>

      <h4>Stats + privacy</h4>
      <p>
        The app has no tracking and no external database. Pronunciation stats are stored locally in your browser (IndexedDB),
        and more kanji are being added over time.
      </p>

      <h4>Most likely causes (sound or speech detection)</h4>
      <p>
        <strong>Sound doesn&apos;t play</strong>:
        try clicking <strong>Play</strong> or <strong>Sound</strong> again (some browsers require user interaction to start audio),
        confirm your device isn&apos;t muted, and check Chrome&apos;s audio/tab mute and site sound permissions.
      </p>
      <p>
        <strong>Speech detection doesn&apos;t work</strong>:
        confirm your microphone permission for the site, ensure your system has Japanese speech recognition support installed,
        and try Chrome (Web Speech API behavior varies by browser).
      </p>

      <h4>How to add Japanese voices (recommended: Chrome)</h4>
      <p>
        <strong>Windows</strong>:
        Settings -&gt; Time &amp; language -&gt; Language &amp; region -&gt; Add a language -&gt; <strong>Japanese</strong>.
        Then open the Japanese language options and install speech-related features/voices. Restart Chrome after installing.
      </p>
      <p>
        <strong>macOS</strong>:
        System Settings -&gt; General -&gt; Language &amp; Region -&gt; add <strong>Japanese</strong>.
        Then open Accessibility/Spoken Content (or Dictation &amp; Speech) and select/enable Japanese voices. Restart Chrome after changes.
      </p>
    </>
  );
}

function UnknownLanguageHelp() {
  return (
    <>
      <h4>Quick overview</h4>
      <p>
        This is a pronunciation flashcard app. Your browser speaks a card, and then you respond. It uses speech recognition
        built into your browser, so the results depend on your system&apos;s available voices and language packs.
      </p>
      <p>
        If help text doesn&apos;t match your language yet, wait for the deck to finish loading or refresh the page.
      </p>
    </>
  );
}

/**
 * @param {{ languageId: string }} props
 */
export default function HelpModalBody({ languageId }) {
  if (languageId === 'japanese') {
    return <JapaneseHelp />;
  }
  if (languageId && languages[languageId]) {
    return <GenericLanguageHelp languageId={languageId} />;
  }
  return <UnknownLanguageHelp />;
}
