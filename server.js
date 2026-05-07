import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

const appState = {
  screen: 'main',
  glucose: 110,
  trend: 'Estable',
  status: 'Estado seguro',
  statusClass: 'safe',
  message: 'Sistema iniciado.',
  messageId: null,
  lastCommand: 'Ninguno',
  driving: false,
  motionValue: 0,
  emergency: false,
  scenario: 'estable'
};

let glucoseMode = 'stable';

const SCENARIO_ALIASES = {
  estable: 'stable',
  bajando: 'down',
  subiendo: 'up',
  bajo: 'low',
  alto: 'high'
};

const SCENARIO_PRESETS = {
  stable: {
    glucose: 110,
    trend: 'Estable',
    status: 'Estado seguro',
    statusClass: 'safe',
    screen: 'main',
    message: 'Escenario estable. Glucosa en rango normal.'
  },
  down: {
    glucose: 90,
    trend: 'Bajando',
    status: 'Precaución',
    statusClass: 'warning',
    screen: 'main',
    message: 'Tu glucosa está bajando. Vigila la conducción.'
  },
  up: {
    glucose: 140,
    trend: 'Subiendo',
    status: 'En ascenso',
    statusClass: 'warning',
    screen: 'main',
    message: 'Tu glucosa está subiendo.'
  },
  low: {
    glucose: 58,
    trend: 'Bajando rápido',
    status: 'Glucosa baja',
    statusClass: 'danger',
    screen: 'low',
    message: 'Atención. Glucosa muy baja. Considera ingerir glucosa.'
  },
  high: {
    glucose: 220,
    trend: 'Subiendo',
    status: 'Glucosa alta',
    statusClass: 'danger',
    screen: 'high',
    message: 'Glucosa muy alta. Mantén precaución al volante.'
  }
};

function applyScenario(scenario) {
  const key = SCENARIO_ALIASES[scenario] || scenario;
  const preset = SCENARIO_PRESETS[key];
  if (!preset) return;

  glucoseMode = key;
  appState.scenario = key;
  appState.glucose = preset.glucose;
  appState.trend = preset.trend;
  appState.status = preset.status;
  appState.statusClass = preset.statusClass;
  appState.screen = preset.screen;
  appState.message = preset.message;
  appState.messageId = makeMessageId();

  // 'stable' es la salida universal: limpia cualquier emergencia activa.
  if (key === 'stable') {
    appState.emergency = false;
  }
}

function triggerEmergency(message) {
  glucoseMode = 'low';
  appState.scenario = 'low';
  appState.glucose = 45;
  appState.trend = 'Crítico';
  appState.status = 'Emergencia';
  appState.statusClass = 'danger';
  appState.emergency = true;
  appState.screen = 'emergency';
  appState.message = message;
  appState.messageId = makeMessageId();
}

function makeMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function broadcast() {
  io.emit('state:update', appState);
}

function simulateGlucose() {
  if (glucoseMode === 'stable') {
    const change = Math.floor(Math.random() * 3) - 1;
    appState.glucose += change;

    if (appState.glucose < 95) appState.glucose = 95;
    if (appState.glucose > 125) appState.glucose = 125;

    appState.trend =
      change > 0 ? 'Subiendo' : change < 0 ? 'Bajando' : 'Estable';

    appState.status = 'Estado seguro';
    appState.statusClass = 'safe';
    return;
  }

  if (glucoseMode === 'down') {
    const change = Math.floor(Math.random() * 3) - 2; // -2..0 (drift bajada)
    appState.glucose += change;
    if (appState.glucose < 78) appState.glucose = 78;
    if (appState.glucose > 100) appState.glucose = 100;

    appState.trend = 'Bajando';
    appState.status = 'Precaución';
    appState.statusClass = 'warning';
    return;
  }

  if (glucoseMode === 'up') {
    const change = Math.floor(Math.random() * 3); // 0..2 (drift subida)
    appState.glucose += change;
    if (appState.glucose < 130) appState.glucose = 130;
    if (appState.glucose > 165) appState.glucose = 165;

    appState.trend = 'Subiendo';
    appState.status = 'En ascenso';
    appState.statusClass = 'warning';
    return;
  }

  if (glucoseMode === 'low') {
    const change = Math.floor(Math.random() * 5) - 2; // -2..+2 oscila zona baja
    appState.glucose += change;
    if (appState.glucose < 54) appState.glucose = 54;
    if (appState.glucose > 65) appState.glucose = 65;

    appState.trend = 'Bajando rápido';
    appState.status = 'Glucosa baja';
    appState.statusClass = 'danger';
    return;
  }

  if (glucoseMode === 'high') {
    const change = Math.floor(Math.random() * 5) - 2; // -2..+2 oscila zona alta
    appState.glucose += change;
    if (appState.glucose < 200) appState.glucose = 200;
    if (appState.glucose > 235) appState.glucose = 235;

    appState.trend = 'Subiendo';
    appState.status = 'Glucosa alta';
    appState.statusClass = 'danger';
    return;
  }
}

app.get('/api/state', (req, res) => {
  res.json(appState);
});

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.emit('state:update', appState);

  socket.on('state:patch', (patch) => {
    if (!patch || typeof patch !== 'object') return;
    const { scenario, message, messageId, ...rest } = patch;
    if (scenario) {
      applyScenario(scenario);
      if (message) {
        appState.message = message;
        appState.messageId = messageId || makeMessageId();
      }
    } else if (message) {
      appState.message = message;
      appState.messageId = messageId || makeMessageId();
    }
    if (Object.keys(rest).length) {
      Object.assign(appState, rest);
    }
    broadcast();
  });

  socket.on('scenario:change', (scenario) => {
    applyScenario(scenario);
    broadcast();
  });

  socket.on('screen:change', (screen) => {
    appState.screen = screen;
    broadcast();
  });

  socket.on('command:recognized', (command) => {
    appState.lastCommand = command;
    broadcast();
  });

  socket.on('emergency:trigger', (payload) => {
    triggerEmergency(payload?.message || 'Emergencia activada. Llamando al 112. Compartiendo localización.');
    broadcast();
  });

  socket.on('emergency:clear', () => {
    applyScenario('stable');
    appState.message = 'Emergencia cancelada. Glucosa de nuevo en rango normal.';
    appState.messageId = makeMessageId();
    broadcast();
  });

  socket.on('impact:detected', ({ motionValue } = {}) => {
    appState.driving = true;
    appState.motionValue = motionValue ?? appState.motionValue;
    triggerEmergency('Posible impacto detectado. Activando protocolo de emergencia simulado y aviso al 112.');
    broadcast();
  });

  socket.on('driving:update', ({ driving, motionValue } = {}) => {
    if (typeof driving === 'boolean') appState.driving = driving;
    if (typeof motionValue === 'number') appState.motionValue = motionValue;
    broadcast();
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Servidor funcionando en http://localhost:${port}`);
});

setInterval(() => {
  simulateGlucose();

  // Solo auto-emergencia por glucosa críticamente baja (<50). Los escenarios
  // 'low' y 'high' son sticky: el usuario los gestiona explícitamente.
  if (!appState.emergency && appState.glucose < 50) {
    triggerEmergency(
      'Emergencia activada por glucosa críticamente baja. Iniciando protocolo de aviso al 112.'
    );
  }

  broadcast();
}, 5000);
