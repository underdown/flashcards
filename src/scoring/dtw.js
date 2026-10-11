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

/** Shared AudioContext — keep one for the page session. */
let sharedCtx = null;
/** Live mic stream — refreshed often; stale streams go silent after a few MediaRecorder cycles. */
let sharedStream = null;
let pendingStreamPromise = null;
let recordLock = Promise.resolve();
/** After a silent take, next acquire must be forced fresh. */
let forceFreshStream = false;
let streamGeneration = 0;

function getSharedAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("AudioContext not available");
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC({ latencyHint: "interactive" });
  }
  return sharedCtx;
}

function stopStreamTracks(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try {
        t.onended = null;
        t.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}

function wireTrackEnded(stream, gen) {
  try {
    stream.getAudioTracks().forEach((t) => {
      t.onended = () => {
        if (streamGeneration === gen && sharedStream === stream) {
          sharedStream = null;
          pendingStreamPromise = null;
          forceFreshStream = true;
        }
      };
    });
  } catch {
    /* ignore */
  }
}

function isStreamUsable(stream) {
  if (!stream) return false;
  const tracks = stream.getAudioTracks();
  if (!tracks.length) return false;
  return tracks.every((t) => {
    if (t.readyState !== "live") return false;
    if (t.enabled === false) return false;
    // muted=true often means the OS/browser has duck the track — treat as dead.
    if (t.muted === true) return false;
    return true;
  });
}

/**
 * MUST be called synchronously inside the mic-button click handler.
 * Resumes AudioContext and starts a FRESH getUserMedia under the user gesture.
 * Reusing one MediaStream across many MediaRecorder start/stop cycles is the
 * main "works a couple times then dies until refresh" failure mode in Chrome.
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
  // Always kick a fresh acquire on the gesture. Permission is cached after first grant.
  beginFreshMicAcquire();
  return ctx;
}

function beginFreshMicAcquire() {
  // Tear down previous stream so the device isn't held in a half-dead state.
  const old = sharedStream;
  sharedStream = null;
  pendingStreamPromise = null;
  streamGeneration += 1;
  const gen = streamGeneration;
  stopStreamTracks(old);
  forceFreshStream = false;

  const request = async () => {
    let stream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: { ideal: 1 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err) {
      if (streamGeneration === gen) pendingStreamPromise = null;
      throw err;
    }
    // A newer prime superseded this request — drop the orphan stream.
    if (streamGeneration !== gen) {
      stopStreamTracks(stream);
      return sharedStream;
    }
    stream.getAudioTracks().forEach((t) => {
      try {
        t.enabled = true;
      } catch {
        /* ignore */
      }
    });
    wireTrackEnded(stream, gen);
    sharedStream = stream;
    return stream;
  };

  pendingStreamPromise = request().catch((err) => {
    if (streamGeneration === gen) pendingStreamPromise = null;
    throw err;
  });
  return pendingStreamPromise;
}

async function ensureCtxRunning(ctx) {
  for (let i = 0; i < 8; i++) {
    if (ctx.state === "running") return true;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
    if (ctx.state === "running") return true;
    await new Promise((r) => setTimeout(r, 20 + i * 20));
  }
  return ctx.state === "running";
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

async function getMicStream({ force = false } = {}) {
  if (force || forceFreshStream) {
    return beginFreshMicAcquire();
  }

  if (pendingStreamPromise) {
    try {
      const s = await pendingStreamPromise;
      if (isStreamUsable(s)) {
        sharedStream = s;
        return sharedStream;
      }
    } catch {
      /* fall through */
    }
  }

  if (isStreamUsable(sharedStream)) {
    sharedStream.getAudioTracks().forEach((t) => {
      try {
        t.enabled = true;
      } catch {
        /* ignore */
      }
    });
    return sharedStream;
  }

  return beginFreshMicAcquire();
}

/** Drop the held mic (call on page hide). */
export function releaseMic() {
  forceFreshStream = true;
  pendingStreamPromise = null;
  streamGeneration += 1;
  const old = sharedStream;
  sharedStream = null;
  stopStreamTracks(old);
}

function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

function normalizePcmPeak(pcm, targetPeak = 0.4) {
  if (!pcm?.length) return pcm;
  const p = peakOf(pcm);
  if (!(p > 1e-6)) return pcm;
  if (p >= targetPeak * 0.8) return pcm;
  const gain = Math.min(20, targetPeak / p);
  const out = new Float64Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    let v = pcm[i] * gain;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    out[i] = v;
  }
  return out;
}

function trackInfo(stream) {
  try {
    const t = stream?.getAudioTracks?.()[0];
    if (!t) return "no-track";
    const s = t.getSettings ? t.getSettings() : {};
    return `${t.readyState}/en=${t.enabled}/muted=${!!t.muted}/sr=${s.sampleRate || "?"}`;
  } catch {
    return "track-err";
  }
}

