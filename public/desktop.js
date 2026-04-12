const socket = io();

const desktopScreenLabel = document.getElementById('desktopScreenLabel');
const desktopGlucoseValue = document.getElementById('desktopGlucoseValue');
const desktopTrend = document.getElementById('desktopTrend');
const desktopStatus = document.getElementById('desktopStatus');
const desktopMessage = document.getElementById('desktopMessage');
const desktopLastCommand = document.getElementById('desktopLastCommand');
const desktopDrivingStatus = document.getElementById('desktopDrivingStatus');
const desktopMotionValue = document.getElementById('desktopMotionValue');
const trendExplanation = document.getElementById('trendExplanation');
const emergencyMessage = document.getElementById('emergencyMessage');

const screens = {
  main: document.getElementById('screen-main'),
  trend: document.getElementById('screen-trend'),
  low: document.getElementById('screen-low'),
  high: document.getElementById('screen-high'),
  emergency: document.getElementById('screen-emergency')
};

const screenLabels = {
  main: 'Principal',
  trend: 'Tendencia',
  low: 'Alerta baja',
  high: 'Alerta alta',
  emergency: 'Emergencia'
};

function updateDesktopUI(state) {

  // 🔹 Cambiar pantalla
  Object.values(screens).forEach((screen) => {
    if (screen) screen.classList.remove('active');
  });

  const activeScreen = screens[state.screen] || screens.main;
  if (activeScreen) activeScreen.classList.add('active');

  // 🔹 Actualizar datos
  desktopScreenLabel.textContent = `Pantalla: ${screenLabels[state.screen] || 'Principal'}`;
  desktopGlucoseValue.textContent = `${state.glucose} mg/dL`;
  desktopTrend.textContent = state.trend;
  desktopStatus.textContent = state.status;
  desktopStatus.className = `status ${state.statusClass}`;

  desktopMessage.textContent = state.message;
  desktopLastCommand.textContent = state.lastCommand;

  desktopDrivingStatus.textContent = state.driving
    ? 'Conducción detectada'
    : 'Sin movimiento';

  desktopMotionValue.textContent = `Movimiento: ${Number(state.motionValue || 0).toFixed(2)}`;

  // 🔹 Tendencia
  trendExplanation.textContent =
    `Glucosa: ${state.glucose} mg/dL. Tendencia: ${state.trend}.`;

  // 🔹 Emergencia visual
  if (state.emergency) {
    document.body.classList.add('emergency-mode');
    emergencyMessage.textContent = state.message;
  } else {
    document.body.classList.remove('emergency-mode');
  }
}

// 🔌 Socket
socket.on('state:update', (state) => {
  updateDesktopUI(state);
});