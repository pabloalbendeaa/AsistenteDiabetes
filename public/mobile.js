const socket = io();

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
const gestureVideo = document.getElementById('gestureVideo');
const gestureStatus = document.getElementById('gestureStatus');
const startGestureButton = document.getElementById('startGestureButton');
const stopGestureButton = document.getElementById('stopGestureButton');
const gestureNextButton = document.getElementById('gestureNextButton');
const gesturePrevButton = document.getElementById('gesturePrevButton');
const gestureConfirmButton = document.getElementById('gestureConfirmButton');
const gestureCancelButton = document.getElementById('gestureCancelButton');

const mainScreenButton = document.getElementById('mainScreenButton');
const trendScreenButton = document.getElementById('trendScreenButton');
const lowScreenButton = document.getElementById('lowScreenButton');
const highScreenButton = document.getElementById('highScreenButton');

const stableScenarioButton = document.getElementById('stableScenarioButton');
const downScenarioButton = document.getElementById('downScenarioButton');
const upScenarioButton = document.getElementById('upScenarioButton');
const lowScenarioButton = document.getElementById('lowScenarioButton');
const highScenarioButton = document.getElementById('highScenarioButton');

const feedbackBanner = document.getElementById('feedbackBanner');
const feedbackTitle = document.getElementById('feedbackTitle');
const feedbackText = document.getElementById('feedbackText');

let lastState = {};
let recognition = null;
let recognitionActive = false;

let isDrivingDetected = false;
let motionCounter = 0;
let stillCounter = 0;
let impactCooldown = false;

let gestureStream = null;
const currentScreenOrder = ['main', 'trend', 'low', 'high'];

let gestureModel = null;
let maxPredictions = 0;
let gestureLoopActive = false;
let lastDetectedGesture = 'ninguno';
let lastGestureTimestamp = 0;
let lastPredictedClass = 'ninguno';
let stableGestureFrames = 0;

let isSpeakingNow = false;
let gestureLockUntil = 0;
let emergencyTriggeredByClient = false;

const GESTURE_MODEL_URL = 'https://teachablemachine.withgoogle.com/models/7QWKsqai1/';

const screenLabels = {
  main: 'Principal',
  trend: 'Tendencia',
  low: 'Alerta baja',
  high: 'Alerta alta',
  emergency: 'Emergencia'
};

function updateMobileUI(state) {
  glucoseValueEl.textContent = `${state.glucose} mg/dL`;
  trendEl.textContent = state.trend;
  statusEl.textContent = state.status;
  statusEl.className = `status ${state.statusClass}`;

  drivingStatusEl.textContent = state.driving ? 'Conducción detectada' : 'Sin movimiento';
  motionValueEl.textContent = Number(state.motionValue || 0).toFixed(2);

  lastCommandEl.textContent = state.lastCommand || 'Ninguno';
  systemMessageEl.textContent = state.message || 'Sistema iniciado.';
  screenNameEl.textContent = screenLabels[state.screen] || 'Principal';
}

function patchState(patch) {
  socket.emit('state:patch', patch);
}

function changeScreen(screen) {
  socket.emit('screen:change', screen);
}

function showFeedback(type, title, text) {
  if (!feedbackBanner) return;

  feedbackBanner.className = `feedback-banner feedback-${type}`;
  feedbackTitle.textContent = title;
  feedbackText.textContent = text;

  feedbackBanner.classList.remove('feedback-pulse');
  void feedbackBanner.offsetWidth;
  feedbackBanner.classList.add('feedback-pulse');
}

function getNextScreen(currentScreen) {
  const currentIndex = currentScreenOrder.indexOf(currentScreen);
  if (currentIndex === -1) return 'main';
  return currentScreenOrder[(currentIndex + 1) % currentScreenOrder.length];
}

function getPreviousScreen(currentScreen) {
  const currentIndex = currentScreenOrder.indexOf(currentScreen);
  if (currentIndex === -1) return 'main';
  return currentScreenOrder[
    (currentIndex - 1 + currentScreenOrder.length) % currentScreenOrder.length
  ];
}

