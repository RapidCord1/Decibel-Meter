const dbValueEl = document.getElementById("dbValue");
const minValueEl = document.getElementById("minValue");
const maxValueEl = document.getElementById("maxValue");
const avgValueEl = document.getElementById("avgValue");
const peakValueEl = document.getElementById("peakValue");
const meterBarEl = document.getElementById("meterBar");
const tierBadgeEl = document.getElementById("tierBadge");
const warningTextEl = document.getElementById("warningText");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");

const sensitivitySlider = document.getElementById("sensitivitySlider");
const offsetSlider = document.getElementById("offsetSlider");
const smoothnessSlider = document.getElementById("smoothnessSlider");
const sensitivityValueEl = document.getElementById("sensitivityValue");
const offsetValueEl = document.getElementById("offsetValue");
const smoothnessValueEl = document.getElementById("smoothnessValue");

let audioContext;
let analyser;
let microphone;
let stream;
let rafId;
let timeData;

let minDb = Infinity;
let maxDb = -Infinity;
let sumDb = 0;
let sampleCount = 0;

let smoothedDb = null;
const rawHistory = [];

let windowSize = 18;
const ATTACK_ALPHA = 0.18;
const RELEASE_ALPHA = 0.06;

const REFERENCE_DBFS = -50;
const SPL_AT_REFERENCE = 24;
const DISPLAY_FLOOR_DB = 22;
let dbfsToSplGain = 2.05;
let userOffset = 22;

function getTier(db) {
  if (db < 70) {
    return {
      name: "Good for Ears",
      tierClass: "tier-green",
      warningClass: "warning-safe",
      message: "Safe listening zone."
    };
  }
  if (db < 85) {
    return {
      name: "Caution",
      tierClass: "tier-yellow",
      warningClass: "warning-caution",
      message: "Moderate caution. Limit long exposure."
    };
  }
  return {
    name: "High Risk",
    tierClass: "tier-red",
    warningClass: "warning-risk",
    message: "Warning: High level can harm hearing over time."
  };
}

function updateCalibrationLabels() {
  sensitivityValueEl.textContent = dbfsToSplGain.toFixed(2);
  offsetValueEl.textContent = `${userOffset.toFixed(0)} dB`;
  smoothnessValueEl.textContent = `${windowSize}`;
}

function updateStats(db) {
  minDb = Math.min(minDb, db);
  maxDb = Math.max(maxDb, db);
  sumDb += db;
  sampleCount += 1;

  minValueEl.textContent = `${minDb.toFixed(1)} dB`;
  maxValueEl.textContent = `${maxDb.toFixed(1)} dB`;
  peakValueEl.textContent = `${maxDb.toFixed(1)} dB`;
  avgValueEl.textContent = `${(sumDb / sampleCount).toFixed(1)} dB`;
}

function resetStats() {
  minDb = Infinity;
  maxDb = -Infinity;
  sumDb = 0;
  sampleCount = 0;
  smoothedDb = null;
  rawHistory.length = 0;

  minValueEl.textContent = "-- dB";
  maxValueEl.textContent = "-- dB";
  peakValueEl.textContent = "-- dB";
  avgValueEl.textContent = "-- dB";
}

function calculateRmsDbfs() {
  analyser.getFloatTimeDomainData(timeData);

  let sumSquares = 0;
  for (let i = 0; i < timeData.length; i += 1) {
    const sample = timeData[i];
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / timeData.length);
  return 20 * Math.log10(rms || 0.000001);
}

function mapDbfsToSpl(dbfs) {
  const estimated = SPL_AT_REFERENCE + (dbfs - REFERENCE_DBFS) * dbfsToSplGain + userOffset;
  return Math.max(DISPLAY_FLOOR_DB, Math.min(120, estimated));
}

function smoothDb(rawDb) {
  rawHistory.push(rawDb);
  if (rawHistory.length > windowSize) {
    rawHistory.shift();
  }

  let sum = 0;
  for (let i = 0; i < rawHistory.length; i += 1) {
    sum += rawHistory[i];
  }
  const windowAverage = sum / rawHistory.length;

  if (smoothedDb === null) {
    smoothedDb = windowAverage;
    return smoothedDb;
  }

  const alpha = windowAverage > smoothedDb ? ATTACK_ALPHA : RELEASE_ALPHA;
  smoothedDb += alpha * (windowAverage - smoothedDb);
  return smoothedDb;
}

function render(db) {
  dbValueEl.innerHTML = `${db.toFixed(1)} <span>dB</span>`;
  meterBarEl.style.width = `${(db / 120) * 100}%`;

  const tier = getTier(db);
  tierBadgeEl.textContent = tier.name;
  tierBadgeEl.className = `tier ${tier.tierClass}`;

  warningTextEl.textContent = tier.message;
  warningTextEl.className = `warning ${tier.warningClass}`;
}

function measure() {
  const dbfs = calculateRmsDbfs();
  const rawDb = mapDbfsToSpl(dbfs);
  const displayDb = smoothDb(rawDb);

  render(displayDb);
  updateStats(displayDb);

  rafId = requestAnimationFrame(measure);
}

function setupCalibrationControls() {
  sensitivitySlider.addEventListener("input", () => {
    dbfsToSplGain = Number(sensitivitySlider.value);
    updateCalibrationLabels();
  });

  offsetSlider.addEventListener("input", () => {
    userOffset = Number(offsetSlider.value);
    updateCalibrationLabels();
  });

  smoothnessSlider.addEventListener("input", () => {
    windowSize = Number(smoothnessSlider.value);
    updateCalibrationLabels();

    if (rawHistory.length > windowSize) {
      rawHistory.splice(0, rawHistory.length - windowSize);
    }
  });

  updateCalibrationLabels();
}

async function startMeter() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;

    timeData = new Float32Array(analyser.fftSize);
    microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    measure();
  } catch (error) {
    alert("Microphone access is required to use the dB meter.");
    console.error(error);
  }
}

function stopMeter() {
  cancelAnimationFrame(rafId);

  if (microphone) {
    microphone.disconnect();
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

setupCalibrationControls();
startBtn.addEventListener("click", startMeter);
stopBtn.addEventListener("click", stopMeter);
resetBtn.addEventListener("click", resetStats);


