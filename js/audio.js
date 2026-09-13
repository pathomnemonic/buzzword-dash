/**
 * audio.js — Sound effects, procedural music, and TTS
 *
 * All Phases through Final:
 * - TTS rate auto-adapts to game speed so speech finishes before gates arrive
 * - Streak milestone sounds with escalating pitch at higher streaks
 * - Achievement unlock fanfare sound
 * - Continue (extra life) sound
 * - All standard SFX (correct, wrong, coin, rush, countdown, powerup)
 * - Procedural background music (128 BPM, pentatonic melody)
 */

import { storage } from './storage.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.musicPlaying = false;
    this.musicInterval = null;
    this.currentStep = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not available');
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return !!this.ctx;
  }

  getVolume() {
    return storage.get('masterVolume') * storage.get('sfxVolume');
  }

  // --- Sound effects ---
  play(type) {
    if (!this.ensureContext()) return;
    var vol = this.getVolume();
    if (vol <= 0) return;

    var ctx = this.ctx;
    var t = ctx.currentTime;
    var g = ctx.createGain();
    g.connect(ctx.destination);
    var o = ctx.createOscillator();

    switch (type) {
      case 'correct':
        o.type = 'sine';
        o.frequency.setValueAtTime(523, t);
        o.frequency.setValueAtTime(659, t + 0.07);
        o.frequency.setValueAtTime(784, t + 0.14);
        g.gain.setValueAtTime(vol * 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g); o.start(t); o.stop(t + 0.25);
        break;

      case 'wrong':
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, t);
        o.frequency.setValueAtTime(130, t + 0.1);
        g.gain.setValueAtTime(vol * 0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g); o.start(t); o.stop(t + 0.18);
        break;

      case 'coin':
        o.type = 'sine';
        o.frequency.setValueAtTime(988, t);
        o.frequency.setValueAtTime(1318, t + 0.04);
        g.gain.setValueAtTime(vol * 0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g); o.start(t); o.stop(t + 0.08);
        break;

      case 'rush':
        o.type = 'sine';
        o.frequency.setValueAtTime(600, t);
        o.frequency.exponentialRampToValueAtTime(1400, t + 0.1);
        g.gain.setValueAtTime(vol * 0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        o.connect(g); o.start(t); o.stop(t + 0.13);
        break;

      case 'countdown':
        o.type = 'sine';
        o.frequency.setValueAtTime(660, t);
        g.gain.setValueAtTime(vol * 0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); o.start(t); o.stop(t + 0.1);
        break;

      case 'powerup':
        o.type = 'sine';
        o.frequency.setValueAtTime(440, t);
        o.frequency.exponentialRampToValueAtTime(1760, t + 0.3);
        g.gain.setValueAtTime(vol * 0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); o.start(t); o.stop(t + 0.35);
        break;

      case 'continue':
        // Rising arpeggio — second chance!
        o.type = 'sine';
        o.frequency.setValueAtTime(330, t);
        o.frequency.setValueAtTime(440, t + 0.1);
        o.frequency.setValueAtTime(550, t + 0.2);
        o.frequency.setValueAtTime(660, t + 0.3);
        o.frequency.setValueAtTime(880, t + 0.4);
        g.gain.setValueAtTime(vol * 0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); o.start(t); o.stop(t + 0.5);
        break;

      case 'achievement':
        // Triumphant fanfare
        o.type = 'sine';
        o.frequency.setValueAtTime(523, t);
        o.frequency.setValueAtTime(659, t + 0.1);
        o.frequency.setValueAtTime(784, t + 0.2);
        o.frequency.setValueAtTime(1047, t + 0.3);
        g.gain.setValueAtTime(vol * 0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); o.start(t); o.stop(t + 0.5);
        break;

      default:
        o.type = 'sine';
        o.frequency.setValueAtTime(440, t);
        g.gain.setValueAtTime(vol * 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); o.start(t); o.stop(t + 0.1);
    }
  }

  // --- Streak milestone sounds with escalating pitch ---
  playStreakSound(streak) {
    if (!this.ensureContext()) return;
    var vol = this.getVolume();
    if (vol <= 0) return;

    var ctx = this.ctx;
    var t = ctx.currentTime;
    var g = ctx.createGain();
    g.connect(ctx.destination);
    var o = ctx.createOscillator();
    o.type = 'sine';

    // Base frequency scales up with streak
    // streak 5 = C5, streak 10 = E5, streak 15 = G5, etc.
    var baseFreq = 523 + Math.min(streak, 50) * 10;
    var noteCount = Math.min(3 + Math.floor(streak / 10), 6);
    var duration = 0.06;

    for (var i = 0; i < noteCount; i++) {
      var freq = baseFreq * (1 + i * 0.2);
      o.frequency.setValueAtTime(freq, t + i * duration);
    }

    g.gain.setValueAtTime(vol * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + noteCount * duration + 0.15);
    o.connect(g);
    o.start(t);
    o.stop(t + noteCount * duration + 0.15);
  }

  // --- TTS with speed-adaptive rate ---
  speak(text, gameSpeed) {
    if (!storage.get('ttsEnabled') || !window.speechSynthesis) return;

    // Gate distance = 60 units
    // arrivalTime = 60 / gameSpeed
    var arrivalTime = 60 / (gameSpeed || 10);

    // Estimate natural speech duration at rate 1.0
    // ~2.5 words per second at normal rate
    var wordCount = text.split(/[\s.]+/).filter(function (w) { return w.length > 0; }).length;
    var naturalDuration = wordCount * 0.4;

    // Calculate rate to finish 0.5s before gates arrive
    var targetDuration = Math.max(0.5, arrivalTime - 0.5);
    var rate = naturalDuration / targetDuration;

    // Clamp to usable range
    rate = Math.max(0.5, Math.min(3.0, rate));

    var u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.volume = storage.get('masterVolume') * 0.7;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  // --- Background Music ---
  startMusic() {
    if (this.musicPlaying) return;
    if (!this.ensureContext()) return;
    this.musicPlaying = true;
    this.currentStep = 0;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = storage.get('masterVolume') * 0.12;
    this.musicGain.connect(this.ctx.destination);

    var bpm = 128;
    var stepTime = (60 / bpm) / 2;

    var melody = [523, 587, 659, 784, 880, 784, 659, 587,
                  523, 0, 659, 0, 784, 880, 0, 523];
    var bass = [131, 0, 0, 0, 131, 0, 0, 0,
                165, 0, 0, 0, 165, 0, 0, 0];

    var self = this;
    this.musicInterval = setInterval(function () {
      if (!self.musicPlaying || !self.ctx) return;
      var step = self.currentStep % 16;

      if (step % 2 === 0) {
        self.playNote('square', 6000 + Math.random() * 2000, 0.03, 0.03, self.musicGain);
      }
      if (bass[step] > 0) {
        self.playNote('sine', bass[step], 0.15, stepTime * 1.5, self.musicGain);
      }
      if (melody[step] > 0) {
        self.playNote('triangle', melody[step], 0.08, stepTime * 0.8, self.musicGain);
      }
      if (step === 0 || step === 8) {
        self.playKick(self.musicGain);
      }
      self.currentStep++;
    }, stepTime * 1000);
  }

  playNote(type, freq, volume, duration, destination) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(destination);
    o.start(t);
    o.stop(t + duration + 0.01);
  }

  playKick(destination) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g);
    g.connect(destination);
    o.start(t);
    o.stop(t + 0.2);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.musicGain) {
      this.musicGain.gain.value = 0;
    }
  }

  toggleMusic() {
    if (this.musicPlaying) {
      this.stopMusic();
      storage.set('musicOn', false);
    } else {
      this.startMusic();
      storage.set('musicOn', true);
    }
    return this.musicPlaying;
  }

  updateMusicVolume() {
    if (this.musicGain) {
      this.musicGain.gain.value = storage.get('masterVolume') * 0.12;
    }
  }
}

export var audio = new AudioEngine();
