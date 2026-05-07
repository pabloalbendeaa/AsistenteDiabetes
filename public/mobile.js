// =========================
// CONFIG
// =========================
// Pega aquí la URL de tu modelo Teachable Machine cuando lo entrenes.
// Debe contener model.json + metadata.json. Clases esperadas:
// "siguiente", "anterior", "consultar", "cancelar".
const GESTURE_MODEL_URL = '/tm-model/';
const GESTURE_CONFIDENCE = 0.85;

// Umbral de impacto (m/s^2 normalizado restando gravedad). Ajustable.
const IMPACT_THRESHOLD = 25;

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

// Emergencia (overlay móvil — añadido en mobile.html)
const emergencyOverlay = document.getElementById('emergencyOverlay');
const emergencyOverlayMessage = document.getElementById('emergencyOverlayMessage');
const emergencyClearButton = document.getElementById('emergencyClearButton');
const emergencySteps = document.querySelectorAll('.emergency-step-mobile');

// =========================
// ESTADO LOCAL
// =========================
let currentScreen = 'main';
let currentEmergency = false;
let recognition = null;
let recognitionActive = false;
let isSpeakingNow = false;
let commandBlocked = false;
let commandBlockTimer = null;

// Conducción (DeviceMotion)
let isDrivingDetected = false;
let motionCounter = 0;
let stillCounter = 0;
let lastImpactSentAt = 0;

// Emergencia
let emergencyStepIndex = 0;
let emergencyStepInterval = null;

// =========================
// UTILS
// =========================
function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  screenNameEl.textContent = labelFromScreen(state.screen);

  currentScreen = state.screen || 'main';
  applyEmergencyOverlay(state);
}

function labelFromScreen(screen) {
  const labels = {
    main: 'Principal',
    trend: 'Tendencia',
    low: 'Alerta baja',
    high: 'Alerta alta',
    emergency: 'Emergencia'
  };
  return labels[screen] || 'Principal';
}

// =========================
// EMERGENCIA UI MÓVIL
// =========================
function applyEmergencyOverlay(state) {
  const isEmergency = !!state.emergency;

  if (isEmergency && !currentEmergency) {
    currentEmergency = true;
    if (emergencyOverlay) {
      emergencyOverlay.classList.add('active');
      document.body.classList.add('mobile-emergency-mode');
      if (emergencyOverlayMessage) {
        emergencyOverlayMessage.textContent = state.message || 'Emergencia activada.';
      }
      startEmergencyStepsAnimation();
    }
  } else if (!isEmergency && currentEmergency) {
    currentEmergency = false;
    if (emergencyOverlay) {
      emergencyOverlay.classList.remove('active');
      document.body.classList.remove('mobile-emergency-mode');
      stopEmergencyStepsAnimation();
    }
  } else if (isEmergency && emergencyOverlayMessage) {
    emergencyOverlayMessage.textContent = state.message || 'Emergencia activada.';
  }
}

function startEmergencyStepsAnimation() {
  if (emergencyStepInterval || !emergencySteps.length) return;
  emergencyStepIndex = 0;
  emergencyStepInterval = setInterval(() => {
    if (emergencyStepIndex < emergencySteps.length) {
      emergencySteps.forEach((step, idx) => {
        step.classList.toggle('active', idx === emergencyStepIndex);
      });
      emergencyStepIndex += 1;
    } else {
      clearInterval(emergencyStepInterval);
      emergencyStepInterval = null;
    }
  }, 1500);
}

function stopEmergencyStepsAnimation() {
  if (emergencyStepInterval) {
    clearInterval(emergencyStepInterval);
    emergencyStepInterval = null;
  }
  emergencyStepIndex = 0;
  emergencySteps.forEach((step) => step.classList.remove('active'));
}

