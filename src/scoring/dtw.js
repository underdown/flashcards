/**
 * MFCC + DTW pronunciation scoring for the web app.
 * Validated recipe (closed-vocab top-1 5/5 on Russian basics smoke set):
 *  16 kHz mono → pre-emphasis → energy trim → 25 ms Hamming / 10 ms hop
 *  40-mel log FB → DCT → MFCC 1..12 + deltas (24-D) → mean-center (no CMVN var)
 *  banded Euclidean DTW, norm by max(T1,T2) → logistic 0..100
 *  best score over reference voices
 */

export const SR = 16000;
const N_FFT = 512;
const HOP = 160;
const WIN = 400;
const N_MELS = 40;
const N_MFCC = 12;
const FMIN = 0;
const FMAX = 8000;

export const SCORE_CENTER = 58;
export const SCORE_SCALE = 0.1;

function hzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700);
}
function melToHz(mel) {
  return 700 * (10 ** (mel / 2595) - 1);
}

let FB = null;
let DCT = null;

function getFb() {
  if (FB) return FB;
  const nFreqs = N_FFT / 2 + 1;
  const melMin = hzToMel(FMIN);
  const melMax = hzToMel(FMAX);
  const mels = [];
  for (let i = 0; i < N_MELS + 2; i++) {
    mels.push(melMin + ((melMax - melMin) * i) / (N_MELS + 1));
  }
  const bins = mels.map((m) =>
    Math.min(nFreqs - 1, Math.max(0, Math.floor(((N_FFT + 1) * melToHz(m)) / SR)))
  );
  const fb = Array.from({ length: N_MELS }, () => Array(nFreqs).fill(0));
  for (let m = 1; m <= N_MELS; m++) {
    let left = bins[m - 1];
    let center = bins[m];
    let right = bins[m + 1];
    if (center === left) center++;
    if (right === center) right++;
    right = Math.min(right, nFreqs);
    for (let k = left; k < center; k++) fb[m - 1][k] = (k - left) / Math.max(1, center - left);
    for (let k = center; k < right; k++) fb[m - 1][k] = (right - k) / Math.max(1, right - center);
  }
  FB = fb;
  return fb;
}

function getDct() {
  if (DCT) return DCT;
  const dct = [];
  for (let k = 0; k <= N_MFCC; k++) {
    const row = [];
    for (let n = 0; n < N_MELS; n++) {
      row.push(Math.cos((Math.PI / N_MELS) * (n + 0.5) * k));
    }
    dct.push(row);
  }
  DCT = dct;
  return dct;
}

function preEmphasis(x, coef = 0.97) {
  if (!x.length) return x;
  const y = new Float64Array(x.length);
  y[0] = x[0];
  for (let i = 1; i < x.length; i++) y[i] = x[i] - coef * x[i - 1];
  return y;
}

function energyTrim(x, frame = 320, thrFrac = 0.05, pad = 200) {
  if (!x.length) return x;
  const env = new Float64Array(x.length);
  let acc = 0;
  const q = [];
  const half = Math.floor(frame / 2);
  for (let i = 0; i < x.length + half; i++) {
    const v = i < x.length ? x[i] * x[i] : 0;
    q.push(v);
    acc += v;
    if (q.length > frame) acc -= q.shift();
    if (i >= half) {
      const idx = i - half;
      if (idx < x.length) env[idx] = acc / q.length;
    }
  }
  let maxE = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > maxE) maxE = env[i];
  const thr = Math.max(1e-8, thrFrac * maxE);
  let a = -1;
  let b = -1;
  for (let i = 0; i < env.length; i++) {
    if (env[i] >= thr) {
      if (a < 0) a = i;
      b = i;
    }
  }
  if (a < 0) return x;
  a = Math.max(0, a - pad);
  b = Math.min(x.length, b + pad + 1);
  return x.slice(a, b);
}

function powerSpectrum(frame) {
  const n = N_FFT;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = i < frame.length ? frame[i] : 0;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nWRe;
      }
    }
  }
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = (re[k] * re[k] + im[k] * im[k]) / n;
  return out;
}

