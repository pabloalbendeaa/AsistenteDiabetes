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
  Object.values(screens).forEach((screen) => {
    if (screen) {
      screen.classList.remove('active');
    }
  });

  const activeScreen = screens[state.screen] || screens.main;
  if (activeScreen) {
    activeScreen.classList.add('active');
  }

  desktopScreenLabel.textContent = `Pantalla: ${screenLabels[state.screen] || 'Principal'}`;
  desktopGlucoseValue.textContent = `${state.glucose} mg/dL`;
  desktopTrend.textContent = state.trend;
  desktopStatus.textContent = state.status;
  desktopStatus.className = `status ${state.statusClass}`;

  desktopMessage.textContent = state.message || 'Sistema iniciado.';
  desktopLastCommand.textContent = state.lastCommand || 'Ninguno';

  desktopDrivingStatus.textContent = state.driving
    ? 'Conducción detectada'
    : 'Sin movimiento';

  desktopMotionValue.textContent = Number(state.motionValue || 0).toFixed(2);

  trendExplanation.textContent =
    `Glucosa: ${state.glucose} mg/dL. Tendencia: ${state.trend}. Estado: ${state.status}.`;

  if (state.emergency) {
    document.body.classList.add('emergency-mode');
    emergencyMessage.textContent = state.message;
  } else {
    document.body.classList.remove('emergency-mode');
  }
}

socket.on('state:update', (state) => {
  updateDesktopUI(state);
});