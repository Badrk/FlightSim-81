import { clamp } from "./math.js?v=1.5.5";

export function createAudioController() {
  let audio = null;

  function init() {
    if (audio || !window.AudioContext && !window.webkitAudioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const engine = context.createOscillator();
    const growl = context.createOscillator();
    const tremolo = context.createOscillator();
    const warning = context.createOscillator();
    const tremoloGain = context.createGain();
    const master = context.createGain();
    const warningGain = context.createGain();
    const filter = context.createBiquadFilter();

    engine.type = "sawtooth";
    growl.type = "square";
    tremolo.type = "sine";
    warning.type = "square";
    filter.type = "lowpass";
    filter.frequency.value = 420;
    engine.frequency.value = 48;
    growl.frequency.value = 24;
    tremolo.frequency.value = 7;
    warning.frequency.value = 880;
    tremoloGain.gain.value = 0.018;
    master.gain.value = 0;
    warningGain.gain.value = 0;

    tremolo.connect(tremoloGain);
    tremoloGain.connect(master.gain);
    engine.connect(filter);
    growl.connect(filter);
    filter.connect(master);
    warning.connect(warningGain);
    warningGain.connect(context.destination);
    master.connect(context.destination);
    engine.start();
    growl.start();
    tremolo.start();
    warning.start();
    audio = { context, engine, growl, filter, master, warningGain };
  }

  function resume() {
    init();
    if (audio && audio.context.state === "suspended") audio.context.resume();
  }

  function update(state) {
    if (!audio) return;
    const { plane, paused, phase } = state;
    const now = audio.context.currentTime;
    const active = plane.state === "flying" && !paused && state.soundEnabled;
    const power = active ? plane.throttle / 100 : 0;
    const motion = active ? clamp(plane.speed / 130, 0, 1) : 0;
    const configWarning = phase === "landing" && (!plane.gearDown || plane.flaps !== 30);
    const warning = active && (plane.stall || configWarning) ? 0.035 : 0;

    audio.engine.frequency.setTargetAtTime(42 + power * 78 + motion * 18, now, 0.08);
    audio.growl.frequency.setTargetAtTime(20 + power * 26, now, 0.1);
    audio.filter.frequency.setTargetAtTime(260 + power * 820, now, 0.12);
    audio.master.gain.setTargetAtTime(active ? 0.018 + power * 0.09 + motion * 0.025 : 0, now, 0.03);
    audio.warningGain.gain.setTargetAtTime(warning, now, 0.03);
  }

  function stop() {
    if (!audio) return;
    const now = audio.context.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.warningGain.gain.cancelScheduledValues(now);
    audio.master.gain.setValueAtTime(0, now);
    audio.warningGain.gain.setValueAtTime(0, now);
    if (audio.context.state === "running") audio.context.suspend();
  }

  return { resume, stop, update };
}
