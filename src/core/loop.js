// Fixed-timestep game loop. The simulation only ever advances in whole 1/60
// second steps so physics and animation stay deterministic regardless of the
// display refresh rate.

export const TICK = 1 / 60;
const MAX_STEPS = 5; // a backgrounded tab must not try to catch up forever

export function startLoop({ step, draw }) {
  let last = performance.now();
  let acc = 0;
  let frames = 0, fpsTimer = 0, fps = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;
    acc += elapsed;

    let steps = 0;
    while (acc >= TICK && steps < MAX_STEPS) {
      step(TICK);
      acc -= TICK;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;

    fpsTimer += elapsed;
    frames++;
    if (fpsTimer >= 0.5) {
      fps = Math.round(frames / fpsTimer);
      frames = 0; fpsTimer = 0;
    }

    draw(fps);
  }

  requestAnimationFrame(frame);
  return { stop() { running = false; } };
}
