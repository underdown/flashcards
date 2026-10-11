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

export const SCORE_CENTER = 50;
export const SCORE_SCALE = 0.12;

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

/**
 * Record mic for `maxMs` (or until silence after speech), return 16 kHz mono Float64.
 * Uses Web Audio — works in Chrome/Edge/Firefox/Safari with mic permission.
 */
export async function recordPcm16k({ maxMs = 4000, silenceMs = 700, minMs = 400 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  // ScriptProcessor is deprecated but universal; 4096 buffer is fine for short words.
  const bufferSize = 4096;
  const processor = ctx.createScriptProcessor
    ? ctx.createScriptProcessor(bufferSize, 1, 1)
    : null;

  const chunks = [];
  let spoken = false;
  let silentFor = 0;
  const started = performance.now();

  const onAudio = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    // crude energy
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const elapsed = performance.now() - started;
    if (rms > 0.02) {
      spoken = true;
      silentFor = 0;
    } else if (spoken) {
      silentFor += (input.length / ctx.sampleRate) * 1000;
    }
    if (elapsed >= maxMs || (spoken && elapsed >= minMs && silentFor >= silenceMs)) {
      stop();
    }
  };

  let stopped = false;
  let resolveStop;
  const done = new Promise((r) => {
    resolveStop = r;
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    resolveStop();
  }

  if (!processor) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    throw new Error("ScriptProcessor not available");
  }

  processor.onaudioprocess = onAudio;
  source.connect(processor);
  processor.connect(ctx.destination); // required in some browsers; near-silent gain
  // mute monitor
  const gain = ctx.createGain();
  gain.gain.value = 0;
  processor.disconnect();
  source.connect(processor);
  processor.connect(gain);
  gain.connect(ctx.destination);

  // hard timeout
  setTimeout(stop, maxMs + 200);
  await done;
  const rate = ctx.sampleRate;
  await ctx.close();

  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return resampleTo16k(merged, rate);
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
  const pcm = await recordPcm16k(opts);
  const result = scorePcmAgainstWord(pcm, foreign, cache);
  if (!result) return { ok: false, reason: "score-failed" };
  return { ok: true, ...result, pcmLength: pcm.length };
}
