const BAR_GAP = 1;
const MIN_BAR = 2;

function readWaveColors(rootEl) {
  const style = getComputedStyle(rootEl);
  const fallback = getComputedStyle(document.documentElement);
  return {
    base: style.getPropertyValue("--wave-base").trim() || fallback.getPropertyValue("--wave-base").trim() || "rgba(138, 128, 116, 0.28)",
    progress: style.getPropertyValue("--wave-progress").trim() || fallback.getPropertyValue("--wave-progress").trim() || "rgba(138, 128, 116, 0.72)",
    active:
      style.getPropertyValue("--wave-active").trim() ||
      style.getPropertyValue("--speaker-active").trim() ||
      fallback.getPropertyValue("--wave-active").trim() ||
      fallback.getPropertyValue("--speaker-active").trim() ||
      "#8a6f4a",
  };
}

export function createReadingWaveform(rootEl) {
  const canvas = rootEl.querySelector(".audio-wave__canvas");
  const ctx = canvas.getContext("2d");
  let peaks = null;
  let progress = 0;
  let playing = false;
  let barCount = 0;

  function hide() {
    rootEl.hidden = true;
  }

  function show() {
    rootEl.hidden = false;
  }

  function setPeaks(nextPeaks) {
    peaks = nextPeaks;
    barCount = nextPeaks?.length ?? 0;
    if (barCount) show();
    else hide();
    draw();
  }

  function setProgress(next) {
    progress = Math.max(0, Math.min(1, next));
    draw();
  }

  function setPlaying(active) {
    playing = active;
    rootEl.classList.toggle("audio-wave--active", active);
    draw();
  }

  function reset() {
    progress = 0;
    playing = false;
    rootEl.classList.remove("audio-wave--active");
    draw();
  }

  function resize() {
    if (!peaks?.length) return;
    const rect = rootEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    draw();
  }

  function draw() {
    if (!peaks?.length) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    const colors = readWaveColors(rootEl);
    const count = peaks.length;
    const totalGap = BAR_GAP * dpr * (count - 1);
    const barWidth = Math.max(MIN_BAR * dpr, (width - totalGap) / count);
    const playX = progress * width;
    const centerY = height / 2;
    const maxAmp = height * 0.42;
    const progressColor = playing ? colors.active : colors.progress;

    let maxPeak = 0;
    for (let i = 0; i < count; i++) {
      maxPeak = Math.max(maxPeak, peaks[i]);
    }
    if (maxPeak <= 0) maxPeak = 1;

    for (let i = 0; i < count; i++) {
      const x = i * (barWidth + BAR_GAP * dpr);
      const amp = Math.max(2 * dpr, (peaks[i] / maxPeak) * maxAmp);
      const y = centerY - amp / 2;
      const h = amp;

      ctx.fillStyle = colors.base;
      ctx.fillRect(x, y, barWidth, h);

      if (playX > x) {
        ctx.fillStyle = progressColor;
        ctx.fillRect(x, y, Math.min(barWidth, playX - x), h);
      }
    }
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(rootEl);

  return {
    hide,
    show,
    setPeaks,
    setProgress,
    setPlaying,
    reset,
    resize,
    destroy() {
      observer.disconnect();
    },
  };
}