function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';

  isSpeakingNow = true;

  utterance.onend = () => {
    isSpeakingNow = false;
  };

  utterance.onerror = () => {
    isSpeakingNow = false;
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function handleGestureAction(action) {
  if (action === 'siguiente') {
    const nextScreen = getNextScreen(lastState.screen || 'main');
    lastState.screen = nextScreen;

    changeScreen(nextScreen);

    showFeedback(
      'info',
      'Gesto detectado',
      `Siguiente pantalla: ${screenLabels[nextScreen]}.`
    );

    patchState({
      message: `Gesto derecha → ${screenLabels[nextScreen]}`,
      lastCommand: 'Gesto derecha'
    });

    speak(`Mostrando ${screenLabels[nextScreen]}`);
    return;
  }

  if (action === 'anterior') {
    const previousScreen = getPreviousScreen(lastState.screen || 'main');
    lastState.screen = previousScreen;

    changeScreen(previousScreen);

    showFeedback(
      'info',
      'Gesto detectado',
      `Pantalla anterior: ${screenLabels[previousScreen]}.`
    );

    patchState({
      message: `Gesto izquierda → ${screenLabels[previousScreen]}`,
      lastCommand: 'Gesto izquierda'
    });

    speak(`Mostrando ${screenLabels[previousScreen]}`);
    return;
  }

  if (action === 'consultar') {
    const response = `Tu glucosa actual es ${glucoseValueEl.textContent}. Tendencia ${trendEl.textContent}.`;

    showFeedback('success', 'Consulta glucosa', response);

    patchState({
      message: response,
      lastCommand: 'consulta glucosa'
    });

    speak(response);
    return;
  }

  if (action === 'cancelar') {
    lastState.screen = 'main';
    changeScreen('main');

    showFeedback(
      'warning',
      'Acción cancelada',
      'Volviendo a la pantalla principal.'
    );

    patchState({
      message: 'Cancelado',
      lastCommand: 'Gesto puño'
    });

    speak('Cancelado');
  }
}

function handleVoiceCommand(command) {
  const text = command.toLowerCase().trim();

  socket.emit('command:recognized', command);

  if (
    text.includes('cuánto tengo') ||
    text.includes('consulta glucosa') ||
    text === 'estado'
  ) {
    const response = `Tu glucosa actual es ${glucoseValueEl.textContent}. Tendencia ${trendEl.textContent}.`;
    patchState({ message: response, lastCommand: 'consulta glucosa' });
    showFeedback('success', 'Consulta por voz', response);
    speak(response);
    return;
  }

  if (text.includes('ver tendencia') || text.includes('tendencia')) {
    changeScreen('trend');
    patchState({ message: 'Mostrando tendencia ampliada.', lastCommand: 'ver tendencia' });
    showFeedback('info', 'Navegación por voz', 'Mostrando tendencia ampliada.');
    speak('Mostrando tendencia');
    return;
  }

  if (text.includes('pantalla principal') || text.includes('principal')) {
    changeScreen('main');
    patchState({ message: 'Mostrando pantalla principal.', lastCommand: 'pantalla principal' });
    showFeedback('info', 'Navegación por voz', 'Mostrando pantalla principal.');
    speak('Pantalla principal');
    return;
  }

  if (text.includes('escenario estable')) {
    patchState({
      scenario: 'estable',
      glucose: 110,
      trend: 'Estable',
      status: 'Estado seguro',
      statusClass: 'safe',
      message: 'Escenario estable activado.',
      lastCommand: 'escenario estable'
    });
    showFeedback('success', 'Escenario activado', 'Escenario estable activado.');
    speak('Escenario estable activado');
    return;
  }

  if (text.includes('escenario bajando')) {
    patchState({
      scenario: 'bajando',
      glucose: 100,
      trend: 'Bajando',
      status: 'Precaución',
      statusClass: 'warning',
      message: 'Escenario bajando activado.',
      lastCommand: 'escenario bajando'
    });
    showFeedback('warning', 'Escenario activado', 'Glucosa bajando simulada.');
    speak('Escenario bajando activado');
    return;
  }

  if (text.includes('escenario subiendo')) {
    patchState({
      scenario: 'subiendo',
      glucose: 120,
      trend: 'Subiendo',
      status: 'En ascenso',
      statusClass: 'warning',
      message: 'Escenario subiendo activado.',
      lastCommand: 'escenario subiendo'
    });
    showFeedback('warning', 'Escenario activado', 'Glucosa subiendo simulada.');
    speak('Escenario subiendo activado');
    return;
  }

  if (text.includes('escenario bajo')) {
    patchState({
      scenario: 'bajo',
      glucose: 67,
      trend: 'Bajando rápido',
      status: 'Glucosa baja',
      statusClass: 'danger',
      message: 'Escenario de glucosa baja activado.',
      lastCommand: 'escenario bajo'
    });
    changeScreen('low');
    showFeedback('danger', 'Escenario activado', 'Glucosa baja simulada.');
    speak('Escenario bajo activado');
    return;
  }

  if (text.includes('escenario alto')) {
    patchState({
      scenario: 'alto',
      glucose: 185,
      trend: 'Subiendo',
      status: 'Glucosa alta',
      statusClass: 'warning',
      message: 'Escenario alto activado.',
      lastCommand: 'escenario alto'
    });
    changeScreen('high');
    showFeedback('warning', 'Escenario activado', 'Glucosa alta simulada.');
    speak('Escenario alto activado');
    return;
  }

  if (text.includes('emergencia')) {
    socket.emit('emergency:trigger', {
      message: 'Emergencia simulada activada por voz. Iniciando protocolo de aviso al 112.'
    });
    showFeedback('danger', 'Emergencia', 'Activando protocolo de emergencia simulado.');
    speak('Activando protocolo de emergencia');
  }
}

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    systemMessageEl.textContent = 'El navegador no soporta reconocimiento de voz.';
    return null;
  }

  const recognitionInstance = new SpeechRecognition();
  recognitionInstance.lang = 'es-ES';
  recognitionInstance.continuous = true;
  recognitionInstance.interimResults = false;
  recognitionInstance.maxAlternatives = 1;

  recognitionInstance.onstart = () => {
    recognitionActive = true;
    systemMessageEl.textContent = 'Escucha activa...';
  };

  recognitionInstance.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript;
    handleVoiceCommand(transcript);
  };

  recognitionInstance.onerror = (event) => {
    recognitionActive = false;

    if (event.error === 'not-allowed') {
      systemMessageEl.textContent = 'Chrome ha bloqueado el micrófono.';
      listenButton.textContent = 'Iniciar escucha';
      return;
    }

    console.log('Error voz:', event.error);
  };

  recognitionInstance.onend = () => {
    if (recognitionActive) {
      try {
        recognitionInstance.start();
      } catch (error) {
        console.log('Reinicio de voz no disponible');
      }
    }
  };

  return recognitionInstance;
}

