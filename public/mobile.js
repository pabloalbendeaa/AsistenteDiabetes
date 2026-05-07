// =========================
// SOCKET
// =========================
const socket = io();

// =========================
// ELEMENTOS
// =========================
const glucoseValueEl = document.getElementById('glucoseValue');
const trendEl = document.getElementById('trend');
const statusEl = document.getElementById('status');
const drivingStatusEl = document.getElementById('drivingStatus');
const motionValueEl = document.getElementById('motionValue');
const lastCommandEl = document.getElementById('lastCommand');
const systemMessageEl = document.getElementById('systemMessage');
const screenNameEl = document.getElementById('screenName');
const listenButton = document.getElementById('listenButton');
const emergencyButton = document.getElementById('emergencyButton');

// Navegación
const mainScreenButton = document.getElementById('mainScreenButton');
const trendScreenButton = document.getElementById('trendScreenButton');
const lowScreenButton = document.getElementById('lowScreenButton');
const highScreenButton = document.getElementById('highScreenButton');

// Escenarios
const stableScenarioButton = document.getElementById('stableScenarioButton');
const downScenarioButton = document.getElementById('downScenarioButton');
const upScenarioButton = document.getElementById('upScenarioButton');
const lowScenarioButton = document.getElementById('lowScenarioButton');
const highScenarioButton = document.getElementById('highScenarioButton');

// Gestos
const gestureVideo = document.getElementById('gestureVideo');
const gestureStatus = document.getElementById('gestureStatus');
const startGestureButton = document.getElementById('startGestureButton');
const stopGestureButton = document.getElementById('stopGestureButton');
const gestureNextButton = document.getElementById('gestureNextButton');
const gesturePrevButton = document.getElementById('gesturePrevButton');
const gestureConfirmButton = document.getElementById('gestureConfirmButton');
const gestureCancelButton = document.getElementById('gestureCancelButton');

// =========================
// ESTADO LOCAL
// =========================
let currentScreen = 'main';
let recognition = null;
let recognitionActive = false;
let isSpeakingNow = false;
let commandBlocked = false;
let commandBlockTimer = null;

// =========================
// UTILS
// =========================
function createMessageId() {
  return `${Date.now()}-${Math.random()}`;
}

function patchState(patch) {
  if (patch.message) {
    patch.messageId = createMessageId();
  }
  socket.emit('state:patch', patch);
}

function changeScreen(screen) {
  currentScreen = screen;
  socket.emit('screen:change', screen);
  patchState({ lastCommand: '' });
}

// =========================
// BLOQUEO DE COMANDOS
// =========================
function blockCommands(ms = 6000) {
  commandBlocked = true;
  clearTimeout(commandBlockTimer);
  commandBlockTimer = setTimeout(() => {
    commandBlocked = false;
  }, ms);
}

// =========================
// UI
// =========================
function updateMobileUI(state) {
  glucoseValueEl.textContent = `${state.glucose} mg/dL`;
  trendEl.textContent = state.trend;
  statusEl.textContent = state.status;
  statusEl.className = `status ${state.statusClass}`;

  drivingStatusEl.textContent = state.driving
    ? 'Conducción detectada'
    : 'Sin movimiento';

  motionValueEl.textContent = Number(state.motionValue || 0).toFixed(2);
  lastCommandEl.textContent = state.lastCommand || 'Ninguno';
  systemMessageEl.textContent = state.message || 'Sistema iniciado.';
  screenNameEl.textContent = state.screen || 'Principal';
}

