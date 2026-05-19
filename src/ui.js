import { handledKeys, helpText } from "./config.js";
import { resetGameState } from "./state.js";

export function createInput() {
  return {
    keys: new Set(),
    pressed: new Set()
  };
}

export function createUi(state, input, audio) {
  const elements = {
    status: document.getElementById("status"),
    phase: document.getElementById("phase"),
    help: document.getElementById("help"),
    helpButton: document.getElementById("helpButton"),
    helpModal: document.getElementById("helpModal"),
    closeHelp: document.getElementById("closeHelp")
  };

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

  function sync() {
    elements.status.textContent = state.message;
    elements.phase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
    elements.help.innerHTML = helpText[state.phase].map((item) => `<li>${item}</li>`).join("");
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

    audio.resume();
    if (key === "r") resetGameState(state);
    if (key === "f" && state.plane.state === "flying") state.plane.flaps = state.plane.flaps === 0 ? 15 : state.plane.flaps === 15 ? 30 : 0;
    if (key === "g" && state.plane.state === "flying" && !state.plane.onGround) state.plane.gearDown = !state.plane.gearDown;

    input.pressed.add(key);
    input.keys.add(key);
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    input.keys.delete(key);
    input.pressed.delete(key);
  }

  function onPointerDown() {
    if (!state.paused) audio.resume();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  elements.helpButton.addEventListener("click", toggleHelp);
  elements.closeHelp.addEventListener("click", () => setPaused(false));
  elements.helpModal.addEventListener("click", (event) => {
    if (event.target === elements.helpModal) setPaused(false);
  });

  sync();
  return { sync, setPaused };
}
