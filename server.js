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
  lastCommand: 'Ninguno',
  driving: false,
  motionValue: 0,
  emergency: false,
  scenario: 'estable'
};

let glucoseMode = 'stable';

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
  }

  if (glucoseMode === 'down') {
    const change = Math.floor(Math.random() * 4) + 1;
    appState.glucose -= change;

    if (appState.glucose <= 70) appState.glucose = 70;

    appState.trend = 'Bajando';
    appState.status = 'Precaución';
    appState.statusClass = 'warning';
  }

  if (glucoseMode === 'up') {
    const change = Math.floor(Math.random() * 4) + 1;
    appState.glucose += change;

    if (appState.glucose >= 190) appState.glucose = 190;

    appState.trend = 'Subiendo';
    appState.status =
      appState.glucose >= 180 ? 'Glucosa alta' : 'En ascenso';
    appState.statusClass = 'warning';
  }

  if (glucoseMode === 'low') {
    appState.glucose = 65;
    appState.trend = 'Bajando rápido';
    appState.status = 'Glucosa baja';
    appState.statusClass = 'danger';
  }

  if (glucoseMode === 'high') {
    appState.glucose = 200;
    appState.trend = 'Subiendo';
    appState.status = 'Glucosa alta';
    appState.statusClass = 'warning';
  }
}

app.get('/api/state', (req, res) => {
  res.json(appState);
});

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.emit('state:update', appState);

  socket.on('state:patch', (patch) => {
    Object.assign(appState, patch);
    io.emit('state:update', appState);
    if (patch.scenario) {
      if (patch.scenario === 'estable') glucoseMode = 'stable';
      if (patch.scenario === 'bajando') glucoseMode = 'down';
      if (patch.scenario === 'subiendo') glucoseMode = 'up';
      if (patch.scenario === 'bajo') glucoseMode = 'low';
      if (patch.scenario === 'alto') glucoseMode = 'high';
    }
  });

  socket.on('screen:change', (screen) => {
    appState.screen = screen;
    io.emit('state:update', appState);
  });

  socket.on('command:recognized', (command) => {
    appState.lastCommand = command;
    io.emit('state:update', appState);
  });

  socket.on('emergency:trigger', (payload) => {
    appState.emergency = true;
    appState.screen = 'emergency';
    appState.message = payload?.message || 'Emergencia simulada activada.';
    io.emit('state:update', appState);
  });

  socket.on('emergency:clear', () => {
    appState.emergency = false;
    appState.screen = 'main';
    appState.message = 'Emergencia cancelada.';
    io.emit('state:update', appState);
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });

  socket.on('impact:detected', ({ motionValue }) => {
  appState.driving = true;
  appState.motionValue = motionValue;
  appState.emergency = true;
  appState.screen = 'emergency';
  appState.message =
    'Posible impacto detectado. Activando protocolo de emergencia simulado y aviso al 112.';
  io.emit('state:update', appState);
  });
  
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Servidor funcionando en http://localhost:${port}`);
});

setInterval(() => {
  simulateGlucose();

  if (appState.glucose <= 70 && !appState.emergency) {
    appState.message =
      'Atención. Nivel de glucosa bajo. Considera ingerir glucosa.';
    appState.screen = 'low';
  }

  if (appState.glucose < 40 && !appState.emergency) {
    appState.emergency = true;
    appState.screen = 'emergency';
    appState.message =
      'Emergencia simulada activada por glucosa críticamente baja. Iniciando protocolo de aviso al 112.';
  }

  io.emit('state:update', appState);
}, 5000);