// =========================
// VOZ
// =========================
function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';

  isSpeakingNow = true;
  blockCommands(6000);

  if (recognition && recognitionActive) {
    try { recognition.stop(); } catch (e) {}
  }

  utterance.onend = () => {
    isSpeakingNow = false;
    if (recognitionActive) {
      setTimeout(() => {
        try { recognition.start(); } catch (e) {}
      }, 1500);
    }
  };

  utterance.onerror = () => {
    isSpeakingNow = false;
    if (recognitionActive) {
      setTimeout(() => {
        try { recognition.start(); } catch (e) {}
      }, 1500);
    }
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// =========================
// EMERGENCIA
// =========================
function activateEmergency() {
  const message = 'Emergencia activada. Llamando al 112. Compartiendo localización.';
  patchState({
    message,
    lastCommand: 'emergencia',
    emergency: true,
    screen: 'emergency'
  });
  socket.emit('screen:change', 'emergency');
  speak('Emergencia activada. Llamando al 112.');
}

// =========================
// ESCENARIOS
// =========================
function setScenario(scenario) {
  socket.emit('scenario:change', scenario);
  patchState({ lastCommand: '' });

  const names = {
    stable: 'Estable',
    down: 'Bajando',
    up: 'Subiendo',
    low: 'Bajo',
    high: 'Alto'
  };
  speak(`Escenario ${names[scenario] || scenario}`);
}

// =========================
// COMANDOS VOZ
// =========================
function handleVoiceCommand(command) {
  if (commandBlocked || isSpeakingNow) return;

  const text = command.toLowerCase();

  // CONSULTA GLUCOSA
  if (text.includes('azúcar') || text.includes('glucosa') || text === 'estado') {
    const response = `Tu glucosa actual es ${glucoseValueEl.textContent}. Tendencia ${trendEl.textContent}.`;
    patchState({ message: response, lastCommand: 'consulta glucosa' });
    speak(response);
    return;
  }

  // TENDENCIA
  if (text.includes('tendencia')) {
    changeScreen('trend');
    speak('Mostrando tendencia');
    return;
  }

  // PRINCIPAL
  if (text.includes('principal')) {
    changeScreen('main');
    speak('Pantalla principal');
    return;
  }

  // EMERGENCIA
  if (text.includes('emergencia')) {
    activateEmergency();
    return;
  }

  // ESCENARIOS POR VOZ
  if (text.includes('escenario') || text.includes('cambiar')) {
    if (text.includes('estable') || text.includes('normal')) {
      setScenario('stable');
      return;
    }
    if (text.includes('bajando') || text.includes('baja') || text.includes('bajo')) {
      setScenario('down');
      return;
    }
    if (text.includes('subiendo') || text.includes('sube') || text.includes('alto')) {
      setScenario('up');
      return;
    }
    if (text.includes('hipoglucemia') || text.includes('muy bajo') || text.includes('crítico bajo')) {
      setScenario('low');
      return;
    }
    if (text.includes('hiperglucemia') || text.includes('muy alto') || text.includes('crítico alto')) {
      setScenario('high');
      return;
    }
  }

  // ALERTA BAJA / ALTA por voz directa
  if (text.includes('alerta baja') || text.includes('glucosa baja')) {
    changeScreen('low');
    speak('Mostrando alerta de glucosa baja');
    return;
  }
  if (text.includes('alerta alta') || text.includes('glucosa alta')) {
    changeScreen('high');
    speak('Mostrando alerta de glucosa alta');
    return;
  }
}

// =========================
// GESTOS
// =========================
function handleGestureAction(action) {
  if (action === 'siguiente') {
    const order = ['main', 'trend', 'low', 'high'];
    const index = order.indexOf(currentScreen);
    const next = order[(index + 1) % order.length];
    changeScreen(next);
    speak(`Mostrando ${next}`);
    return;
  }

  if (action === 'anterior') {
    const order = ['main', 'trend', 'low', 'high'];
    const index = order.indexOf(currentScreen);
    const prev = order[(index - 1 + order.length) % order.length];
    changeScreen(prev);
    speak(`Mostrando ${prev}`);
    return;
  }

  if (action === 'consultar') {
    const response = `Tu glucosa actual es ${glucoseValueEl.textContent}. Tendencia ${trendEl.textContent}.`;
    patchState({ message: response, lastCommand: 'consulta glucosa' });
    speak(response);
    return;
  }

  if (action === 'cancelar') {
    changeScreen('main');
    speak('Cancelado');
  }
}

// =========================
// CÁMARA / GESTOS TEACHABLE MACHINE
// =========================
let gestureModel = null;
let gestureCameraActive = false;
let gestureLoopId = null;

async function startGestureCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    gestureVideo.srcObject = stream;
    gestureCameraActive = true;

    // Si tienes modelo Teachable Machine, cárgalo aquí:
    // const modelURL = 'URL_DE_TU_MODELO/model.json';
    // const metadataURL = 'URL_DE_TU_MODELO/metadata.json';
    // gestureModel = await tmImage.load(modelURL, metadataURL);
    // gestureLoop();
  } catch (e) {
    console.error('Error accediendo a la cámara:', e);
    gestureStatus.textContent = 'Error: sin acceso a cámara';
  }
}

