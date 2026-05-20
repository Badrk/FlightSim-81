import { handledKeys, helpText } from "./config.js?v=1.5.4";
import { setMessage } from "./flight.js?v=1.5.4";
import { resetGameState } from "./state.js?v=1.5.4";

export function createInput() {
  return {
    keys: new Set(),
    pressed: new Set()
  };
}

export function createUi(state, input, audio) {
  const clickPulses = new Map();
  const elements = {
    status: document.getElementById("status"),
    phase: document.getElementById("phase"),
    help: document.getElementById("help"),
    helpButton: document.getElementById("helpButton"),
    helpModal: document.getElementById("helpModal"),
    closeHelp: document.getElementById("closeHelp"),
    autopilotToggle: document.getElementById("autopilotToggle"),
    soundToggle: document.getElementById("soundToggle"),
    mapModeToggle: document.getElementById("mapModeToggle"),
    controls: Array.from(document.querySelectorAll("[data-key]"))
  };

  function syncLayoutMode() {
    const coarsePointer = matchMedia("(pointer: coarse)").matches || matchMedia("(hover: none)").matches;
    const narrowViewport = matchMedia("(max-width: 820px)").matches || Math.min(window.innerWidth, window.screen.width) <= 820;
    const touchDevice = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    const enabled = coarsePointer || narrowViewport || touchDevice;
    document.documentElement.classList.toggle("touch-layout", enabled);
    document.body.classList.toggle("touch-layout", enabled);
  }

  function setPaused(next) {
    state.paused = next;
    elements.helpModal.hidden = !next;
    if (next) {
      input.keys.clear();
      elements.closeHelp.focus();
    } else {
      elements.helpButton.focus();
    }
  }

  function toggleHelp() {
    setPaused(!state.paused);
  }

  function runButtonAction(key) {
    if (key === "h") {
      toggleHelp();
      return;
    }
    if (state.paused) return;

    if (key === "r") {
      clearManualInput();
      resetGameState(state);
      audio.stop();
    } else if (key === "f" && state.plane.state === "flying") {
      audio.resume();
      state.plane.flaps = state.plane.flaps === 0 ? 15 : state.plane.flaps === 15 ? 30 : 0;
    } else if (key === "g" && state.plane.state === "flying" && !state.plane.onGround) {
      audio.resume();
      state.plane.gearDown = !state.plane.gearDown;
    }
  }

  function clearManualInput() {
    input.keys.clear();
    input.pressed.clear();
    for (const timeout of clickPulses.values()) clearTimeout(timeout);
    clickPulses.clear();
    for (const button of elements.controls) button.classList.remove("is-active");
  }

  function toggleAutopilot() {
    if (state.paused || state.plane.state !== "flying") return;
    state.autopilot = !state.autopilot;
    clearManualInput();
    setMessage(state, state.autopilot ? "Autopilot engaged from present position." : "Autopilot off. Manual control restored.");
  }

  function bindToggle(button, action) {
    let lastRun = 0;

    function run(event) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      const now = performance.now();
      if (now - lastRun < 500) return;
      lastRun = now;
      action();
      sync();
    }

    button.addEventListener("pointerdown", run);
    button.addEventListener("mousedown", run);
    button.addEventListener("touchstart", run, { passive: false });
    button.addEventListener("click", run);
  }

  function isHoldControl(key) {
    return key.startsWith("arrow") || key === "a" || key === "z";
  }

  function sync() {
    document.body.dataset.phase = state.phase;
    elements.status.textContent = state.message;
    elements.phase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
    elements.help.innerHTML = helpText[state.phase].map((item) => `<li>${item}</li>`).join("");
    elements.autopilotToggle.setAttribute("aria-pressed", String(state.autopilot));
    elements.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
    elements.mapModeToggle.setAttribute("aria-pressed", String(state.mapNorthUp));
    elements.autopilotToggle.textContent = state.autopilot ? "AP✓" : "AP";
    elements.soundToggle.textContent = state.soundEnabled ? "SND" : "MUTE";
    elements.mapModeToggle.textContent = state.mapNorthUp ? "N↑" : "HDG↑";
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (handledKeys.has(key)) event.preventDefault();
    if (input.pressed.has(key)) return;

    if (key === "h" || key === "escape" && state.paused) {
      toggleHelp();
      input.pressed.add(key);
      return;
    }

    if (state.paused) {
      input.pressed.add(key);
      return;
    }

    runButtonAction(key);

    input.pressed.add(key);
    if (isHoldControl(key)) input.keys.add(key);
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    input.keys.delete(key);
    input.pressed.delete(key);
  }

  function pressControl(button, event) {
    const key = button.dataset.key;
    if (!isHoldControl(key) || state.paused) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    audio.resume();
    clearTimeout(clickPulses.get(key));
    clickPulses.delete(key);
    input.keys.add(key);
    button.classList.add("is-active");
    if (event.pointerId !== undefined) button.setPointerCapture(event.pointerId);
  }

  function releaseControl(button, event) {
    const key = button.dataset.key;
    if (isHoldControl(key)) {
      if (event.stopPropagation) event.stopPropagation();
      input.keys.delete(key);
      button.classList.remove("is-active");
      if (event.pointerId !== undefined && button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    }
  }

  function pulseControl(button, event) {
    const key = button.dataset.key;
    if (!isHoldControl(key) || state.paused) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    audio.resume();
    input.keys.add(key);
    button.classList.add("is-active");
    clearTimeout(clickPulses.get(key));
    clickPulses.set(key, setTimeout(() => {
      input.keys.delete(key);
      button.classList.remove("is-active");
      clickPulses.delete(key);
    }, 140));
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mouseup", () => {
    for (const button of elements.controls) releaseControl(button, {});
  });
  window.addEventListener("touchend", () => {
    for (const button of elements.controls) releaseControl(button, {});
  });
  window.addEventListener("touchcancel", () => {
    for (const button of elements.controls) releaseControl(button, {});
  });
  elements.helpButton.addEventListener("click", toggleHelp);
  elements.closeHelp.addEventListener("click", () => setPaused(false));
  elements.helpModal.addEventListener("click", (event) => {
    if (event.target === elements.helpModal) setPaused(false);
  });
  bindToggle(elements.autopilotToggle, () => {
    toggleAutopilot();
  });
  bindToggle(elements.soundToggle, () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) audio.resume();
    else audio.stop();
  });
  bindToggle(elements.mapModeToggle, () => {
    state.mapNorthUp = !state.mapNorthUp;
  });
  for (const button of elements.controls) {
    button.addEventListener("pointerdown", (event) => pressControl(button, event));
    button.addEventListener("pointerup", (event) => releaseControl(button, event));
    button.addEventListener("pointercancel", (event) => releaseControl(button, event));
    button.addEventListener("pointerleave", (event) => releaseControl(button, event));
    button.addEventListener("mousedown", (event) => pressControl(button, event));
    button.addEventListener("mouseup", (event) => releaseControl(button, event));
    button.addEventListener("mouseleave", (event) => releaseControl(button, event));
    button.addEventListener("touchstart", (event) => pressControl(button, event), { passive: false });
    button.addEventListener("touchend", (event) => releaseControl(button, event), { passive: false });
    button.addEventListener("touchcancel", (event) => releaseControl(button, event), { passive: false });
    button.addEventListener("lostpointercapture", () => {
      input.keys.delete(button.dataset.key);
      button.classList.remove("is-active");
    });
    button.addEventListener("click", (event) => {
      if (isHoldControl(button.dataset.key)) pulseControl(button, event);
      else {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        runButtonAction(button.dataset.key);
      }
    });
  }

  syncLayoutMode();
  window.addEventListener("resize", syncLayoutMode);
  window.addEventListener("orientationchange", syncLayoutMode);
  sync();
  return { sync, setPaused };
}