/**
 * Fixed-window capture. Fresh MediaStream each prime; MediaRecorder primary;
 * ScriptProcessor backup. One automatic silent-retry with a forced-fresh stream.
 */
export async function recordPcm16k(opts = {}) {
  const {
    maxMs = 2800,
    noSpeechPeak = 0.0005,
    _retry = 0,
  } = opts;

  let releaseLock = () => {};
  const prev = recordLock;
  recordLock = new Promise((r) => {
    releaseLock = r;
  });
  await prev;

  try {
    return await captureOnce({
      maxMs,
      noSpeechPeak,
      _retry,
      forceStream: _retry > 0 || forceFreshStream,
    });
  } catch (err) {
    // One automatic retry on silence with a brand-new stream (permission already granted).
    const silent =
      err?.code === "no-speech" ||
      err?.code === "too-short" ||
      /no-speech|empty-recording|too-short/i.test(String(err?.message || ""));
    if (silent && _retry < 1) {
      forceFreshStream = true;
      try {
        return await captureOnce({
          maxMs,
          noSpeechPeak,
          _retry: _retry + 1,
          forceStream: true,
        });
      } catch (err2) {
        throw err2;
      }
    }
    forceFreshStream = true;
    throw err;
  } finally {
    releaseLock();
  }
}

async function captureOnce({ maxMs, noSpeechPeak, _retry, forceStream }) {
  const ctx = getSharedAudioContext();
  // Resume again after awaits — browsers re-suspend freely.
  await ensureCtxRunning(ctx);

  let stream;
  try {
    stream = await getMicStream({ force: forceStream });
  } catch (err) {
    err.code = err.code || "mic-permission";
    throw err;
  }

  await ensureCtxRunning(ctx);

  // Brief settle so a brand-new track actually delivers samples.
  await new Promise((r) => setTimeout(r, 80));

  // If the track claims live but is muted, force a fresh stream once.
  if (!isStreamUsable(stream) || stream.getAudioTracks().some((t) => t.muted)) {
    stream = await getMicStream({ force: true });
    await ensureCtxRunning(ctx);
    await new Promise((r) => setTimeout(r, 80));
  }

  const mime = pickRecorderMime();
  const diag = {
    ctx: ctx.state,
    track: trackInfo(stream),
    mime: mime || "default",
    maxMs,
    retry: _retry,
  };

  const recordMs = Math.max(1200, Math.min(6000, maxMs || 2800));

  // --- ScriptProcessor backup (direct PCM) ---
  const spChunks = [];
  let spTap = null;
  let spProc = null;
  let spMute = null;
  let spPeak = 0;
  if (ctx.state === "running" && typeof ctx.createScriptProcessor === "function") {
    try {
      spProc = ctx.createScriptProcessor(4096, 1, 1);
      spMute = ctx.createGain();
      spMute.gain.value = 0;
      spTap = ctx.createMediaStreamSource(stream);
      spProc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        spChunks.push(Float32Array.from(input));
        const p = peakOf(input);
        if (p > spPeak) spPeak = p;
      };
      spTap.connect(spProc);
      spProc.connect(spMute);
      spMute.connect(ctx.destination);
    } catch {
      spProc = null;
    }
  }

  let mrPcm = null;
  let mrErr = null;
  let mrPeak = 0;
  let mrBytes = 0;

  try {
    if (typeof MediaRecorder !== "undefined") {
      try {
        mrPcm = await recordFixedMediaRecorder(stream, ctx, mime, recordMs);
        mrPeak = peakOf(mrPcm);
        mrBytes = mrPcm.length;
      } catch (err) {
        mrErr = String(err?.message || err);
      }
    } else {
      // No MediaRecorder — wait the window for ScriptProcessor alone.
      await new Promise((r) => setTimeout(r, recordMs));
    }

    teardownSp();

    let spPcm = null;
    if (spChunks.length) {
      let total = 0;
      for (const c of spChunks) total += c.length;
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of spChunks) {
        merged.set(c, off);
        off += c.length;
      }
      spPcm = resampleTo16k(merged, ctx.sampleRate);
      if (spPcm) spPeak = peakOf(spPcm);
    }

    let best = null;
    let bestPeak = -1;
    let path = "none";
    if (mrPcm && mrPcm.length && mrPeak >= bestPeak) {
      best = mrPcm;
      bestPeak = mrPeak;
      path = "mediarecorder";
    }
    if (spPcm && spPcm.length && spPeak > bestPeak) {
      best = spPcm;
      bestPeak = spPeak;
      path = "scriptprocessor";
    }

    diag.path = path;
    diag.mrPeak = Number(mrPeak.toFixed(5));
    diag.spPeak = Number(spPeak.toFixed(5));
    diag.mrErr = mrErr;
    diag.mrSamples = mrBytes;
    diag.spSamples = spPcm ? spPcm.length : 0;
    diag.ctxAfter = ctx.state;

    if (!best || !best.length) {
      const err = new Error(mrErr || "empty-recording");
      err.code = "too-short";
      err.diag = diag;
      forceFreshStream = true;
      throw err;
    }

    const pcm = normalizePcmPeak(best);
    const peak = peakOf(pcm);
    diag.peak = Number(peak.toFixed(5));
    diag.samples = pcm.length;
    diag.seconds = Number((pcm.length / SR).toFixed(2));

    if (pcm.length < SR * 0.08 || peak < noSpeechPeak) {
      const err = new Error(
        peak < noSpeechPeak ? "no-speech-detected" : "recording-too-short"
      );
      err.code = peak < noSpeechPeak ? "no-speech" : "too-short";
      err.diag = diag;
      forceFreshStream = true;
      throw err;
    }

    // Success — keep stream for the next tap only briefly; next prime still refreshes.
    forceFreshStream = false;
    pcm._diag = diag;
    return pcm;
  } finally {
    teardownSp();
  }

  function teardownSp() {
    try {
      if (spProc) spProc.onaudioprocess = null;
      if (spProc) spProc.disconnect();
      if (spTap) spTap.disconnect();
      if (spMute) spMute.disconnect();
    } catch {
      /* ignore */
    }
    spProc = null;
    spTap = null;
    spMute = null;
  }
}