function stopGestureCamera() {
  if (gestureVideo.srcObject) {
    gestureVideo.srcObject.getTracks().forEach(t => t.stop());
    gestureVideo.srcObject = null;
  }
  gestureCameraActive = false;
  if (gestureLoopId) {
    cancelAnimationFrame(gestureLoopId);
    gestureLoopId = null;
  }
  gestureStatus.textContent = 'Cámara desactivada';
}

async function gestureLoop() {
  if (!gestureCameraActive || !gestureModel) return;

  const prediction = await gestureModel.predict(gestureVideo);
  const top = prediction.reduce((a, b) => a.probability > b.probability ? a : b);

  if (top.probability > 0.85) {
    gestureStatus.textContent = top.className;
    handleGestureAction(top.className.toLowerCase());
  }

  gestureLoopId = requestAnimationFrame(gestureLoop);
}

// =========================
// SPEECH RECOGNITION
// =========================
function initSpeech() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.lang = 'es-ES';
  rec.continuous = true;

  rec.onresult = (event) => {
    if (commandBlocked || isSpeakingNow) return;
    const transcript = event.results[event.results.length - 1][0].transcript;
    handleVoiceCommand(transcript);
  };

  rec.onend = () => {
    if (recognitionActive && !isSpeakingNow) {
      setTimeout(() => {
        try { rec.start(); } catch (e) {}
      }, 300);
    }
  };

  return rec;
}

// =========================
// SOCKET
// =========================
socket.on('state:update', (state) => {
  updateMobileUI(state);
});

// =========================
// BOTONES NAVEGACIÓN
// =========================
mainScreenButton.addEventListener('click', () => {
  changeScreen('main');
  speak('Pantalla principal');
});

trendScreenButton.addEventListener('click', () => {
  changeScreen('trend');
  speak('Mostrando tendencia');
});

lowScreenButton.addEventListener('click', () => {
  changeScreen('low');
  speak('Alerta de glucosa baja');
});

highScreenButton.addEventListener('click', () => {
  changeScreen('high');
  speak('Alerta de glucosa alta');
});

// =========================
// BOTONES ESCENARIOS
// =========================
stableScenarioButton.addEventListener('click', () => setScenario('stable'));
downScenarioButton.addEventListener('click', () => setScenario('down'));
upScenarioButton.addEventListener('click', () => setScenario('up'));
lowScenarioButton.addEventListener('click', () => setScenario('low'));
highScenarioButton.addEventListener('click', () => setScenario('high'));

// =========================
// BOTÓN EMERGENCIA
// =========================
emergencyButton.addEventListener('click', () => activateEmergency());

// =========================
// BOTONES GESTOS
// =========================
startGestureButton.addEventListener('click', () => startGestureCamera());
stopGestureButton.addEventListener('click', () => stopGestureCamera());
gestureNextButton.addEventListener('click', () => handleGestureAction('siguiente'));
gesturePrevButton.addEventListener('click', () => handleGestureAction('anterior'));
gestureConfirmButton.addEventListener('click', () => handleGestureAction('consultar'));
gestureCancelButton.addEventListener('click', () => handleGestureAction('cancelar'));

// =========================
// BOTÓN VOZ
// =========================
listenButton.addEventListener('click', () => {
  if (!recognition) recognition = initSpeech();
  if (!recognition) return;

  if (!recognitionActive) {
    recognition.start();
    recognitionActive = true;
    listenButton.textContent = '🔴 Escuchando...';
  } else {
    recognition.stop();
    recognitionActive = false;
    listenButton.textContent = '🎤 Activar voz';
  }
});

