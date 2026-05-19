import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./config.js";
import { createAudioController } from "./audio.js";
import { updateFlight } from "./flight.js";
import { createRenderer } from "./renderer.js";
import { createGameState } from "./state.js";
import { createInput, createUi } from "./ui.js";

const canvas = document.getElementById("game");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const state = createGameState();
const input = createInput();
const audio = createAudioController();
const ui = createUi(state, input, audio);
const renderer = createRenderer(canvas);

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!state.paused) updateFlight(state, input, dt);
  audio.update(state);
  ui.sync();
  renderer.render(state);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
