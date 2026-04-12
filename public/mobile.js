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

const mainScreenButton = document.getElementById('mainScreenButton');
const trendScreenButton = document.getElementById('trendScreenButton');
const lowScreenButton = document.getElementById('lowScreenButton');
const highScreenButton = document.getElementById('highScreenButton');

const stableScenarioButton = document.getElementById('stableScenarioButton');
const downScenarioButton = document.getElementById('downScenarioButton');
const upScenarioButton = document.getElementById('upScenarioButton');
const lowScenarioButton = document.getElementById('lowScenarioButton');
const highScenarioButton = document.getElementById('highScenarioButton');

let lastState = {};

let isDrivingDetected = false;
let motionCounter = 0;
let stillCounter = 0;
let impactCooldown = false;

function updateMobileUI(state) {
  glucoseValueEl.textContent = `${state.glucose} mg/dL`;
  trendEl.textContent = state.trend;
  statusEl.textContent = state.status;
  statusEl.className = `status ${state.statusClass}`;

  drivingStatusEl.textContent = state.driving ? 'Conducción detectada' : 'Sin movimiento';
  motionValueEl.textContent = `Movimiento: ${Number(state.motionValue || 0).toFixed(2)}`;

  lastCommandEl.textContent = state.lastCommand;
  systemMessageEl.textContent = state.message;

  const screenLabels = {
    main: 'Principal',
    trend: 'Tendencia',
    low: 'Alerta baja',
    high: 'Alerta alta',
    emergency: 'Emergencia'
  };

  screenNameEl.textContent = screenLabels[state.screen] || 'Principal';
}

socket.on('state:update', (state) => {
    lastState = state;
    updateMobileUI(state);
});

function patchState(patch) {
  socket.emit('state:patch', patch);
}

function changeScreen(screen) {
  socket.emit('screen:change', screen);
}

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
    message: 'Escenario estable activado.'
  });
});

downScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'bajando',
    glucose: 100,
    trend: 'Bajando',
    status: 'Precaución',
    statusClass: 'warning',
    message: 'Escenario bajando activado.'
  });
});

upScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'subiendo',
    glucose: 120,
    trend: 'Subiendo',
    status: 'En ascenso',
    statusClass: 'warning',
    message: 'Escenario subiendo activado.'
  });
});

lowScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'bajo',
    glucose: 67,
    trend: 'Bajando rápido',
    status: 'Glucosa baja',
    statusClass: 'danger',
    message: 'Escenario de glucosa baja activado.'
  });
});

highScenarioButton.addEventListener('click', () => {
  patchState({
    scenario: 'alto',
    glucose: 185,
    trend: 'Subiendo',
    status: 'Glucosa alta',
    statusClass: 'warning',
    message: 'Escenario alto activado.'
  });
});

listenButton.addEventListener('click', () => {
  if (recognition) {
    recognition.start();
    systemMessageEl.textContent = 'Escucha activa...';
  }
});

function handleVoiceCommand(command) {
  const text = command.toLowerCase();

  socket.emit('command:recognized', command);

  if (
    text.includes('cuánto tengo') ||
    text.includes('consulta glucosa') ||
    text === 'estado'
  ) {
    socket.emit('state:patch', {
      message: `Tu glucosa actual es ${lastState.glucose}. ${lastState.trend}.`
    });
    speak(`Tu glucosa actual es ${lastState.glucose}. ${lastState.trend}.`);
    return;
  }

  if (text.includes('escenario estable')) {
    socket.emit('state:patch', { scenario: 'estable' });
    speak('Escenario estable activado');
    return;
  }

  if (text.includes('escenario bajando')) {
    socket.emit('state:patch', { scenario: 'bajando' });
    speak('Escenario bajando activado');
    return;
  }

  if (text.includes('escenario subiendo')) {
    socket.emit('state:patch', { scenario: 'subiendo' });
    speak('Escenario subiendo activado');
    return;
  }

  if (text.includes('escenario bajo')) {
    socket.emit('state:patch', { scenario: 'bajo' });
    speak('Escenario bajo activado');
    return;
  }

  if (text.includes('escenario alto')) {
    socket.emit('state:patch', { scenario: 'alto' });
    speak('Escenario alto activado');
    return;
  }

  if (text.includes('tendencia')) {
    socket.emit('screen:change', 'trend');
    speak('Mostrando tendencia');
    return;
  }

  if (text.includes('principal')) {
    socket.emit('screen:change', 'main');
    speak('Pantalla principal');
    return;
  }

  if (text.includes('emergencia')) {
    socket.emit('emergency:trigger', {
      message: 'Emergencia simulada activada por voz.'
    });
    speak('Activando protocolo de emergencia');
    return;
  }
  
}


function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function initSpeech() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.log('No soportado');
    return null;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = function (event) {
    const transcript = event.results[event.results.length - 1][0].transcript;
    handleVoiceCommand(transcript);
  };

  recognition.onerror = function (event) {
    console.log('Error voz:', event.error);
  };

  recognition.onend = function () {
    recognition.start(); // escucha continua
  };

  return recognition;
}

const recognition = initSpeech();

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

    socket.emit('impact:detected', {
      motionValue: magnitude
    });

    speak('Posible impacto detectado. Activando emergencia simulada.');

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

initMotionDetection();