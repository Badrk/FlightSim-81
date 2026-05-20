import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./config.js?v=1.5.5";
import { createAudioController } from "./audio.js?v=1.5.5";
import { updateFlight } from "./flight.js?v=1.5.5";
import { createRenderer } from "./renderer.js?v=1.5.5";
import { createGameState } from "./state.js?v=1.5.5";
import { createInput, createUi } from "./ui.js?v=1.5.5";

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
