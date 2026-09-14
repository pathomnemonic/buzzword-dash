/**
 * audio.js — Sound effects, procedural music, TTS, and ambient audio
 *
 * Features:
 * - 3-4 coin sound variations with stereo panning based on lane position
 * - 3-4 correct answer variations with streak pitch escalation
 * - Skin-specific ambient drone tones
 * - Speed-reactive pitch shifting
 * - Haptic feedback via navigator.vibrate() for supported devices
 * - Richer whoosh sound for rushing
 * - Achievement and continue sounds
 *
 * Stereo panning uses StereoPannerNode which is Baseline Widely Available
 * since April 2021 — supported in all modern browsers [6] [8].
 *
 * Haptic feedback uses navigator.vibrate() which is implemented in
 * Chromium-based browsers only. Firefox removed support in v129 (2024),
 * and WebKit/Safari has never shipped it [9] [10]. The vibrate() helper
 * gracefully degrades to a no-op on unsupported browsers.
 */

import { storage } from './storage.js';

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.musicGain = null;
        this.ambientGain = null;
        this.musicPlaying = false;
        this.ambientPlaying = false;
        this.musicInterval = null;
        this.ambientOscillators = [];
        this.currentStep = 0;
        this.speedPitchMultiplier = 1.0;

        // Streak pitch escalation tracking
        // Increments on each correct answer, resets on wrong answer
        // Formula: baseFreq = 523 + (correctCounter % 5) * 30
        this.correctCounter = 0;
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

    // ===== HAPTIC FEEDBACK =====
    // Chromium-based browsers only. Gracefully degrades on Safari/Firefox [9] [10].

    vibrate(pattern) {
        if (navigator.vibrate) {
            try {
                navigator.vibrate(pattern);
            } catch (e) { /* silently ignore */ }
        }
    }

    // ===== SOUND EFFECT VARIATIONS =====

    /**
     * Play a sound effect with optional lane for stereo panning.
     * @param {string} type - Sound type
     * @param {number} [lane] - Lane position (0=left, 1=center, 2=right) for stereo panning
     */
    play(type, lane) {
        if (!this.ensureContext()) return;
        var vol = this.getVolume();
        if (vol <= 0) return;

        switch (type) {
            case 'correct':
                this._playCorrectVariation(vol);
                this.vibrate(50);
                break;
            case 'wrong':
                this._playWrong(vol);
                this.vibrate([30, 50, 30]);
                break;
            case 'coin':
                this._playCoinVariation(vol, lane);
                this.vibrate(15);
                break;
            case 'rush':
                this._playRush(vol);
                this.vibrate([20, 30, 20, 30, 20]);
                break;
            case 'countdown':
                this._playCountdown(vol);
                break;
            case 'powerup':
                this._playPowerup(vol);
                this.vibrate([40, 20, 40]);
                break;
            case 'continue':
                this._playContinue(vol);
                break;
            case 'achievement':
                this._playAchievement(vol);
                this.vibrate([30, 20, 30, 20, 60]);
                break;
            default:
                this._playGeneric(vol);
                break;
        }
    }

    // ===== CORRECT ANSWER: 4 variations + streak pitch escalation =====

    _playCorrectVariation(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';

        // Calculate pitch escalation from streak counter
        var pitchShift = (this.correctCounter % 5) * 30;
        var baseFreq = 523 + pitchShift;

        // Increment counter for next correct answer
        this.correctCounter++;

        var variation = Math.floor(Math.random() * 4);

        switch (variation) {
            case 0:
                o.frequency.setValueAtTime(baseFreq, t);
                o.frequency.setValueAtTime(baseFreq + 136, t + 0.06);
                o.frequency.setValueAtTime(baseFreq + 261, t + 0.12);
                break;
            case 1:
                o.frequency.setValueAtTime(baseFreq + 64, t);
                o.frequency.setValueAtTime(baseFreq + 175, t + 0.07);
                o.frequency.setValueAtTime(baseFreq + 357, t + 0.14);
                break;
            case 2:
                o.frequency.setValueAtTime(baseFreq - 83, t);
                o.frequency.setValueAtTime(baseFreq + 31, t + 0.06);
                o.frequency.setValueAtTime(baseFreq + 136, t + 0.12);
                o.frequency.setValueAtTime(baseFreq + 357, t + 0.18);
                break;
            case 3:
                o.frequency.setValueAtTime(baseFreq + 136, t);
                o.frequency.setValueAtTime(baseFreq + 261, t + 0.05);
                o.frequency.setValueAtTime(baseFreq + 465, t + 0.1);
                break;
        }
        g.gain.setValueAtTime(vol * 0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g); o.start(t); o.stop(t + 0.25);
    }

    _playWrong(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, t);
        o.frequency.setValueAtTime(130, t + 0.1);
        g.gain.setValueAtTime(vol * 0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g); o.start(t); o.stop(t + 0.18);
    }

    // ===== COIN: 4 variations with stereo panning =====
    // StereoPannerNode pans based on lane: left=-0.7, center=0, right=0.7 [6] [8]

    _playCoinVariation(vol, lane) {
        var variation = Math.floor(Math.random() * 4);
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();

        // Stereo panning based on lane position
        var panner = null;
        if (typeof ctx.createStereoPanner === 'function') {
            panner = ctx.createStereoPanner();
            var panValue = 0;
            if (lane === 0) panValue = -0.7;
            else if (lane === 2) panValue = 0.7;
            panner.pan.setValueAtTime(panValue, t);
            g.connect(panner);
            panner.connect(ctx.destination);
        } else {
            // Fallback: no panning if StereoPannerNode not available
            g.connect(ctx.destination);
        }

        var o = ctx.createOscillator();
        o.type = 'sine';

        switch (variation) {
            case 0:
                o.frequency.setValueAtTime(988, t);
                o.frequency.setValueAtTime(1318, t + 0.04);
                break;
            case 1:
                o.frequency.setValueAtTime(1047, t);
                o.frequency.setValueAtTime(1397, t + 0.04);
                break;
            case 2:
                o.frequency.setValueAtTime(880, t);
                o.frequency.setValueAtTime(1175, t + 0.03);
                o.frequency.setValueAtTime(1480, t + 0.06);
                break;
            case 3:
                o.frequency.setValueAtTime(1175, t);
                o.frequency.setValueAtTime(1480, t + 0.04);
                break;
        }
        g.gain.setValueAtTime(vol * 0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o.connect(g); o.start(t); o.stop(t + 0.1);
    }

    // --- Rush: richer whoosh ---
    _playRush(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g1 = ctx.createGain();
        g1.connect(ctx.destination);
        var o1 = ctx.createOscillator();
        o1.type = 'sine';
        o1.frequency.setValueAtTime(400, t);
        o1.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
        g1.gain.setValueAtTime(vol * 0.1, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o1.connect(g1); o1.start(t); o1.stop(t + 0.15);
        // Second layer: higher octave
        var g2 = ctx.createGain();
        g2.connect(ctx.destination);
        var o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(800, t);
        o2.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
        g2.gain.setValueAtTime(vol * 0.06, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o2.connect(g2); o2.start(t); o2.stop(t + 0.12);
    }

    _playCountdown(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(660, t);
        g.gain.setValueAtTime(vol * 0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); o.start(t); o.stop(t + 0.1);
    }

    _playPowerup(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(440, t);
        o.frequency.exponentialRampToValueAtTime(1760, t + 0.3);
        g.gain.setValueAtTime(vol * 0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); o.start(t); o.stop(t + 0.35);
    }

    _playContinue(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(330, t);
        o.frequency.setValueAtTime(440, t + 0.1);
        o.frequency.setValueAtTime(550, t + 0.2);
        o.frequency.setValueAtTime(660, t + 0.3);
        o.frequency.setValueAtTime(880, t + 0.4);
        g.gain.setValueAtTime(vol * 0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); o.start(t); o.stop(t + 0.5);
    }

    _playAchievement(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(523, t);
        o.frequency.setValueAtTime(659, t + 0.1);
        o.frequency.setValueAtTime(784, t + 0.2);
        o.frequency.setValueAtTime(1047, t + 0.3);
        g.gain.setValueAtTime(vol * 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); o.start(t); o.stop(t + 0.5);
    }

    _playGeneric(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(440, t);
        g.gain.setValueAtTime(vol * 0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g); o.start(t); o.stop(t + 0.1);
    }

    // ===== STREAK SOUND WITH PITCH ESCALATION =====

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

        var baseFreq = 523 + Math.min(streak, 50) * 10;
        var noteCount = Math.min(3 + Math.floor(streak / 10), 6);
        var duration = 0.055;

        for (var i = 0; i < noteCount; i++) {
            o.frequency.setValueAtTime(baseFreq * (1 + i * 0.18), t + i * duration);
        }

        g.gain.setValueAtTime(vol * 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + noteCount * duration + 0.12);
        o.connect(g); o.start(t); o.stop(t + noteCount * duration + 0.12);

        // Reset per-answer counter after milestone
        this.correctCounter = 0;
    }

    // ===== TTS WITH SPEED-ADAPTIVE RATE =====

    speak(text, gameSpeed) {
        if (!storage.get('ttsEnabled') || !window.speechSynthesis) return;

        var arrivalTime = 60 / (gameSpeed || 10);
        var wordCount = text.split(/[\s.]+/).filter(function (w) { return w.length > 0; }).length;
        var naturalDuration = wordCount * 0.4;
        var targetDuration = Math.max(0.5, arrivalTime - 0.5);
        var rate = naturalDuration / targetDuration;
        rate = Math.max(0.5, Math.min(3.0, rate));

        var u = new SpeechSynthesisUtterance(text);
        u.rate = rate;
        u.volume = storage.get('masterVolume') * 0.7;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    }

    // ===== BACKGROUND MUSIC =====

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

        var melody = [523, 587, 659, 784, 880, 784, 659, 587, 523, 0, 659, 0, 784, 880, 0, 523];
        var bass = [131, 0, 0, 0, 131, 0, 0, 0, 165, 0, 0, 0, 165, 0, 0, 0];

        var self = this;
        this.musicInterval = setInterval(function () {
            if (!self.musicPlaying || !self.ctx) return;
            var step = self.currentStep % 16;
            var pitch = self.speedPitchMultiplier;

            if (step % 2 === 0) {
                self._playNote('square', (6000 + Math.random() * 2000) * pitch, 0.03, 0.03, self.musicGain);
            }
            if (bass[step] > 0) {
                self._playNote('sine', bass[step] * pitch, 0.15, stepTime * 1.5, self.musicGain);
            }
            if (melody[step] > 0) {
                self._playNote('triangle', melody[step] * pitch, 0.08, stepTime * 0.8, self.musicGain);
            }
            if (step === 0 || step === 8) {
                self._playKick(self.musicGain);
            }
            self.currentStep++;
        }, stepTime * 1000);
    }

    _playNote(type, freq, volume, duration, destination) {
        if (!this.ctx) return;
        var t = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(volume, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        o.connect(g); g.connect(destination);
        o.start(t); o.stop(t + duration + 0.01);
    }

    _playKick(destination) {
        if (!this.ctx) return;
        var t = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.1);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o.connect(g); g.connect(destination);
        o.start(t); o.stop(t + 0.2);
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
        if (this.musicGain) this.musicGain.gain.value = 0;
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
        if (this.musicGain) this.musicGain.gain.value = storage.get('masterVolume') * 0.12;
        if (this.ambientGain) this.ambientGain.gain.value = storage.get('masterVolume') * 0.04;
    }

    // ===== SPEED-REACTIVE PITCH =====

    updateSpeedPitch(baseSpeed, currentSpeed) {
        var ratio = currentSpeed / Math.max(baseSpeed, 0.01);
        this.speedPitchMultiplier = 1.0 + Math.min((ratio - 1) * 0.05, 0.15);
    }

    // ===== SKIN-SPECIFIC AMBIENT DRONE =====

    startAmbient(skinName) {
        this.stopAmbient();
        if (!this.ensureContext()) return;

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = storage.get('masterVolume') * 0.04;
        this.ambientGain.connect(this.ctx.destination);

        var ambientConfigs = {
            'Neural Highway': { freq: 110, freq2: 165, type: 'sine' },
            'Vascular Rush': { freq: 80, freq2: 120, type: 'sine' },
            'Skeletal Corridor': { freq: 55, freq2: 82, type: 'triangle' },
            'Cellular Matrix': { freq: 130, freq2: 196, type: 'sine' },
            'Neon ER': { freq: 98, freq2: 147, type: 'sine' },
            'DNA Helix Tunnel': { freq: 146, freq2: 220, type: 'sine' },
            'Prescription Sunset': { freq: 73, freq2: 110, type: 'triangle' },
            'Cardiac Pulse': { freq: 65, freq2: 98, type: 'sine' },
            'Surgical Theater': { freq: 123, freq2: 185, type: 'sine' },
            'Candy Lab': { freq: 164, freq2: 247, type: 'sine' },
            'X-Ray Vision': { freq: 92, freq2: 138, type: 'triangle' },
            'Defibrillator Shock': { freq: 87, freq2: 131, type: 'square' }
        };

        var config = ambientConfigs[skinName] || { freq: 100, freq2: 150, type: 'sine' };

        // Primary drone
        var osc1 = this.ctx.createOscillator();
        osc1.type = config.type;
        osc1.frequency.setValueAtTime(config.freq, this.ctx.currentTime);
        var g1 = this.ctx.createGain();
        g1.gain.value = 0.5;
        osc1.connect(g1); g1.connect(this.ambientGain);
        osc1.start();

        // Secondary harmonic
        var osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(config.freq2, this.ctx.currentTime);
        var g2 = this.ctx.createGain();
        g2.gain.value = 0.25;
        osc2.connect(g2); g2.connect(this.ambientGain);
        osc2.start();

        this.ambientOscillators = [osc1, osc2];
        this.ambientPlaying = true;
    }

    stopAmbient() {
        for (var i = 0; i < this.ambientOscillators.length; i++) {
            try { this.ambientOscillators[i].stop(); } catch (e) {}
        }
        this.ambientOscillators = [];
        this.ambientPlaying = false;
    }
}

export var audio = new AudioEngine();