function triggerEmergencyFromMotionAndGlucose(magnitude) {
  if (emergencyTriggeredByClient) return;

  const glucoseNumber = parseInt(glucoseValueEl.textContent, 10);
  const strongImpact = magnitude > 12;
  const lowGlucose = glucoseNumber <= 70;
  const criticalGlucose = glucoseNumber <= 55;

  if ((strongImpact && lowGlucose) || criticalGlucose) {
    emergencyTriggeredByClient = true;

    showFeedback(
      'danger',
      'Emergencia automática',
      'Se ha detectado una situación de riesgo. Activando protocolo de emergencia.'
    );

    socket.emit('emergency:trigger', {
      message: `Emergencia simulada activada automáticamente. Glucosa ${glucoseValueEl.textContent}, tendencia ${trendEl.textContent}, movimiento brusco detectado. Iniciando protocolo de aviso al 112.`
    });

    speak('Emergencia detectada. Contactando con servicios médicos.');
    gestureLockUntil = Date.now() + 4000;
  }
}

function handleMotionMagnitude(magnitude) {
  const MOTION_THRESHOLD = 1.8;
  const IMPACT_THRESHOLD = 12;

  if (magnitude > MOTION_THRESHOLD) {
    motionCounter += 1;
    stillCounter = 0;
  } else {
    stillCounter += 1;
    if (motionCounter > 0) {
      motionCounter -= 1;
    }
  }

  if (motionCounter >= 4) {
    isDrivingDetected = true;
  }

  if (stillCounter >= 8) {
    isDrivingDetected = false;
  }

  socket.emit('motion:update', {
    driving: isDrivingDetected,
    motionValue: magnitude
  });

  if (magnitude > IMPACT_THRESHOLD && !impactCooldown) {
    impactCooldown = true;

    triggerEmergencyFromMotionAndGlucose(magnitude);

    setTimeout(() => {
      impactCooldown = false;
    }, 5000);
  }
}

