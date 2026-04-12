const glucoseValueEl = document.getElementById('glucoseValue');
const trendEl = document.getElementById('trend');
const statusEl = document.getElementById('status');
const lastCommandEl = document.getElementById('lastCommand');
const systemMessageEl = document.getElementById('systemMessage');
const listenButton = document.getElementById('listenButton');
const drivingStatusEl = document.getElementById('drivingStatus');
const motionValueEl = document.getElementById('motionValue');

const scenarios = {
  estable: {
    glucose: 110,
    trend: 'Estable',
    status: 'Estado seguro',
    class: 'safe',
    message: 'Tu glucosa actual es 110. Estable.'
  },
  bajando: {
    glucose: 100,
    trend: 'Bajando',
    status: 'Precaución',
    class: 'warning',
    message: 'Tu glucosa está bajando.'
  },
  subiendo: {
    glucose: 120,
    trend: 'Subiendo',
    status: 'En ascenso',
    class: 'warning',
    message: 'Tu glucosa está subiendo.'
  },
  bajo: {
    glucose: 67,
    trend: 'Bajando rápido',
    status: 'Glucosa baja',
    class: 'danger',
    message: 'Atención. Glucosa baja. Considera ingerir glucosa.'
  },
  alto: {
    glucose: 185,
    trend: 'Subiendo',
    status: 'Glucosa alta',
    class: 'warning',
    message: 'Tu glucosa es 185. Nivel alto.'
  }
};

let currentScenario = { ...scenarios.estable };
let lastResponse = currentScenario.message;

let continuousMode = false;
let isRecognitionActive = false;
let isSpeaking = false;
let shouldResumeAfterSpeech = false;
let glucoseMode = 'stable';

let isDrivingDetected = false;
let motionCounter = 0;
let stillCounter = 0;

function updateUI() {
  glucoseValueEl.textContent = currentScenario.glucose + ' mg/dL';
  trendEl.textContent = currentScenario.trend;
  statusEl.textContent = currentScenario.status;
  statusEl.className = 'status ' + currentScenario.class;
}

function updateDrivingUI(magnitude) {
  if (typeof magnitude === 'number') {
    motionValueEl.textContent = `Movimiento: ${magnitude.toFixed(2)}`;
  }

  if (isDrivingDetected) {
    drivingStatusEl.textContent = 'Posible conducción detectada';
    drivingStatusEl.className = 'status safe';
  } else {
    drivingStatusEl.textContent = 'Sin movimiento';
    drivingStatusEl.className = 'status warning';
  }
}

function setMessage(text) {
  systemMessageEl.textContent = text;
  lastResponse = text;
}

function startRecognition() {
  if (!recognition || isRecognitionActive || isSpeaking) {
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    console.error('Start recognition error:', error);
  }
}

function stopRecognition() {
  if (!recognition || !isRecognitionActive) {
    return;
  }

  try {
    recognition.stop();
  } catch (error) {
    console.error('Stop recognition error:', error);
  }
}

function speak(text) {
  const wasContinuousActive = continuousMode;

  isSpeaking = true;
  shouldResumeAfterSpeech = wasContinuousActive;

  stopRecognition();
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';

  utterance.onend = function () {
    isSpeaking = false;

    if (shouldResumeAfterSpeech && continuousMode) {
      setTimeout(() => {
        startRecognition();
      }, 900);
    }
  };

  utterance.onerror = function () {
    isSpeaking = false;

    if (shouldResumeAfterSpeech && continuousMode) {
      setTimeout(() => {
        startRecognition();
      }, 900);
    }
  };

  window.speechSynthesis.speak(utterance);
}

function handleCommand(command) {
  const text = command.toLowerCase().trim();
  lastCommandEl.textContent = command;

  if (
    text.includes('cuánto tengo') ||
    text.includes('consulta glucosa') ||
    text === 'estado'
  ) {
    const response = `Tu glucosa actual es ${currentScenario.glucose}. ${currentScenario.trend}.`;
    setMessage(response);
    speak(response);
    return;
  }

  if (text.includes('contexto') || text.includes('estoy conduciendo')) {
    const response = isDrivingDetected
      ? 'He detectado movimiento compatible con conducción.'
      : 'No detecto movimiento de conducción en este momento.';
    setMessage(response);
    speak(response);
    return;
  }

  if (text.includes('ayuda')) {
    const help =
      'Puedes decir consulta glucosa, cuánto tengo de azúcar, repite, contexto, escenario estable, escenario bajando, escenario subiendo, escenario bajo o escenario alto.';
    setMessage(help);
    speak(help);
    return;
  }

  if (text.includes('repite')) {
    setMessage(lastResponse);
    speak(lastResponse);
    return;
  }

  if (text.includes('escenario estable')) {
    currentScenario = { ...scenarios.estable };
    glucoseMode = 'stable';
    updateUI();
    setMessage('Escenario estable activado');
    speak('Escenario estable activado');
    return;
  }

  if (text.includes('escenario bajando')) {
    currentScenario = { ...scenarios.bajando };
    glucoseMode = 'down';
    updateUI();
    setMessage('Escenario bajando activado');
    speak('Escenario bajando activado');
    return;
  }

  if (text.includes('escenario subiendo')) {
    currentScenario = { ...scenarios.subiendo };
    glucoseMode = 'up';
    updateUI();
    setMessage('Escenario subiendo activado');
    speak('Escenario subiendo activado');
    return;
  }

  if (text.includes('escenario bajo')) {
    currentScenario = { ...scenarios.bajo };
    glucoseMode = 'low';
    updateUI();
    setMessage('Escenario de glucosa baja activado');
    speak('Escenario de glucosa baja activado');
    return;
  }

  if (text.includes('escenario alto')) {
    currentScenario = { ...scenarios.alto };
    glucoseMode = 'high';
    updateUI();
    setMessage('Escenario alto activado');
    speak('Escenario alto activado');
    return;
  }

  // Si no reconoce un comando válido, no hace nada.
}