function addDeltas(f) {
  const t = f.length;
  const d = f[0]?.length ?? 0;
  const deltas = Array.from({ length: t }, () => Array(d).fill(0));
  if (t >= 5) {
    for (let i = 2; i < t - 2; i++) {
      for (let j = 0; j < d; j++) {
        deltas[i][j] =
          (-2 * f[i - 2][j] - f[i - 1][j] + f[i + 1][j] + 2 * f[i + 2][j]) / 10;
      }
    }
    deltas[0] = deltas[1] = deltas[2].slice();
    deltas[t - 1] = deltas[t - 2] = deltas[t - 3].slice();
  } else if (t >= 2) {
    for (let i = 1; i < t; i++) {
      for (let j = 0; j < d; j++) deltas[i][j] = f[i][j] - f[i - 1][j];
    }
    deltas[0] = deltas[1].slice();
  }
  return f.map((row, i) => row.concat(deltas[i]));
}

/** @param {ArrayLike<number>} pcm mono samples in [-1,1], any rate OK if already 16k preferred */
export function extractFeatures(pcm) {
  let x = Float64Array.from(pcm, (v) => Number(v));
  x = preEmphasis(energyTrim(x));
  if (x.length < WIN) {
    const p = new Float64Array(WIN);
    p.set(x);
    x = p;
  }
  const ham = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) ham[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1));

  const nFrames = 1 + Math.floor((x.length - WIN) / HOP);
  const fb = getFb();
  const dct = getDct();
  const coeffs = [];

  for (let fi = 0; fi < nFrames; fi++) {
    const off = fi * HOP;
    const frame = new Float64Array(N_FFT);
    for (let i = 0; i < WIN; i++) frame[i] = x[off + i] * ham[i];
    const power = powerSpectrum(frame);
    const mel = Array(N_MELS).fill(0);
    for (let m = 0; m < N_MELS; m++) {
      let s = 0;
      for (let k = 0; k < power.length; k++) s += power[k] * fb[m][k];
      mel[m] = Math.log(Math.max(s, 1e-10));
    }
    const row = [];
    for (let k = 1; k <= N_MFCC; k++) {
      let s = 0;
      for (let m = 0; m < N_MELS; m++) s += mel[m] * dct[k][m];
      row.push(s);
    }
    coeffs.push(row);
  }

  const withD = addDeltas(coeffs);
  const dim = withD[0]?.length ?? 0;
  const mean = Array(dim).fill(0);
  for (const row of withD) for (let j = 0; j < dim; j++) mean[j] += row[j];
  for (let j = 0; j < dim; j++) mean[j] /= Math.max(1, withD.length);
  return withD.map((row) => row.map((v, j) => v - mean[j]));
}

export function dtwDistance(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 1e9;
  const band = Math.max(30, Math.floor(0.6 * Math.max(n, m)));
  const INF = 1e18;
  let prev = new Float64Array(m + 1);
  prev.fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const curr = new Float64Array(m + 1);
    curr.fill(INF);
    const ai = a[i - 1];
    const jLo = Math.max(1, i - band);
    const jHi = Math.min(m, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const bj = b[j - 1];
      let sum = 0;
      for (let k = 0; k < ai.length; k++) {
        const d = ai[k] - bj[k];
        sum += d * d;
      }
      curr[j] = Math.sqrt(sum) + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  let dist = prev[m];
  if (dist >= INF / 2) {
    prev = new Float64Array(m + 1);
    prev.fill(INF);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      const curr = new Float64Array(m + 1);
      curr.fill(INF);
      const ai = a[i - 1];
      for (let j = 1; j <= m; j++) {
        const bj = b[j - 1];
        let sum = 0;
        for (let k = 0; k < ai.length; k++) {
          const d = ai[k] - bj[k];
          sum += d * d;
        }
        curr[j] = Math.sqrt(sum) + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
      prev = curr;
    }
    dist = prev[m];
  }
  return dist / Math.max(n, m);
}

export function distanceToScore(dist, center = SCORE_CENTER, scale = SCORE_SCALE) {
  const x = Math.max(0, dist);
  const score = 100 / (1 + Math.exp(scale * (x - center)));
  return Math.max(0, Math.min(100, score));
}

export function scoreAgainstRefs(user, refs) {
  let best = { score: 0, distance: 1e9, refIndex: -1 };
  refs.forEach((ref, i) => {
    const distance = dtwDistance(user, ref);
    const score = distanceToScore(distance);
    if (score > best.score) best = { score, distance, refIndex: i };
  });
  return best;
}

/** Resample Float32/Float64 mono buffer from sampleRate → 16 kHz. */
export function resampleTo16k(input, sampleRate) {
  if (sampleRate === SR) return Float64Array.from(input);
  const nOut = Math.max(1, Math.round((input.length / sampleRate) * SR));
  const out = new Float64Array(nOut);
  const ratio = input.length / nOut;
  for (let i = 0; i < nOut; i++) {
    const t = i * ratio;
    const i0 = Math.floor(t);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = t - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Shared AudioContext — creating+closing one per attempt is the main flaky-mic cause. */
let sharedCtx = null;
let sharedStream = null;
let recordLock = Promise.resolve();

function getSharedAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("AudioContext not available");
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC({ latencyHint: "interactive" });
  }
  return sharedCtx;
}

/**
 * MUST be called synchronously inside the mic-button click handler.
 * Creates/resumes the shared AudioContext while the user gesture is still live.
 * App's separate AudioContext does NOT unlock this one.
 */
export function primeMicAudio() {
  const ctx = getSharedAudioContext();
  if (ctx.state === "suspended") {
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* ignore */
    }
  }
  return ctx;
}

