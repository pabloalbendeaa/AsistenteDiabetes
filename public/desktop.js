const emergencySteps = document.querySelectorAll('.emergency-step');
let emergencyStepIndex = 0;
let emergencyInterval = null;

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
const trendCurrentValue = document.getElementById('trendCurrentValue');
const trendRiskText = document.getElementById('trendRiskText');
const trendBars = document.getElementById('trendBars');
const emergencyMessage = document.getElementById('emergencyMessage');

const mainScreenGlucose = document.getElementById('mainScreenGlucose');
const mainScreenTrend = document.getElementById('mainScreenTrend');
const mainScreenStatus = document.getElementById('mainScreenStatus');

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

let trendHistory = [96, 102, 108, 114, 110];

function animateScreenChange(activeScreen) {
  Object.values(screens).forEach((screen) => {
    if (!screen) return;
    screen.classList.remove('active', 'screen-enter');
  });

  if (!activeScreen) return;

  activeScreen.classList.add('active');
  requestAnimationFrame(() => {
    activeScreen.classList.add('screen-enter');
  });
}

function updateTrendHistory(currentGlucose) {
  trendHistory.push(currentGlucose);
  if (trendHistory.length > 5) {
    trendHistory.shift();
  }
}

function renderTrendBars() {
  if (!trendBars) return;

  const maxValue = Math.max(...trendHistory, 1);
  const minBase = Math.min(...trendHistory, 60);
  const range = Math.max(maxValue - minBase, 20);

  trendBars.innerHTML = trendHistory
    .map((value, index) => {
      const height = 35 + ((value - minBase) / range) * 45;
      const isActive = index === trendHistory.length - 1 ? 'active' : '';
      return `
        <div class="trend-bar ${isActive}" style="height: ${height}%">
          <span>${value}</span>
        </div>
      `;
    })
    .join('');
}

function getTrendRiskText(state) {
  if (state.emergency) {
    return 'Emergencia activa. Prioridad máxima.';
  }

  if (state.glucose < 70) {
    return 'Riesgo alto por glucosa baja.';
  }

  if (state.glucose > 180) {
    return 'Riesgo moderado por glucosa alta.';
  }

  if (state.trend.toLowerCase().includes('bajando')) {
    return 'Conviene vigilar posible descenso.';
  }

  if (state.trend.toLowerCase().includes('subiendo')) {
    return 'Tendencia ascendente sin riesgo inmediato.';
  }

  return 'Sin riesgo inmediato.';
}

function updateDesktopUI(state) {
  const activeScreen = screens[state.screen] || screens.main;
  animateScreenChange(activeScreen);

  desktopScreenLabel.textContent = `Pantalla: ${screenLabels[state.screen] || 'Principal'}`;
  desktopGlucoseValue.textContent = `${state.glucose} mg/dL`;
  desktopTrend.textContent = state.trend;
  desktopStatus.textContent = state.status;
  desktopStatus.className = `status ${state.statusClass}`;

  desktopDrivingStatus.textContent = state.driving
    ? 'Conducción detectada'
    : 'Sin movimiento';

  desktopMotionValue.textContent = Number(state.motionValue || 0).toFixed(2);

  if (desktopMessage) {
    desktopMessage.textContent = state.message || 'Sistema iniciado.';
  }

  if (desktopLastCommand) {
    desktopLastCommand.textContent = state.lastCommand || 'Ninguno';
  }

  if (mainScreenGlucose) {
    mainScreenGlucose.textContent = `${state.glucose} mg/dL`;
  }

  if (mainScreenTrend) {
    mainScreenTrend.textContent = state.trend;
  }

  if (mainScreenStatus) {
    mainScreenStatus.textContent = state.status;
  }

  updateTrendHistory(state.glucose);
  renderTrendBars();

  if (trendCurrentValue) {
    trendCurrentValue.textContent = `${state.glucose} mg/dL`;
  }

  if (trendExplanation) {
    trendExplanation.textContent =
      `La glucosa actual se sitúa en ${state.glucose} mg/dL, con una tendencia ${state.trend.toLowerCase()} y un estado general "${state.status}".`;
  }

  if (trendRiskText) {
    trendRiskText.textContent = getTrendRiskText(state);
  }

  if (state.screen === 'low') {
    document.body.classList.add('theme-low');
    document.body.classList.remove('theme-high', 'emergency-mode');
    resetEmergencySequence();
  } else if (state.screen === 'high') {
    document.body.classList.add('theme-high');
    document.body.classList.remove('theme-low', 'emergency-mode');
    resetEmergencySequence();
  } else if (state.emergency) {
    document.body.classList.add('emergency-mode');
    document.body.classList.remove('theme-low', 'theme-high');
    startEmergencySequence();
  } else {
    document.body.classList.remove('theme-low', 'theme-high', 'emergency-mode');
    resetEmergencySequence();
  }

  if (state.emergency && emergencyMessage) {
    emergencyMessage.textContent = state.message;
  }
}

socket.on('state:update', (state) => {
  updateDesktopUI(state);
});

function startEmergencySequence() {
  if (emergencyInterval) return;

  emergencyStepIndex = 0;

  emergencyInterval = setInterval(() => {
    if (emergencyStepIndex < emergencySteps.length) {
      emergencySteps.forEach((step, index) => {
        step.classList.toggle('active', index === emergencyStepIndex);
      });

      emergencyStepIndex++;
    } else {
      clearInterval(emergencyInterval);
    }
  }, 1500);
}

function resetEmergencySequence() {
  clearInterval(emergencyInterval);
  emergencyInterval = null;

  emergencySteps.forEach(step => step.classList.remove('active'));
}