async function recordFixedMediaRecorder(stream, ctx, mime, recordMs) {
  const chunks = [];
  let recorder;
  try {
    recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 })
      : new MediaRecorder(stream);
  } catch {
    recorder = new MediaRecorder(stream);
  }

  let sawError = null;
  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => {
      sawError = e?.error?.message || "recorder-error";
      resolve();
    };
  });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  try {
    recorder.start(50);
  } catch (err) {
    throw err;
  }

  await new Promise((r) => setTimeout(r, recordMs));

  if (recorder.state === "recording" || recorder.state === "paused") {
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
  await Promise.race([stopped, new Promise((r) => setTimeout(r, 2500))]);

  if (sawError) throw new Error(sawError);
  if (!chunks.length) throw new Error("empty-recording");
  const blob = new Blob(chunks, {
    type: recorder.mimeType || mime || "audio/webm",
  });
  if (blob.size < 32) throw new Error("empty-recording");

  const ab = await blob.arrayBuffer();
  await ensureCtxRunning(ctx);
  const copy = ab.slice(0);
  let audioBuf;
  try {
    audioBuf = await ctx.decodeAudioData(copy);
  } catch (err) {
    // decodeAudioData can fail intermittently; bubble up so SP path can win.
    throw new Error(`decode-failed:${err?.message || err}`);
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

function formatDiag(diag) {
  if (!diag) return "";
  const bits = [
    diag.path && `path=${diag.path}`,
    diag.peak != null && `peak=${diag.peak}`,
    diag.seconds != null && `t=${diag.seconds}s`,
    diag.retry != null && `retry=${diag.retry}`,
    diag.ctx && `ctx=${diag.ctx}`,
    diag.mrErr && `mr=${diag.mrErr}`,
    diag.track && `tr=${diag.track}`,
  ].filter(Boolean);
  return bits.join(" ");
}

/** Convenience: record + score one word. Falls back null if no cache. */
export async function recordAndScoreWord(language, foreign, opts) {
  const cacheP = loadMfccCache(language);
  let pcm;
  let diag = null;
  try {
    // primeMicAudio on click already started acquire; this is a safety net.
    if (!pendingStreamPromise && !isStreamUsable(sharedStream)) {
      beginFreshMicAcquire();
    }
    pcm = await recordPcm16k(opts);
    diag = pcm?._diag || null;
  } catch (err) {
    forceFreshStream = true;
    diag = err?.diag || null;
    const code = err?.code || "";
    const msg = String(err?.message || err || "");
    const detail = formatDiag(diag);
    if (code === "no-speech" || msg.includes("no-speech")) {
      return { ok: false, reason: "no-speech", diag, detail };
    }
    if (
      code === "too-short" ||
      msg.includes("too-short") ||
      msg.includes("empty-recording")
    ) {
      return { ok: false, reason: "too-short", diag, detail };
    }
    if (code === "mic-permission" || /Permission|NotAllowed|NotFound/i.test(msg)) {
      return { ok: false, reason: "mic-permission", diag, detail: msg };
    }
    return { ok: false, reason: msg || "record-failed", diag, detail };
  }

  const cache = await cacheP;
  if (!cache?.by_word?.[foreign]) {
    return { ok: false, reason: "no-refs", diag };
  }
  const result = scorePcmAgainstWord(pcm, foreign, cache);
  if (!result) return { ok: false, reason: "score-failed", diag };
  return {
    ok: true,
    ...result,
    pcmLength: pcm.length,
    diag,
    detail: formatDiag(diag),
  };
}