// =========================
// VOZ (TTS)
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
// EMERGENCIA (acciones)
// =========================
function activateEmergency(message) {
  const text = message || 'Emergencia activada. Llamando al 112. Compartiendo localización.';
  socket.emit('emergency:trigger', { message: text });
  speak('Emergencia activada. Llamando al 112.');
}

function clearEmergency() {
  socket.emit('emergency:clear');
  speak('Emergencia cancelada.');
}

// =========================
// ESCENARIOS
// =========================
function setScenario(scenario) {
  socket.emit('scenario:change', scenario);

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
  socket.emit('command:recognized', text);

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

  // CANCELAR EMERGENCIA
  if (text.includes('cancelar emergencia') || text.includes('falsa alarma')) {
    clearEmergency();
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
    if (text.includes('bajando')) {
      setScenario('down');
      return;
    }
    if (text.includes('subiendo')) {
      setScenario('up');
      return;
    }
    if (text.includes('hipoglucemia') || text.includes('muy bajo') || text.includes('crítico bajo') || text.includes('bajo')) {
      setScenario('low');
      return;
    }
    if (text.includes('hiperglucemia') || text.includes('muy alto') || text.includes('crítico alto') || text.includes('alto')) {
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
  if (action === 'siguiente' && currentScreen === 'main') {
    changeScreen('trend');
    speak('Mostrando tendencia');
    return;
  }

  if (action === 'anterior' && currentScreen === 'trend') {
    changeScreen('main');
    speak('Pantalla principal');
    return;
  }

  if (action === 'consultar' || action === 'consulta glucosa') {
    const response = `Tu glucosa actual es ${glucoseValueEl.textContent}. Tendencia ${trendEl.textContent}.`;
    patchState({ message: response, lastCommand: 'consulta glucosa' });
    speak(response);
    return;
  }

  if (action === 'cancelar') {
    if (currentEmergency) {
      clearEmergency();
    } else {
      changeScreen('main');
      speak('Cancelado');
    }
  }
}

// =========================
// CÁMARA / GESTOS TEACHABLE MACHINE
// =========================
let gestureModel = null;
let gestureCameraActive = false;
let gestureLoopId = null;
let lastGestureSentAt = 0;
const GESTURE_COOLDOWN_MS = 2000;

async function startGestureCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    gestureVideo.srcObject = stream;
    gestureCameraActive = true;
    gestureStatus.textContent = 'Cámara activada';

    if (GESTURE_MODEL_URL && typeof tmImage !== 'undefined') {
      try {
        const modelURL = `${GESTURE_MODEL_URL.replace(/\/$/, '')}/model.json`;
        const metadataURL = `${GESTURE_MODEL_URL.replace(/\/$/, '')}/metadata.json`;
        gestureModel = await tmImage.load(modelURL, metadataURL);
        gestureStatus.textContent = 'Modelo cargado. Detectando...';
        gestureLoop();
      } catch (modelErr) {
        console.error('Error cargando modelo TM:', modelErr);
        gestureStatus.textContent = 'Modelo no disponible (modo simulación)';
      }
    } else {
      gestureStatus.textContent = 'Cámara activa (sin modelo, usa simulación)';
    }
  } catch (e) {
    console.error('Error accediendo a la cámara:', e);
    gestureStatus.textContent = 'Error: sin acceso a cámara';
  }
}

