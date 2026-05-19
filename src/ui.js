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
    closeHelp: document.getElementById("closeHelp"),
    controls: Array.from(document.querySelectorAll("[data-key]"))
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

  function runButtonAction(key) {
    if (key === "h") {
      toggleHelp();
      return;
    }
    if (state.paused) return;

    audio.resume();
    if (key === "r") resetGameState(state);
    else if (key === "f" && state.plane.state === "flying") state.plane.flaps = state.plane.flaps === 0 ? 15 : state.plane.flaps === 15 ? 30 : 0;
    else if (key === "g" && state.plane.state === "flying" && !state.plane.onGround) state.plane.gearDown = !state.plane.gearDown;
  }

  function isHoldControl(key) {
    return key.startsWith("arrow") || key === "a" || key === "z";
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

    runButtonAction(key);

    input.pressed.add(key);
    if (isHoldControl(key)) input.keys.add(key);
  }

  function onKeyUp(event) {
    const key = event.key.toLowerCase();
    input.keys.delete(key);
    input.pressed.delete(key);
  }

  function onPointerDown() {
    if (!state.paused) audio.resume();
  }

  function pressControl(button, event) {
    const key = button.dataset.key;
    if (!isHoldControl(key) || state.paused) return;
    if (event.cancelable) event.preventDefault();
    audio.resume();
    input.keys.add(key);
    button.classList.add("is-active");
    if (event.pointerId !== undefined) button.setPointerCapture(event.pointerId);
  }

  function releaseControl(button, event) {
    const key = button.dataset.key;
    if (isHoldControl(key)) {
      input.keys.delete(key);
      button.classList.remove("is-active");
      if (event.pointerId !== undefined && button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
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
  for (const button of elements.controls) {
    button.addEventListener("pointerdown", (event) => pressControl(button, event));
    button.addEventListener("pointerup", (event) => releaseControl(button, event));
    button.addEventListener("pointercancel", (event) => releaseControl(button, event));
    button.addEventListener("mousedown", (event) => pressControl(button, event));
    button.addEventListener("touchstart", (event) => pressControl(button, event), { passive: false });
    button.addEventListener("lostpointercapture", () => {
      input.keys.delete(button.dataset.key);
      button.classList.remove("is-active");
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (!isHoldControl(button.dataset.key)) runButtonAction(button.dataset.key);
    });
  }

  sync();
  return { sync, setPaused };
}