function initMotionDetection() {
  if (!window.DeviceMotionEvent) {
    console.log('Sensores no disponibles');
    return;
  }

  const startListeningToMotion = () => {
    window.addEventListener('devicemotion', (event) => {
      const acc = event.accelerationIncludingGravity;

      if (!acc) {
        return;
      }

      const x = acc.x || 0;
      const y = acc.y || 0;
      const z = acc.z || 0;

      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const normalizedMovement = Math.abs(magnitude - 9.8);

      handleMotionMagnitude(normalizedMovement);
    });
  };

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const enableMotionOnce = async () => {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission === 'granted') {
          startListeningToMotion();
        }
      } catch (error) {
        console.log('No se pudo activar el sensor');
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

socket.on('state:update', (state) => {
  lastState = state;
  updateMobileUI(state);

  if (!state.emergency) {
    emergencyTriggeredByClient = false;
  }

  if (state.glucose <= 55 && !state.emergency && !emergencyTriggeredByClient) {
    emergencyTriggeredByClient = true;

    showFeedback(
      'danger',
      'Glucosa crítica',
      'Nivel crítico detectado. Activando protocolo de emergencia.'
    );

    socket.emit('emergency:trigger', {
      message: `Emergencia simulada activada automáticamente por glucosa crítica (${state.glucose} mg/dL). Iniciando protocolo de aviso al 112.`
    });

    speak('Glucosa crítica detectada. Activando protocolo de emergencia.');
    gestureLockUntil = Date.now() + 4000;
  }
});

mainScreenButton.addEventListener('click', () => changeScreen('main'));
trendScreenButton.addEventListener('click', () => changeScreen('trend'));
lowScreenButton.addEventListener('click', () => changeScreen('low'));
highScreenButton.addEventListener('click', () => changeScreen('high'));

stableScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'estable',
    glucose: 110,
    trend: 'Estable',
    status: 'Estado seguro',
    statusClass: 'safe',
    message: 'Escenario estable activado.',
    lastCommand: 'escenario estable'
  });
  showFeedback('success', 'Escenario activado', 'Escenario estable activado.');
});

downScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'bajando',
    glucose: 100,
    trend: 'Bajando',
    status: 'Precaución',
    statusClass: 'warning',
    message: 'Escenario bajando activado.',
    lastCommand: 'escenario bajando'
  });
  showFeedback('warning', 'Escenario activado', 'Glucosa bajando simulada.');
});

upScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'subiendo',
    glucose: 120,
    trend: 'Subiendo',
    status: 'En ascenso',
    statusClass: 'warning',
    message: 'Escenario subiendo activado.',
    lastCommand: 'escenario subiendo'
  });
  showFeedback('warning', 'Escenario activado', 'Glucosa subiendo simulada.');
});

lowScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'bajo',
    glucose: 67,
    trend: 'Bajando rápido',
    status: 'Glucosa baja',
    statusClass: 'danger',
    message: 'Escenario de glucosa baja activado.',
    lastCommand: 'escenario bajo'
  });
  changeScreen('low');
  showFeedback('danger', 'Escenario activado', 'Glucosa baja simulada.');
});

highScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'alto',
    glucose: 185,
    trend: 'Subiendo',
    status: 'Glucosa alta',
    statusClass: 'warning',
    message: 'Escenario alto activado.',
    lastCommand: 'escenario alto'
  });
  changeScreen('high');
  showFeedback('warning', 'Escenario activado', 'Glucosa alta simulada.');
});

listenButton.addEventListener('click', () => {
  if (!recognition) {
    recognition = initSpeech();
  }

  if (!recognition) {
    return;
  }

  if (!recognitionActive) {
    try {
      recognition.start();
      recognitionActive = true;
      listenButton.textContent = 'Escucha activa';
    } catch (error) {
      console.log('No se pudo iniciar la voz');
    }
  } else {
    recognitionActive = false;
    recognition.stop();
    listenButton.textContent = 'Iniciar escucha';
    systemMessageEl.textContent = 'Escucha detenida.';
  }
});

emergencyButton.addEventListener('click', () => {
  emergencyTriggeredByClient = true;

  socket.emit('emergency:trigger', {
    message: 'Emergencia simulada activada manualmente. Iniciando protocolo de aviso al 112.'
  });

  showFeedback(
    'danger',
    'Emergencia manual',
    'Se ha activado el protocolo de emergencia simulado.'
  );

  speak('Activando protocolo de emergencia');
});