function stopGestureCamera() {
  if (gestureVideo.srcObject) {
    gestureVideo.srcObject.getTracks().forEach((t) => t.stop());
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

  try {
    const prediction = await gestureModel.predict(gestureVideo);
    const top = prediction.reduce((a, b) => (a.probability > b.probability ? a : b));

    const detected = top.className.toLowerCase().trim();
    const pct = Math.round(top.probability * 100);
    const label = detected === 'nada' ? 'Sin gesto' : top.className;
    gestureStatus.textContent = `${label} (${pct}%)`;

    if (top.probability >= GESTURE_CONFIDENCE && detected !== 'nada') {
      const now = Date.now();
      if (now - lastGestureSentAt > GESTURE_COOLDOWN_MS) {
        lastGestureSentAt = now;
        gestureStatus.textContent = `✓ ${top.className} (${pct}%)`;
        gestureStatus.classList.add('gesture-triggered');
        setTimeout(() => gestureStatus.classList.remove('gesture-triggered'), 800);
        handleGestureAction(detected);
      }
    }
  } catch (err) {
    console.error('Error en gestureLoop:', err);
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
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      handleVoiceCommand(result[0].transcript);
    }
  };

  rec.onend = () => {
    if (recognitionActive && !isSpeakingNow) {
      setTimeout(() => {
        try { rec.start(); } catch (e) {}
      }, 300);
    }
  };

  rec.onerror = (event) => {
    if (event.error === 'not-allowed') {
      recognitionActive = false;
      listenButton.textContent = '🎤 Activar voz';
      systemMessageEl.textContent = 'Permiso de micrófono denegado.';
    }
  };

  return rec;
}

// =========================
// DEVICE MOTION (conducción + impacto)
// =========================
function handleMotionMagnitude(magnitude) {
  const MOTION_THRESHOLD = 1.8;

  if (magnitude > MOTION_THRESHOLD) {
    motionCounter += 1;
    stillCounter = 0;
  } else {
    stillCounter += 1;
    if (motionCounter > 0) motionCounter -= 1;
  }

  let drivingChanged = false;
  if (motionCounter >= 4 && !isDrivingDetected) {
    isDrivingDetected = true;
    drivingChanged = true;
  }
  if (stillCounter >= 8 && isDrivingDetected) {
    isDrivingDetected = false;
    drivingChanged = true;
  }

  if (drivingChanged) {
    socket.emit('driving:update', {
      driving: isDrivingDetected,
      motionValue: magnitude
    });
  }

  // Impacto: dispara emergencia automática (con cooldown 10s)
  if (magnitude >= IMPACT_THRESHOLD) {
    const now = Date.now();
    if (now - lastImpactSentAt > 10000) {
      lastImpactSentAt = now;
      socket.emit('impact:detected', { motionValue: magnitude });
    }
  }
}

function initMotionDetection() {
  if (!window.DeviceMotionEvent) {
    drivingStatusEl.textContent = 'Sensores no disponibles';
    return;
  }

  const startListeningToMotion = () => {
    window.addEventListener('devicemotion', (event) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      const x = acc.x || 0;
      const y = acc.y || 0;
      const z = acc.z || 0;

      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const normalizedMovement = Math.abs(magnitude - 9.8);

      handleMotionMagnitude(normalizedMovement);
    });
  };

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+ exige interacción para pedir permiso
    const enableMotionOnce = async () => {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission === 'granted') {
          startListeningToMotion();
        } else {
          drivingStatusEl.textContent = 'Permiso de movimiento denegado';
        }
      } catch (error) {
        drivingStatusEl.textContent = 'Sensor de movimiento no disponible';
      }
      document.removeEventListener('click', enableMotionOnce);
      document.removeEventListener('touchstart', enableMotionOnce);
    };

    document.addEventListener('click', enableMotionOnce, { once: true });
    document.addEventListener('touchstart', enableMotionOnce, { once: true });
  } else {
    startListeningToMotion();
  }
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

if (emergencyClearButton) {
  emergencyClearButton.addEventListener('click', () => clearEmergency());
}

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
  if (!recognition) {
    systemMessageEl.textContent = 'Reconocimiento de voz no soportado en este navegador.';
    return;
  }

  if (!recognitionActive) {
    try { recognition.start(); } catch (e) {}
    recognitionActive = true;
    listenButton.textContent = '🔴 Escuchando...';
  } else {
    try { recognition.stop(); } catch (e) {}
    recognitionActive = false;
    listenButton.textContent = '🎤 Activar voz';
  }
});

// =========================
// INIT
// =========================
initMotionDetection();