function initSpeech() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setMessage('El navegador no soporta reconocimiento de voz.');
    return null;
  }

  const recognitionInstance = new SpeechRecognition();

  recognitionInstance.lang = 'es-ES';
  recognitionInstance.continuous = false;
  recognitionInstance.interimResults = false;
  recognitionInstance.maxAlternatives = 1;

  recognitionInstance.onstart = function () {
    isRecognitionActive = true;
    setMessage('Escuchando...');
  };

  recognitionInstance.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    handleCommand(transcript);
  };

  recognitionInstance.onerror = function (event) {
    isRecognitionActive = false;

    if (isSpeaking) {
      return;
    }

    if (event.error === 'no-speech') {
      if (continuousMode) {
        setTimeout(() => {
          startRecognition();
        }, 600);
      }
      return;
    }

    if (event.error === 'not-allowed') {
      continuousMode = false;
      listenButton.textContent = 'Iniciar escucha';
      setMessage('Chrome ha bloqueado el micrófono o el reconocimiento de voz.');
      return;
    }

    if (continuousMode) {
      setTimeout(() => {
        startRecognition();
      }, 1000);
    }
  };

  recognitionInstance.onend = function () {
    isRecognitionActive = false;

    if (continuousMode && !isSpeaking) {
      setTimeout(() => {
        startRecognition();
      }, 700);
    }
  };

  return recognitionInstance;
}

function simulateGlucose() {
  if (glucoseMode === 'stable') {
    const change = Math.floor(Math.random() * 3) - 1;
    currentScenario.glucose += change;

    if (currentScenario.glucose < 95) currentScenario.glucose = 95;
    if (currentScenario.glucose > 125) currentScenario.glucose = 125;

    currentScenario.trend =
      change > 0 ? 'Subiendo' : change < 0 ? 'Bajando' : 'Estable';
    currentScenario.status = 'Estado seguro';
    currentScenario.class = 'safe';
  }

  if (glucoseMode === 'down') {
    const change = Math.floor(Math.random() * 4) + 1;
    currentScenario.glucose -= change;

    if (currentScenario.glucose <= 70) {
      currentScenario.glucose = 70;
    }

    currentScenario.trend = 'Bajando';
    currentScenario.status = 'Precaución';
    currentScenario.class = 'warning';
  }

  if (glucoseMode === 'up') {
    const change = Math.floor(Math.random() * 4) + 1;
    currentScenario.glucose += change;

    if (currentScenario.glucose >= 190) {
      currentScenario.glucose = 190;
    }

    currentScenario.trend = 'Subiendo';
    currentScenario.status =
      currentScenario.glucose >= 180 ? 'Glucosa alta' : 'En ascenso';
    currentScenario.class = 'warning';
  }

  if (glucoseMode === 'low') {
    const change = Math.floor(Math.random() * 3);
    currentScenario.glucose -= change;

    if (currentScenario.glucose < 60) {
      currentScenario.glucose = 60;
    }

    currentScenario.trend = 'Bajando rápido';
    currentScenario.status = 'Glucosa baja';
    currentScenario.class = 'danger';
  }

  if (glucoseMode === 'high') {
    const change = Math.floor(Math.random() * 3);
    currentScenario.glucose += change;

    if (currentScenario.glucose > 230) {
      currentScenario.glucose = 230;
    }

    currentScenario.trend = 'Subiendo';
    currentScenario.status = 'Glucosa alta';
    currentScenario.class = 'warning';
  }

  updateUI();
}

function handleMotionMagnitude(magnitude) {
  const MOTION_THRESHOLD = 1.8;

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

  updateDrivingUI(magnitude);
}

function initMotionDetection() {
  if (!window.DeviceMotionEvent) {
    drivingStatusEl.textContent = 'Sensores no disponibles';
    drivingStatusEl.className = 'status warning';
    motionValueEl.textContent = 'Movimiento: no disponible';
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
        } else {
          drivingStatusEl.textContent = 'Permiso denegado';
          drivingStatusEl.className = 'status warning';
          motionValueEl.textContent = 'Movimiento: no disponible';
        }
      } catch (error) {
        drivingStatusEl.textContent = 'Sensor no activado';
        drivingStatusEl.className = 'status warning';
        motionValueEl.textContent = 'Movimiento: no disponible';
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

const recognition = initSpeech();

listenButton.addEventListener('click', () => {
  if (!recognition) {
    return;
  }

  continuousMode = !continuousMode;

  if (continuousMode) {
    listenButton.textContent = 'Escucha activa';
    startRecognition();
  } else {
    listenButton.textContent = 'Iniciar escucha';
    stopRecognition();
    setMessage('Escucha detenida.');
  }
});

setInterval(() => {
  if (currentScenario.glucose <= 70 && !isSpeaking) {
    const alertMessage =
      'Atención. Nivel de glucosa bajo. Considera ingerir glucosa.';
    setMessage(alertMessage);
    speak(alertMessage);
  }
}, 15000);

setInterval(() => {
  simulateGlucose();
}, 10000);

updateUI();
updateDrivingUI(0);
initMotionDetection();