async function startGestureCamera() {
  try {
    if (gestureStream) {
      return;
    }

    gestureStatus.textContent = 'Cargando modelo...';
    await loadGestureModel();

    gestureStatus.textContent = 'Activando cámara...';
    gestureStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    gestureVideo.srcObject = gestureStream;
    gestureStatus.textContent = 'Cámara activa';
    patchState({ message: 'Sistema de gestos activado.' });

    gestureLoopActive = true;
    lastDetectedGesture = 'ninguno';
    lastGestureTimestamp = 0;
    lastPredictedClass = 'ninguno';
    stableGestureFrames = 0;
    gestureLockUntil = 0;

    gestureVideo.onloadedmetadata = () => {
      gestureLoop();
    };
  } catch (error) {
    console.error('Error al activar gestos:', error);

    if (String(error).includes('model.json') || String(error).includes('metadata.json')) {
      gestureStatus.textContent = 'Error de modelo';
      patchState({ message: 'No se ha podido cargar el modelo de gestos.' });
    } else {
      gestureStatus.textContent = 'Error de cámara';
      patchState({ message: 'No se ha podido activar la cámara para gestos.' });
    }
  }
}

function stopGestureCamera() {
  gestureLoopActive = false;

  if (gestureStream) {
    gestureStream.getTracks().forEach((track) => track.stop());
    gestureStream = null;
  }

  gestureVideo.srcObject = null;
  gestureStatus.textContent = 'Cámara desactivada';
  patchState({ message: 'Sistema de gestos desactivado.' });
}

async function loadGestureModel() {
  if (gestureModel) {
    return;
  }

  const modelURL = GESTURE_MODEL_URL + 'model.json';
  const metadataURL = GESTURE_MODEL_URL + 'metadata.json';

  gestureModel = await tmImage.load(modelURL, metadataURL);
  maxPredictions = gestureModel.getTotalClasses();
}

function mapGestureClassToAction(className) {
  const normalized = String(className).trim().toLowerCase();

  if (normalized === 'derecha') return 'siguiente';
  if (normalized === 'izquierda') return 'anterior';
  if (normalized === 'palma') return 'consultar';
  if (normalized === 'puno' || normalized === 'puño') return 'cancelar';

  return null;
}

async function predictGestureFrame() {
  if (!gestureModel || !gestureVideo || gestureVideo.readyState < 2) {
    return;
  }

  const prediction = await gestureModel.predict(gestureVideo);

  let bestPrediction = null;

  for (let i = 0; i < maxPredictions; i += 1) {
    const currentPrediction = prediction[i];

    if (!bestPrediction || currentPrediction.probability > bestPrediction.probability) {
      bestPrediction = currentPrediction;
    }
  }

  if (!bestPrediction) {
    return;
  }

  const detectedClass = String(bestPrediction.className).trim().toLowerCase();
  const probability = bestPrediction.probability;

  gestureStatus.textContent = `${detectedClass} (${probability.toFixed(2)})`;

  const action = mapGestureClassToAction(detectedClass);
  const now = Date.now();

  let confidenceThreshold = 0.88;
  if (detectedClass === 'palma') confidenceThreshold = 0.72;
  if (detectedClass === 'izquierda') confidenceThreshold = 0.78;
  if (detectedClass === 'derecha') confidenceThreshold = 0.88;
  if (detectedClass === 'puno' || detectedClass === 'puño') confidenceThreshold = 0.88;

  if (detectedClass === lastPredictedClass) {
    stableGestureFrames += 1;
  } else {
    lastPredictedClass = detectedClass;
    stableGestureFrames = 1;
  }

  const gestureDelayMs = 1800;

  if (
    action &&
    probability >= confidenceThreshold &&
    stableGestureFrames >= 2 &&
    now > gestureLockUntil &&
    !isSpeakingNow
  ) {
    lastGestureTimestamp = now;
    gestureLockUntil = now + gestureDelayMs;
    stableGestureFrames = 0;
    lastPredictedClass = 'ninguno';

    if (action === 'consultar') {
      gestureStatus.textContent = 'consulta glucosa';
    }

    handleGestureAction(action);
  }

  if (detectedClass === 'ninguno' && probability >= 0.70) {
    lastDetectedGesture = 'ninguno';
    lastPredictedClass = 'ninguno';
    stableGestureFrames = 0;
  }
}

async function gestureLoop() {
  if (!gestureLoopActive) {
    return;
  }

  await predictGestureFrame();
  window.requestAnimationFrame(gestureLoop);
}

startGestureButton.addEventListener('click', startGestureCamera);
stopGestureButton.addEventListener('click', stopGestureCamera);

gestureNextButton.addEventListener('click', () => handleGestureAction('siguiente'));
gesturePrevButton.addEventListener('click', () => handleGestureAction('anterior'));
gestureConfirmButton.addEventListener('click', () => handleGestureAction('consultar'));
gestureCancelButton.addEventListener('click', () => handleGestureAction('cancelar'));

recognition = initSpeech();
initMotionDetection();