async function ensureCtxRunning(ctx) {
  for (let i = 0; i < 4; i++) {
    if (ctx.state === "running") return;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
    if (ctx.state === "running") return;
    await new Promise((r) => setTimeout(r, 30 + i * 20));
  }
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return "";
}

async function getMicStream() {
  // Only refresh when the track is dead — never timer-kill a live stream.
  const fresh =
    !sharedStream ||
    sharedStream.getTracks().some((t) => t.readyState !== "live");

  if (fresh) {
    if (sharedStream) {
      try {
        sharedStream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      sharedStream = null;
    }
    // Prefer raw voice. AEC/NS often zero the mic after TTS / with speakers on.
    // Try strict constraints first; fall back to plain audio if the device rejects them.
    try {
      sharedStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch {
      sharedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  } else {
    sharedStream.getAudioTracks().forEach((t) => {
      try {
        t.enabled = true;
      } catch {
        /* ignore */
      }
    });
  }
  return sharedStream;
}

/** Drop the held mic (call on page hide or explicit reset). */
export function releaseMic() {
  if (sharedStream) {
    try {
      sharedStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    sharedStream = null;
  }
}

function rmsOf(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Soft peak normalize so quiet-but-real speech still scores. */
function normalizePcmPeak(pcm, targetPeak = 0.35) {
  if (!pcm?.length) return pcm;
  const p = peakOf(pcm);
  if (!(p > 1e-6)) return pcm;
  if (p >= targetPeak * 0.85) return pcm;
  const gain = Math.min(16, targetPeak / p);
  const out = new Float64Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    let v = pcm[i] * gain;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    out[i] = v;
  }
  return out;
}

/**
 * Record mic for maxMs (or until silence after speech), return 16 kHz mono Float64.
 *
 * Capture strategy (dual path — pick louder):
 * 1. MediaRecorder on the MediaStream (works even if AudioContext is weird)
 * 2. ScriptProcessor PCM tap (best when AudioContext is running)
 *
 * VAD never ends before holdMs from button press, and needs sustained speech
 * frames before marking spoken (stops ambient blips cutting the take short).
 */
export async function recordPcm16k({
  maxMs = 5000,
  silenceMs = 900,
  minMs = 500,
  holdMs = 1600,
  speechRms = 0.003,
  speechPeak = 0.01,
  noSpeechPeak = 0.0008,
  speechFramesNeeded = 3,
} = {}) {
  let releaseLock = () => {};
  const prev = recordLock;
  recordLock = new Promise((r) => {
    releaseLock = r;
  });
  await prev;

  // Gesture may already have primed this; resume again after awaits.
  const ctx = primeMicAudio();
  await ensureCtxRunning(ctx);

  let stream;
  try {
    stream = await getMicStream();
  } catch (err) {
    releaseLock();
    throw err;
  }

  // After getUserMedia, browsers often re-suspend — resume again.
  await ensureCtxRunning(ctx);

  const mime = pickRecorderMime();
  const started = performance.now();
  let spoken = false;
  let spokenAt = 0;
  let silentFor = 0;
  let peak = 0;
  let hotFrames = 0;

  let source = null;
  let analyser = null;
  let graphMute = null;
  const timeData = new Float32Array(2048);

  try {
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;
    source.connect(analyser);
    // Keep graph alive so Chrome doesn't throttle ScriptProcessor / analyser.
    graphMute = ctx.createGain();
    graphMute.gain.value = 0;
    source.connect(graphMute);
    graphMute.connect(ctx.destination);
  } catch {
    // Analyser optional — MediaRecorder path still works off the stream.
  }

  let stopped = false;
  let hardTimer = null;
  let vadTimer = null;
  const stopWaiters = [];

  const finish = () => {
    if (stopped) return;
    stopped = true;
    if (hardTimer) clearTimeout(hardTimer);
    if (vadTimer) clearInterval(vadTimer);
    try {
      if (source) source.disconnect();
      if (graphMute) graphMute.disconnect();
    } catch {
      /* ignore */
    }
    stopWaiters.forEach((fn) => fn());
  };

  const waitStop = () =>
    new Promise((resolve) => {
      if (stopped) resolve();
      else stopWaiters.push(resolve);
    });

  const noteEnergy = (rms, p, elapsed, { trackSilence = true } = {}) => {
    if (p > peak) peak = p;
    const hot = rms >= speechRms || p >= speechPeak;
    if (hot) {
      hotFrames += 1;
      if (!spoken && hotFrames >= speechFramesNeeded) {
        spoken = true;
        spokenAt = elapsed;
      }
      if (spoken) silentFor = 0;
    } else {
      hotFrames = 0;
      if (spoken && trackSilence) silentFor += 50;
    }
  };

  const tickVad = () => {
    if (stopped) return;
    const elapsed = performance.now() - started;
    if (analyser) {
      try {
        analyser.getFloatTimeDomainData(timeData);
        noteEnergy(rmsOf(timeData), peakOf(timeData), elapsed, {
          trackSilence: true,
        });
      } catch {
        /* ignore */
      }
    }
    // Never end before holdMs — gives the user time to start speaking after tap.
    // End-on-silence only after sustained speech + min speech duration.
    const spokenFor = spoken ? elapsed - spokenAt : 0;
    if (elapsed >= maxMs) {
      finish();
      return;
    }
    if (
      elapsed >= holdMs &&
      spoken &&
      spokenFor >= minMs &&
      silentFor >= silenceMs
    ) {
      finish();
    }
  };

  hardTimer = setTimeout(finish, maxMs + 300);
  vadTimer = setInterval(tickVad, 50);

  try {
    const jobs = [];

    // Path A: MediaRecorder — captures the MediaStream without needing a live graph.
    if (mime && typeof MediaRecorder !== "undefined") {
      jobs.push(
        recordViaMediaRecorder({ stream, ctx, mime, waitStop, finish })
          .then((pcm) => ({ pcm, path: "mediarecorder" }))
          .catch((err) => ({ pcm: null, path: "mediarecorder", err }))
      );
    }

    // Path B: ScriptProcessor direct PCM when available.
    if (typeof ctx.createScriptProcessor === "function") {
      jobs.push(
        recordViaScriptProcessor({ stream, ctx, waitStop, finish, onFrame: (input) => {
          noteEnergy(
            rmsOf(input),
            peakOf(input),
            performance.now() - started,
            { trackSilence: false }
          );
        } })
          .then((pcm) => ({ pcm, path: "scriptprocessor" }))
          .catch((err) => ({ pcm: null, path: "scriptprocessor", err }))
      );
    }

    if (!jobs.length) {
      finish();
      throw new Error("No audio capture path available");
    }

    const results = await Promise.all(jobs);
    // Prefer the take with the highest peak (real speech beats near-silence).
    let best = null;
    let bestPeak = -1;
    for (const r of results) {
      if (!r?.pcm?.length) continue;
      const p = peakOf(r.pcm);
      if (p > bestPeak) {
        bestPeak = p;
        best = r.pcm;
      }
    }

    if (!best || !best.length) {
      const errs = results
        .map((r) => r?.err?.message || r?.err)
        .filter(Boolean)
        .join("; ");
      const err = new Error(errs || "empty-recording");
      err.code = "too-short";
      throw err;
    }

    let pcm = normalizePcmPeak(best);
    const pcmPeak = peakOf(pcm);
    if (pcmPeak > peak) peak = pcmPeak;

    // Only reject true noise-floor / empty takes.
    if (pcm.length < SR * 0.08 || peak < noSpeechPeak) {
      const err = new Error(
        peak < noSpeechPeak ? "no-speech-detected" : "recording-too-short"
      );
      err.code = peak < noSpeechPeak ? "no-speech" : "too-short";
      throw err;
    }
    return pcm;
  } finally {
    finish();
    releaseLock();
  }
}

async function recordViaMediaRecorder({ stream, ctx, mime, waitStop, finish }) {
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 128000,
    });
  } catch {
    recorder = new MediaRecorder(stream);
  }

  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => {
      finish();
      resolve();
    };
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  try {
    recorder.start(100);
  } catch (err) {
    finish();
    throw err;
  }

  await waitStop();
  if (recorder.state !== "inactive") {
    try {
      recorder.requestData?.();
    } catch {
      /* ignore */
    }
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
  }
  await Promise.race([stopped, new Promise((r) => setTimeout(r, 2000))]);

  if (!chunks.length) throw new Error("empty-recording");

  const blob = new Blob(chunks, {
    type: recorder.mimeType || mime || "audio/webm",
  });
  if (blob.size < 64) throw new Error("empty-recording");

  const ab = await blob.arrayBuffer();
  await ensureCtxRunning(ctx);
  let audioBuf;
  try {
    audioBuf = await ctx.decodeAudioData(ab.slice(0));
  } catch (err) {
    // Some browsers need a fresh copy / OfflineAudioContext fallback isn't worth it —
    // surface empty so the dual-path can use ScriptProcessor.
    throw err;
  }
  const ch0 = audioBuf.getChannelData(0);
  let mono = ch0;
  if (audioBuf.numberOfChannels > 1) {
    const ch1 = audioBuf.getChannelData(1);
    mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
  }
  return resampleTo16k(mono, audioBuf.sampleRate);
}

async function recordViaScriptProcessor({ stream, ctx, waitStop, finish, onFrame }) {
  if (typeof ctx.createScriptProcessor !== "function") {
    throw new Error("ScriptProcessor not available");
  }
  await ensureCtxRunning(ctx);
  if (ctx.state !== "running") {
    // ScriptProcessor is silent while suspended — fail this path fast.
    throw new Error("AudioContext not running");
  }

  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  const chunks = [];
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    // Copy — the buffer is reused by the browser.
    chunks.push(Float32Array.from(input));
    if (onFrame) onFrame(input);
  };

  const mute = ctx.createGain();
  mute.gain.value = 0;
  const tap = ctx.createMediaStreamSource(stream);
  tap.connect(processor);
  // Must connect to destination or Chrome won't fire onaudioprocess.
  processor.connect(mute);
  mute.connect(ctx.destination);

  await waitStop();
  try {
    processor.onaudioprocess = null;
    processor.disconnect();
    tap.disconnect();
    mute.disconnect();
  } catch {
    /* ignore */
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  if (!total) throw new Error("empty-recording");
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return resampleTo16k(merged, ctx.sampleRate);
}

/** Lazy-loaded MFCC cache per language. */
const cachePromises = {};

export function loadMfccCache(language) {
  const key = String(language || "").toLowerCase();
  if (!key) return Promise.resolve(null);
  if (!cachePromises[key]) {
    cachePromises[key] = fetch(`/references/${key}/mfcc_cache.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cachePromises[key];
}

/**
 * Score a foreign word given 16 kHz PCM and a loaded cache object.
 * @returns {{ score: number, distance: number, method: 'dtw' } | null}
 */
export function scorePcmAgainstWord(pcm16k, foreign, cache) {
  if (!cache?.by_word || !foreign) return null;
  const entry = cache.by_word[foreign];
  if (!entry?.refs) return null;
  const refs = Object.values(entry.refs);
  if (!refs.length) return null;
  const feats = extractFeatures(pcm16k);
  const best = scoreAgainstRefs(feats, refs);
  return {
    score: Math.round(best.score),
    distance: best.distance,
    method: "dtw",
    refIndex: best.refIndex,
  };
}

/** Convenience: record + score one word. Falls back null if no cache. */
export async function recordAndScoreWord(language, foreign, opts) {
  const cache = await loadMfccCache(language);
  if (!cache?.by_word?.[foreign]) {
    return { ok: false, reason: "no-refs" };
  }
  try {
    const pcm = await recordPcm16k(opts);
    const result = scorePcmAgainstWord(pcm, foreign, cache);
    if (!result) return { ok: false, reason: "score-failed" };
    return { ok: true, ...result, pcmLength: pcm.length };
  } catch (err) {
    const code = err?.code || "";
    const msg = String(err?.message || err || "");
    if (code === "no-speech" || msg.includes("no-speech")) {
      return { ok: false, reason: "no-speech" };
    }
    if (code === "too-short" || msg.includes("too-short") || msg.includes("empty-recording")) {
      return { ok: false, reason: "too-short" };
    }
    return { ok: false, reason: msg || "record-failed" };
  }
}
