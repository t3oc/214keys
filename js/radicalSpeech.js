import radicals from "./radicals.js";

const MAX_VOICES = 8;
const TRIM_THRESHOLD = 0.012;
const TRIM_PAD_SEC = 0.004;
const TRIM_TAIL_SEC = 0.012;
const PITCH_MIN = 0.78;
const PITCH_MAX = 1.38;
export { PITCH_MIN, PITCH_MAX };

const BATCH_SIZE = 6;
const BATCH_GAP_MS = 16;

/** @type {Map<number, number[]>} */
const idsByStrokes = new Map();
for (const item of radicals) {
  const list = idsByStrokes.get(item.strokes) ?? [];
  list.push(item.id);
  idsByStrokes.set(item.strokes, list);
}

let audioContext = null;
let masterGain = null;
let activeSession = 0;

/** @type {Map<string, AudioBuffer>} */
const bufferCache = new Map();
/** @type {Map<string, Promise<AudioBuffer | null>>} */
const decodeFlights = new Map();
/** @type {Set<string>} */
const loadedGroups = new Set();
/** @type {Map<string, Promise<void>>} */
const groupLoads = new Map();

/** @type {{ source: AudioBufferSourceNode, session: number, lang: string }[]} */
const activeVoices = [];

/** @type {Map<string, string>} */
const lastSpeakKeyByLang = new Map();

function padId(id) {
  return String(id).padStart(3, "0");
}

export function audioUrl(lang, id) {
  return `audio/${lang}/${padId(id)}.mp3`;
}

function speakKey(lang, id) {
  return `${lang}:${id}`;
}

function groupKey(lang, strokes) {
  return `${lang}:${strokes}`;
}

function randomPitchRate() {
  return PITCH_MIN + Math.random() * (PITCH_MAX - PITCH_MIN);
}

function resolveUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

function getAudioGraph() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioContext.destination);
  }
  return { ctx: audioContext, gain: masterGain };
}

export function unlockSpeech() {
  const { ctx } = getAudioGraph();
  if (ctx.state === "suspended") void ctx.resume();
}

function trimSampleBuffer(buffer, ctx) {
  const channel = buffer.getChannelData(0);
  if (channel.length === 0) return buffer;

  let start = 0;
  let end = channel.length;

  for (let i = 0; i < channel.length; i++) {
    if (Math.abs(channel[i]) > TRIM_THRESHOLD) {
      start = Math.max(0, i - Math.floor(buffer.sampleRate * TRIM_PAD_SEC));
      break;
    }
  }

  for (let i = channel.length - 1; i >= start; i--) {
    if (Math.abs(channel[i]) > TRIM_THRESHOLD) {
      end = Math.min(channel.length, i + Math.floor(buffer.sampleRate * TRIM_TAIL_SEC));
      break;
    }
  }

  const length = end - start;
  if (length <= 0 || (start === 0 && end === channel.length)) return buffer;

  const trimmed = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    trimmed.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
  }
  return trimmed;
}

function removeVoice(voice) {
  const index = activeVoices.indexOf(voice);
  if (index >= 0) activeVoices.splice(index, 1);
  voice.stopProgress?.();
  try {
    voice.source.stop();
  } catch {
    /* already stopped */
  }
  voice.source.disconnect();
}

function stopSamplesForLang(lang) {
  for (let i = activeVoices.length - 1; i >= 0; i--) {
    if (activeVoices[i].lang === lang) removeVoice(activeVoices[i]);
  }
}

/** @type {Map<string, Float32Array>} */
const peakCache = new Map();

function computePeaks(buffer, bars = 140) {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / bars));
  const peaks = new Float32Array(bars);

  for (let i = 0; i < bars; i++) {
    let max = 0;
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    for (let j = start; j < end; j++) {
      max = Math.max(max, Math.abs(channel[j]));
    }
    peaks[i] = max;
  }

  return peaks;
}

async function decodeBuffer(url) {
  const key = resolveUrl(url);
  const cached = bufferCache.get(key);
  if (cached) return cached;

  const inflight = decodeFlights.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      const { ctx } = getAudioGraph();
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      const trimmed = trimSampleBuffer(decoded, ctx);
      bufferCache.set(key, trimmed);
      return trimmed;
    } catch {
      return null;
    } finally {
      decodeFlights.delete(key);
    }
  })();

  decodeFlights.set(key, task);
  return task;
}

function preloadBatch(urls) {
  return Promise.all(urls.map((url) => decodeBuffer(url)));
}

