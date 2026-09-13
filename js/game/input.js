/**
 * input.js — Touch and keyboard input handling
 */

export function setupInput(renderer, gameRef) {
  let sx = 0, sy = 0, swiped = false, lastTap = 0;
  const el = renderer.domElement;

  el.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (!gameRef.running || gameRef.paused) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiped = false;
    const now = Date.now();
    if (now - lastTap < 300 && gameRef.gatesActive) gameRef.startRush();
    lastTap = now;
  }, { passive: false });

  el.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (!gameRef.running || gameRef.paused || swiped) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < -30) { gameRef.jump(); swiped = true; }
      else if (dy > 30) { gameRef.slide(); swiped = true; }
    } else if (Math.abs(dx) > 30) {
      if (dx > 0 && gameRef.targetLane < 2) gameRef.targetLane++;
      else if (dx < 0 && gameRef.targetLane > 0) gameRef.targetLane--;
      swiped = true;
    }
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (!gameRef.running || gameRef.paused) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') { if (gameRef.targetLane > 0) gameRef.targetLane--; }
    if (e.key === 'ArrowRight' || e.key === 'd') { if (gameRef.targetLane < 2) gameRef.targetLane++; }
    if (e.key === 'ArrowUp' || e.key === 'w') gameRef.jump();
    if (e.key === 'ArrowDown' || e.key === 's') gameRef.slide();
    if (e.key === 'Shift' || e.key === ' ') { if (gameRef.gatesActive) gameRef.startRush(); }
    if (e.key === 'Escape') gameRef.togglePause();
  });
}
