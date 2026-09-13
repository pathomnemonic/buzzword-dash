/**
 * audio.js — Sound effects + procedural background music
 *
 * Uses Web Audio API OscillatorNode and GainNode for all sound.
 * No audio files needed — everything is synthesized.
 *
 * The Web Audio API generates periodic waveforms (sine, square, 
 * sawtooth, triangle) and chains them with gain nodes for volume
 * control, enabling procedural music generation entirely in 
 * JavaScript without loading external audio files.
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
    const vol = this.getVolume();
    if (vol <= 0) return;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(ctx.destination);
    const o = ctx.createOscillator();

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

      default:
        o.type = 'sine';
        o.frequency.setValueAtTime(440, t);
        g.gain.setValueAtTime(vol * 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); o.start(t); o.stop(t + 0.1);
    }
  }

  // --- TTS ---
  speak(text) {
    if (!storage.get('ttsEnabled') || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = storage.get('ttsRate') || 1;
    u.volume = storage.get('masterVolume') * 0.7;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  // --- Background Music (procedural) ---
  // Generates a simple looping electronic beat using oscillators.
  // Pattern: bass on 1/3, hi-hat on every beat, melody on select steps.
  startMusic() {
    if (this.musicPlaying) return;
    if (!this.ensureContext()) return;
    this.musicPlaying = true;
    this.currentStep = 0;

    // Master gain for music
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = storage.get('masterVolume') * 0.12;
    this.musicGain.connect(this.ctx.destination);

    const bpm = 128;
    const stepTime = (60 / bpm) / 2; // 16th notes

    // Melody notes (pentatonic scale in C)
    const melody = [523, 587, 659, 784, 880, 784, 659, 587,
                    523, 0, 659, 0, 784, 880, 0, 523];
    // Bass pattern
    const bass = [131, 0, 0, 0, 131, 0, 0, 0,
                  165, 0, 0, 0, 165, 0, 0, 0];

    this.musicInterval = setInterval(() => {
      if (!this.musicPlaying || !this.ctx) return;
      const t = this.ctx.currentTime;
      const step = this.currentStep % 16;

      // Hi-hat on every other step
      if (step % 2 === 0) {
        this.playNote('square', 6000 + Math.random() * 2000, 0.03, 0.03, this.musicGain);
      }

      // Bass
      if (bass[step] > 0) {
        this.playNote('sine', bass[step], 0.15, stepTime * 1.5, this.musicGain);
      }

      // Melody
      if (melody[step] > 0) {
        this.playNote('triangle', melody[step], 0.08, stepTime * 0.8, this.musicGain);
      }

      // Kick on 1 and 9
      if (step === 0 || step === 8) {
        this.playKick(this.musicGain);
      }

      this.currentStep++;
    }, stepTime * 1000);
  }

  playNote(type, freq, volume, duration, destination) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
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
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
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

export const audio = new AudioEngine();