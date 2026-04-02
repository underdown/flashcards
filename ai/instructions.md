# Auto-Practice Bug Investigation

## Problem Description
When auto-practice is activated, the app cycles through words extremely quickly without playing sounds or waiting for speech recognition.

## Attempted Fixes

### Fix 1: Recently Used Words Tracking
- Added state to track last 10 words used
- Added filtering of word selection based on recently used list
- Rationale: Thought the problem might be related to word selection logic
- Result: No change to rapid cycling issue

### Fix 2: Speech Synthesis Promise Structure
- Modified readWord to return a promise that resolves after speech completion
- Added voice selection and rate controls
- Added logging of speech completion
- Rationale: Thought speech synthesis might not be waiting to complete
- Result: No change to rapid cycling issue

### Fix 3: Removed useEffect Dependencies
- Removed the useEffect that was watching currentWord changes
- Removed the effect that was triggering autoPractice on word changes
- Rationale: Thought multiple autoPractice calls might be happening from effects
- Result: No change to rapid cycling issue

### Fix 4: Enhanced toggleAutoPractice Cleanup
- Added cleanup of existing timeouts
- Added cancellation of ongoing speech
- Added abortion of ongoing recognition
- Added state resets
- Rationale: Thought state cleanup might be needed between toggles
- Result: No change to rapid cycling issue

### Fix 5: Remove nextRandomWord from Dependencies

#### Problem:
- nextRandomWord was being called infinitely on page load
- This was happening regardless of auto-practice state
- The issue was caused by having nextRandomWord in the dependency array of the words initialization useEffect

#### Solution:
```javascript
useEffect(() => {
  if (wordsInitialized && words.length > 0) {
    nextRandomWord();
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [wordsInitialized, words]); // Removed nextRandomWord from dependencies
```

#### Result:
- Successfully stopped the infinite loop
- Words now initialize correctly on page load
- Single call to nextRandomWord when words are loaded

### New Issue: Word/Speech Mismatch

#### Problem:
- After the first flashcard, the words being displayed don't match the words being spoken
- Example from console log:
```
Finished speaking: скала
Transcript: ска
Transcript: скала
nextRandomWord called
Selected learned word: {english: 'please', foreign: 'пожалуйста', phonetic: 'pozhaluysta'}
Next word selected: пожалуйста
Recently used words: ['пожалуйста', 'скала']
Finished speaking: rock
Finished speaking: скала
```

#### Cause:
- Race condition between setting new word and speaking previous word
- Speech synthesis and word changes not properly synchronized

#### Current Fix:
- Added explicit waits after each speech operation
- Removed nested timeouts in favor of sequential async/await
- Added waits for state updates and new word setting
- Improved synchronization between speech and word changes

#### Status:
Testing the fix to ensure words being spoken match the flashcard display.

## Current Status
The issue persists despite multiple approaches to fix timing, state management, and cleanup. Further investigation needed.

## New Investigation: nextRandomWord Infinite Calls

### Potential Triggers for nextRandomWord:
1. Direct button click (Skip button)
2. After success in recognition
3. After failure in recognition
4. When words are initialized
5. Inside autoPractice sequence
6. When currentWord changes (removed in Fix 3)

### Suspicious Patterns:
1. nextRandomWord is called in autoPractice's practiceSequence
2. practiceSequence is called again after nextRandomWord
3. This could create an infinite loop:
   ```
   autoPractice
     -> practiceSequence
       -> nextRandomWord
         -> setCurrentWord
           -> triggers new practiceSequence
             -> nextRandomWord
               -> and so on...
   ```

### Next Steps:
1. Add comprehensive logging to track the call stack of nextRandomWord
2. Investigate if the guard clause (nextWordRef.current) is working properly
3. Check if setCurrentWord is triggering unexpected effects

## New Observation: Multiple nextRandomWord Calls on Page Load

### Symptoms:
- nextRandomWord is firing multiple times immediately on page load
- This occurs regardless of auto-practice state
- The behavior happens before any user interaction

### Potential Triggers on Page Load:
1. Initial component mount
2. Words initialization
3. Language code initialization
4. Possible effect chain reactions

### Questions for Investigation:
1. Are you seeing any specific error messages in the console when this occurs?
   - Response: there are no errors, it just calls the nextword instantly

2. Does the number of calls seem consistent, or does it vary?
   - Response: it calls nextrandomword infinitely

3. Do you notice if the multiple calls happen in rapid succession or with some delay between them?
   - Response: there is no delay

4. Does this behavior occur with all languages, or only specific ones?
   - Response: all languages

5. Can you confirm if you see the "nextRandomWord called" console log multiple times on page load?
   - Response: its called many thousands of times

## useEffect Analysis

### Current useEffects that could trigger nextRandomWord:

1. Words Initialization Effect:
```javascript
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
```

2. Language Change Effect:
```javascript
useEffect(() => {
  if (currentLanguage) {
    // Loads words from src/assets/languages/<lang>.json
    // Sets wordsInitialized to true
    // This triggers the above effect
  }
}, [currentLanguage]);
```

### Potential Issues:
1. nextRandomWord is in the dependency array of its own triggering effect
2. setCurrentWord inside nextRandomWord might be causing re-renders
3. The guard clause (nextWordRef.current) might not be persisting between re-renders

### Next Investigation Steps:
1. Remove nextRandomWord from the dependency array
2. Add console logs to track the values of wordsInitialized and words.length
3. Check if nextWordRef.current is working as expected across re-renders

### Latest Issue: Audio Stuck on Initial Word

#### Problem:
- Flashcards advance correctly through the sequence
- However, the audio keeps repeating the initial word for every new card
- The speech synthesis is not updating with the new word
- Visual and audio are out of sync

#### Diagnosis:
- The readWord function might be capturing a stale closure of currentWord
- The speech synthesis queue might not be properly cleared between words
- The timing of speech synthesis might not be aligned with state updates

#### Next Steps:
1. Clear speech synthesis queue before each new word
2. Ensure readWord function has access to latest currentWord value
3. Add logging to track the word being passed to readWord vs currentWord state
4. Consider moving readWord outside the autoPractice function to avoid closure issues

#### Proposed Fix:
```javascript
// Before each readWord call:
window.speechSynthesis.cancel(); // Clear queue
// Pass word directly rather than accessing through closure
await readWord(currentWord.english, 'en-US');
```