/**
 * input.js — Touch and keyboard input handling
 *
 * Updated for stackable rush:
 * - Each shift/space press while gates are active adds a rush stack
 * - Rush stacks increase speed multiplier (2×, 3×, 4×)
 * - Rush resets when gates are resolved
 * - Double-tap on mobile also stacks
 */

export function setupInput(renderer, gameRef) {
  var sx = 0, sy = 0, swiped = false, lastTap = 0;
  var el = renderer.domElement;

  el.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (!gameRef.running || gameRef.paused) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    swiped = false;
    var now = Date.now();
    // Double-tap to rush — each tap adds a stack
    if (now - lastTap < 350 && gameRef.gatesActive) {
      gameRef.addRushStack();
    }
    lastTap = now;
  }, { passive: false });

  el.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (!gameRef.running || gameRef.paused || swiped) return;
    var dx = e.touches[0].clientX - sx;
    var dy = e.touches[0].clientY - sy;
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
    // Shift or Space adds rush stacks — can press multiple times
    if (e.key === 'Shift' || e.key === ' ') {
      if (gameRef.gatesActive) {
        gameRef.addRushStack();
      }
    }
    if (e.key === 'Escape') gameRef.togglePause();
  });
}