export function ensureStrokeGroupLoaded(strokes, lang) {
  const key = groupKey(lang, strokes);
  if (loadedGroups.has(key)) return Promise.resolve();
  const existing = groupLoads.get(key);
  if (existing) return existing;

  const ids = idsByStrokes.get(strokes) ?? [];
  const urls = ids.map((id) => audioUrl(lang, id));

  const task = (async () => {
    let index = 0;
    await new Promise((resolve) => {
      const pump = () => {
        const batch = urls.slice(index, index + BATCH_SIZE);
        index += BATCH_SIZE;
        void preloadBatch(batch).finally(() => {
          if (index < urls.length) window.setTimeout(pump, BATCH_GAP_MS);
          else resolve();
        });
      };
      pump();
    });
    loadedGroups.add(key);
  })().finally(() => {
    groupLoads.delete(key);
  });

  groupLoads.set(key, task);
  return task;
}

export function prefetchRadical(item, lang) {
  unlockSpeech();
  void decodeBuffer(audioUrl(lang, item.id));
}

function outputLatencySec(ctx) {
  return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
}

function playSample(buffer, session, lang, onStart, onEnd, onProgress) {
  unlockSpeech();

  while (activeVoices.length >= MAX_VOICES) {
    removeVoice(activeVoices[0]);
  }

  const { ctx, gain } = getAudioGraph();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const rate = randomPitchRate();
  source.playbackRate.value = rate;
  source.connect(gain);

  const voice = { source, session, lang, stopProgress: null };
  activeVoices.push(voice);

  const duration = buffer.duration / rate;
  const latency = outputLatencySec(ctx);
  const startAt = ctx.currentTime;
  let rafId = 0;
  let finished = false;

  const stopProgress = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };
  voice.stopProgress = stopProgress;

  const progressAt = (now) => {
    const elapsed = now - startAt;
    return Math.min(1, Math.max(0, (elapsed - latency) / duration));
  };

  const isAudibleDone = (now) => now - startAt >= duration + latency;

  const finishPlayback = () => {
    if (finished) return;
    finished = true;
    stopProgress();
    onProgress?.(1);
    if (session === activeSession) onEnd();
  };

  const tick = () => {
    if (session !== activeSession) {
      stopProgress();
      return;
    }
    const now = ctx.currentTime;
    onProgress?.(progressAt(now));
    if (isAudibleDone(now)) {
      finishPlayback();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  source.onended = () => {
    removeVoice(voice);
    if (finished) return;
    if (isAudibleDone(ctx.currentTime)) {
      finishPlayback();
    } else if (onProgress) {
      rafId = requestAnimationFrame(tick);
    } else if (session === activeSession) {
      onEnd();
    }
  };

  source.start(startAt);
  onStart(rate);
  if (onProgress) rafId = requestAnimationFrame(tick);
}

export function speakRadical(item, lang, options = {}) {
  const key = speakKey(lang, item.id);
  const same = lastSpeakKeyByLang.get(lang) === key;

  if (!same) {
    stopSamplesForLang(lang);
  }

  lastSpeakKeyByLang.set(lang, key);

  const session = ++activeSession;
  let started = false;
  let ended = false;

  const onStart = (rate) => {
    if (session !== activeSession || started) return;
    started = true;
    options.onStart?.(rate);
  };

  const onEnd = () => {
    if (session !== activeSession || ended) return;
    ended = true;
    options.onEnd?.();
  };

  unlockSpeech();
  void ensureStrokeGroupLoaded(item.strokes, lang);

  const url = audioUrl(lang, item.id);
  const cached = bufferCache.get(resolveUrl(url));
  if (cached) {
    playSample(cached, session, lang, onStart, onEnd, options.onProgress);
    return;
  }

  options.onLoadStart?.();

  void decodeBuffer(url).then((buffer) => {
    if (session !== activeSession) return;
    if (buffer) playSample(buffer, session, lang, onStart, onEnd, options.onProgress);
    else onEnd();
  });
}

export function getSamplePeaks(lang, id, bars = 140) {
  const key = resolveUrl(audioUrl(lang, id));
  const buffer = bufferCache.get(key);
  if (!buffer) return null;

  const cacheKey = `${key}:${bars}`;
  const cachedPeaks = peakCache.get(cacheKey);
  if (cachedPeaks) return cachedPeaks;

  const peaks = computePeaks(buffer, bars);
  peakCache.set(cacheKey, peaks);
  return peaks;
}

export async function loadSamplePeaks(lang, id, bars = 140) {
  const buffer = await decodeBuffer(audioUrl(lang, id));
  if (!buffer) return null;
  return getSamplePeaks(lang, id, bars);
}

export function isSampleReady(lang, id) {
  return bufferCache.has(resolveUrl(audioUrl(lang, id)));
}

export function isSampleLoading(lang, id) {
  return decodeFlights.has(resolveUrl(audioUrl(lang, id)));
}

export function isGroupLoaded(strokes, lang) {
  return loadedGroups.has(groupKey(lang, strokes));
}
