/**
 * audio.js — Sound effects, procedural music, TTS, and ambient audio
 *
 * MAJOR OVERHAUL:
 * - Real procedural music system with per-skin musical styles
 * - Multiple voices: bass, melody, chords, percussion
 * - Proper instrument-like sounds (filtered oscillators, envelopes)
 * - Map transition music crossfade
 * - Removed annoying ambient drones, replaced with subtle environmental FX
 * - New sound effects: heart, monsterClose, monsterConsume, faceplant,
 *   mapTransition, elimination, raceFinish, timerWarning
 * - Independent music volume control
 * - Music ducking during important SFX
 * - Tempo scales with game speed
 *
 * Uses Web Audio API [3] for all sound generation.
 * StereoPannerNode for coin panning.
 * Haptic feedback via navigator.vibrate() (Chromium only).
 */

import { storage } from './storage.js';

// ===== MUSICAL CONSTANTS =====
var SCALES = {
    cMinorPentatonic: [0, 3, 5, 7, 10],
    cMajorPentatonic: [0, 2, 4, 7, 9],
    cMinor: [0, 2, 3, 5, 7, 8, 10],
    cMajor: [0, 2, 4, 5, 7, 9, 11],
    cBlues: [0, 3, 5, 6, 7, 10],
    cDorian: [0, 2, 3, 5, 7, 9, 10],
    cMixolydian: [0, 2, 4, 5, 7, 9, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

// Convert MIDI note to frequency
function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// Get a note from a scale
function scaleNote(scale, baseNote, index) {
    var octave = Math.floor(index / scale.length);
    var degree = ((index % scale.length) + scale.length) % scale.length;
    return baseNote + octave * 12 + scale[degree];
}

// ===== SKIN MUSIC CONFIGURATIONS =====
var SKIN_MUSIC = {
    'Neural Highway': {
        bpm: 128, key: 48, scale: 'cMinorPentatonic',
        bassPattern: [0, 0, -1, 0, 2, 2, -1, 3, 0, 0, -1, 2, 3, 3, -1, 0],
        melodyPattern: [4, 5, 7, -1, 5, 4, -1, 7, 8, 7, 5, -1, 4, 5, -1, 7],
        chordIntervals: [[0, 3, 7], [0, 3, 7], [2, 5, 9], [2, 5, 9]],
        bassType: 'triangle', melodyType: 'sawtooth', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0] },
        filterFreq: 2000, filterQ: 2
    },
    'Vascular Rush': {
        bpm: 140, key: 45, scale: 'cMinor',
        bassPattern: [0, 0, 0, -1, 0, 3, -1, 2, 0, 0, 0, -1, 3, 2, -1, 0],
        melodyPattern: [7, 8, 10, 7, -1, 8, 10, 12, 10, 8, 7, -1, 5, 7, 8, -1],
        chordIntervals: [[0, 3, 7], [3, 7, 10], [0, 3, 7], [5, 8, 12]],
        bassType: 'sawtooth', melodyType: 'square', padType: 'triangle',
        drumPattern: { kick: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], snare: [0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,1], hat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] },
        filterFreq: 3000, filterQ: 1
    },
    'Skeletal Corridor': {
        bpm: 100, key: 40, scale: 'cDorian',
        bassPattern: [0, -1, -1, 2, 0, -1, 3, -1, 5, -1, -1, 3, 2, -1, 0, -1],
        melodyPattern: [7, -1, 5, -1, 3, 5, -1, -1, 7, -1, 8, -1, 7, 5, -1, -1],
        chordIntervals: [[0, 3, 7], [0, 3, 7], [5, 9, 12], [3, 7, 10]],
        bassType: 'triangle', melodyType: 'triangle', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0] },
        filterFreq: 1500, filterQ: 3
    },
    'Cellular Matrix': {
        bpm: 120, key: 52, scale: 'cMajorPentatonic',
        bassPattern: [0, -1, 2, -1, 0, -1, 4, -1, 2, -1, 0, -1, 4, -1, 2, -1],
        melodyPattern: [4, 5, 7, 9, 7, 5, 4, -1, 5, 7, 9, 11, 9, 7, 5, -1],
        chordIntervals: [[0, 4, 7], [0, 4, 7], [2, 5, 9], [4, 7, 11]],
        bassType: 'sine', melodyType: 'sine', padType: 'triangle',
        drumPattern: { kick: [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [1,0,1,1,0,1,1,0,1,1,0,1,1,0,1,0] },
        filterFreq: 4000, filterQ: 1
    },
    'Neon ER': {
        bpm: 138, key: 48, scale: 'cMinor',
        bassPattern: [0, 0, -1, 0, 3, 3, -1, 5, 3, 3, -1, 0, 7, 5, -1, 3],
        melodyPattern: [7, 10, 12, -1, 10, 7, 12, -1, 7, 10, 12, 14, 12, 10, 7, -1],
        chordIntervals: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [0, 3, 7]],
        bassType: 'sawtooth', melodyType: 'sawtooth', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1] },
        filterFreq: 2500, filterQ: 3
    },
    'DNA Helix Tunnel': {
        bpm: 132, key: 50, scale: 'cMinorPentatonic',
        bassPattern: [0, -1, 0, 2, -1, 2, 3, -1, 5, -1, 3, 2, -1, 0, 2, -1],
        melodyPattern: [5, 7, 8, 10, 12, 10, 8, 7, 5, 7, 8, 10, 8, 7, 5, -1],
        chordIntervals: [[0, 3, 7], [2, 5, 9], [3, 7, 10], [0, 3, 7]],
        bassType: 'triangle', melodyType: 'sawtooth', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1] },
        filterFreq: 2200, filterQ: 2
    },
    'Prescription Sunset': {
        bpm: 90, key: 48, scale: 'cMajorPentatonic',
        bassPattern: [0, -1, -1, 0, -1, 2, -1, -1, 4, -1, -1, 2, -1, 0, -1, -1],
        melodyPattern: [7, -1, 9, 7, -1, -1, 5, -1, 4, -1, 5, 7, -1, -1, 9, -1],
        chordIntervals: [[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 4, 7]],
        bassType: 'triangle', melodyType: 'triangle', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [0,0,1,0,1,0,0,0,1,0,1,0,0,0,1,0] },
        filterFreq: 1800, filterQ: 1
    },
    'Cardiac Pulse': {
        bpm: 125, key: 45, scale: 'cMinor',
        bassPattern: [0, 0, -1, -1, 0, 0, -1, -1, 3, 3, -1, -1, 2, 2, -1, -1],
        melodyPattern: [7, -1, 8, 7, -1, 5, -1, 7, 8, -1, 10, 8, -1, 7, -1, 5],
        chordIntervals: [[0, 3, 7], [0, 3, 7], [3, 7, 10], [2, 5, 8]],
        bassType: 'sine', melodyType: 'sawtooth', padType: 'triangle',
        drumPattern: { kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0] },
        filterFreq: 2000, filterQ: 2
    },
    'Surgical Theater': {
        bpm: 118, key: 52, scale: 'cMajor',
        bassPattern: [0, -1, 0, -1, 2, -1, 2, -1, 4, -1, 4, -1, 2, -1, 0, -1],
        melodyPattern: [7, 9, 11, -1, 9, 7, -1, 11, 12, 11, 9, -1, 7, 9, -1, -1],
        chordIntervals: [[0, 4, 7], [2, 5, 9], [4, 7, 11], [0, 4, 7]],
        bassType: 'sine', melodyType: 'triangle', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] },
        filterFreq: 3500, filterQ: 1
    },
    'Candy Lab': {
        bpm: 145, key: 55, scale: 'cMajorPentatonic',
        bassPattern: [0, 0, 2, 2, 4, 4, 2, 2, 0, 0, 4, 4, 2, 2, 0, 0],
        melodyPattern: [7, 9, 11, 9, 7, 9, 11, 14, 11, 9, 7, 9, 11, 9, 7, -1],
        chordIntervals: [[0, 4, 7], [4, 7, 11], [0, 4, 7], [2, 5, 9]],
        bassType: 'square', melodyType: 'square', padType: 'triangle',
        drumPattern: { kick: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], snare: [0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,1], hat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] },
        filterFreq: 5000, filterQ: 0.5
    },
    'X-Ray Vision': {
        bpm: 108, key: 43, scale: 'cDorian',
        bassPattern: [0, -1, -1, 0, -1, -1, 2, -1, 3, -1, -1, 2, -1, -1, 0, -1],
        melodyPattern: [7, -1, -1, 8, -1, 7, -1, -1, 5, -1, -1, 7, -1, 8, -1, -1],
        chordIntervals: [[0, 3, 7], [0, 3, 7], [3, 5, 10], [2, 5, 9]],
        bassType: 'sine', melodyType: 'sine', padType: 'sine',
        drumPattern: { kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], snare: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0], hat: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0] },
        filterFreq: 1200, filterQ: 4
    },
    'Defibrillator Shock': {
        bpm: 136, key: 48, scale: 'cBlues',
        bassPattern: [0, 0, 0, -1, 3, 3, -1, 5, 3, 3, -1, 0, 5, 3, -1, 0],
        melodyPattern: [5, 7, 8, 10, -1, 8, 7, 5, 7, 8, 10, 12, -1, 10, 8, 7],
        chordIntervals: [[0, 3, 6, 7], [0, 3, 7], [3, 6, 10], [0, 3, 7]],
        bassType: 'sawtooth', melodyType: 'sawtooth', padType: 'triangle',
        drumPattern: { kick: [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1], hat: [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0] },
        filterFreq: 3000, filterQ: 2
    }
};

// ===== MUSIC GENERATOR CLASS =====
class MusicGenerator {
    constructor(ctx, masterGain, skinName) {
        this.ctx = ctx;
        this.masterGain = masterGain;
        this.skinName = skinName;
        this.config = SKIN_MUSIC[skinName] || SKIN_MUSIC['Neural Highway'];
        this.scale = SCALES[this.config.scale] || SCALES.cMinorPentatonic;
        this.playing = false;
        this.stepInterval = null;
        this.currentStep = 0;
        this.outputGain = null;
        this.tempoMultiplier = 1.0;

        // Create output gain for crossfading
        this.outputGain = ctx.createGain();
        this.outputGain.gain.value = 1.0;
        this.outputGain.connect(masterGain);

        // Create filter for melody
        this.melodyFilter = ctx.createBiquadFilter();
        this.melodyFilter.type = 'lowpass';
        this.melodyFilter.frequency.value = this.config.filterFreq || 2000;
        this.melodyFilter.Q.value = this.config.filterQ || 2;
        this.melodyFilter.connect(this.outputGain);
    }

    play() {
        if (this.playing) return;
        this.playing = true;
        this.currentStep = 0;
        var self = this;
        var stepTime = (60 / this.config.bpm) / 4; // 16th notes

        this.stepInterval = setInterval(function () {
            if (!self.playing) return;
            self._playStep(self.currentStep);
            self.currentStep = (self.currentStep + 1) % 16;
        }, stepTime * 1000 / self.tempoMultiplier);
    }

    stop() {
        this.playing = false;
        if (this.stepInterval) {
            clearInterval(this.stepInterval);
            this.stepInterval = null;
        }
    }

    fadeOut(duration) {
        if (!this.outputGain) return;
        var now = this.ctx.currentTime;
        this.outputGain.gain.setValueAtTime(this.outputGain.gain.value, now);
        this.outputGain.gain.linearRampToValueAtTime(0, now + duration);
        var self = this;
        setTimeout(function () { self.stop(); }, duration * 1000 + 100);
    }

    fadeIn(duration) {
        if (!this.outputGain) return;
        var now = this.ctx.currentTime;
        this.outputGain.gain.setValueAtTime(0, now);
        this.outputGain.gain.linearRampToValueAtTime(1.0, now + duration);
        this.play();
    }

    setTempoMultiplier(mult) {
        this.tempoMultiplier = Math.max(0.5, Math.min(1.5, mult));
        if (this.playing) {
            this.stop();
            this.play();
        }
    }

    _playStep(step) {
        var cfg = this.config;
        var vol = this._getMusicVolume();
        if (vol <= 0) return;

        // Drums
        this._playDrums(step, vol);

        // Bass (every 2 steps = 8th notes)
        if (step % 2 === 0) {
            var bassIdx = Math.floor(step / 1);
            if (bassIdx < cfg.bassPattern.length) {
                var bassNote = cfg.bassPattern[bassIdx];
                if (bassNote >= 0) {
                    var bassMidi = scaleNote(this.scale, cfg.key - 12, bassNote);
                    this._playBass(midiToFreq(bassMidi), vol);
                }
            }
        }

        // Melody (every step)
        if (step < cfg.melodyPattern.length) {
            var melNote = cfg.melodyPattern[step];
            if (melNote >= 0) {
                var melMidi = scaleNote(this.scale, cfg.key, melNote);
                this._playMelody(midiToFreq(melMidi), vol);
            }
        }

        // Pad chords (every 4 steps = quarter notes)
        if (step % 4 === 0) {
            var chordIdx = Math.floor(step / 4) % cfg.chordIntervals.length;
            this._playPad(cfg.chordIntervals[chordIdx], vol);
        }
    }

    _getMusicVolume() {
        var master = storage.get('masterVolume') || 0.7;
        var musicVol = storage.get('musicVolume');
        if (musicVol === undefined || musicVol === null) musicVol = 0.5;
        return master * musicVol;
    }

    // ===== INSTRUMENT VOICES =====

    _playBass(freq, vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var stepDur = (60 / this.config.bpm) / 4;

        var osc = ctx.createOscillator();
        osc.type = this.config.bassType || 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.12, t);
        gain.gain.setValueAtTime(vol * 0.10, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);

        osc.connect(gain);
        gain.connect(this.outputGain);
        osc.start(t);
        osc.stop(t + stepDur * 2);
    }

    _playMelody(freq, vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var stepDur = (60 / this.config.bpm) / 4;

        // Main oscillator
        var osc = ctx.createOscillator();
        osc.type = this.config.melodyType || 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        // Slight detune for warmth
        var osc2 = ctx.createOscillator();
        osc2.type = this.config.melodyType || 'sawtooth';
        osc2.frequency.setValueAtTime(freq * 1.003, t);

        var gain = ctx.createGain();
        // Attack-decay envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol * 0.06, t + 0.01);
        gain.gain.setValueAtTime(vol * 0.05, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.2);

        var gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(0, t);
        gain2.gain.linearRampToValueAtTime(vol * 0.03, t + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.2);

        osc.connect(gain);
        osc2.connect(gain2);
        gain.connect(this.melodyFilter);
        gain2.connect(this.melodyFilter);

        osc.start(t);
        osc.stop(t + stepDur * 1.5);
        osc2.start(t);
        osc2.stop(t + stepDur * 1.5);
    }

    _playPad(intervals, vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var stepDur = (60 / this.config.bpm) / 4;
        var chordDur = stepDur * 4;

        for (var i = 0; i < intervals.length; i++) {
            var noteMidi = scaleNote(this.scale, this.config.key, intervals[i]);
            var freq = midiToFreq(noteMidi);

            var osc = ctx.createOscillator();
            osc.type = this.config.padType || 'sine';
            osc.frequency.setValueAtTime(freq, t);

            // Slight detune for width
            var detune = (i - intervals.length / 2) * 5;
            osc.detune.setValueAtTime(detune, t);

            var gain = ctx.createGain();
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol * 0.025, t + 0.1);
            gain.gain.setValueAtTime(vol * 0.02, t + chordDur * 0.6);
            gain.gain.exponentialRampToValueAtTime(0.001, t + chordDur * 0.95);

            osc.connect(gain);
            gain.connect(this.outputGain);
            osc.start(t);
            osc.stop(t + chordDur);
        }
    }

    _playDrums(step, vol) {
        var drums = this.config.drumPattern;
        if (!drums) return;

        if (drums.kick && drums.kick[step]) this._playKick(vol);
        if (drums.snare && drums.snare[step]) this._playSnare(vol);
        if (drums.hat && drums.hat[step]) this._playHiHat(vol);
    }

    _playKick(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        osc.connect(gain);
        gain.connect(this.outputGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    _playSnare(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;

        // Noise burst for snare
        var bufferSize = ctx.sampleRate * 0.08;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        var noise = ctx.createBufferSource();
        noise.buffer = buffer;

        var noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 3000;

        var noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(vol * 0.10, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.outputGain);
        noise.start(t);

        // Tonal body
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.04);

        var oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(vol * 0.08, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        osc.connect(oscGain);
        oscGain.connect(this.outputGain);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    _playHiHat(vol) {
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var bufferSize = ctx.sampleRate * 0.03;
        var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        var noise = ctx.createBufferSource();
        noise.buffer = buffer;

        var filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.outputGain);
        noise.start(t);
    }

    dispose() {
        this.stop();
        if (this.outputGain) {
            try { this.outputGain.disconnect(); } catch (e) {}
        }
        if (this.melodyFilter) {
            try { this.melodyFilter.disconnect(); } catch (e) {}
        }
    }
}


// ===== MAIN AUDIO ENGINE =====

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.musicGain = null;
        this.musicPlaying = false;
        this.speedPitchMultiplier = 1.0;

        // New music system
        this.musicGenerator = null;
        this.crossfadeGenerator = null;

        // Ambient system (environmental FX, not drones)
        this.ambientPlaying = false;
        this.ambientTimers = [];

        // Streak pitch escalation tracking
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

    getMusicVolume() {
        var master = storage.get('masterVolume') || 0.7;
        var musicVol = storage.get('musicVolume');
        if (musicVol === undefined || musicVol === null) musicVol = 0.5;
        return master * musicVol;
    }

    // ===== HAPTIC FEEDBACK =====
    vibrate(pattern) {
        if (navigator.vibrate) {
            try { navigator.vibrate(pattern); } catch (e) {}
        }
    }

    // ===== SOUND EFFECTS =====

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
            case 'heart':
                this._playHeart(vol);
                this.vibrate([40, 30, 40]);
                break;
            case 'monsterClose':
                this._playMonsterClose(vol);
                this.vibrate([100, 50, 100]);
                break;
            case 'monsterConsume':
                this._playMonsterConsume(vol);
                this.vibrate([200, 100, 300]);
                break;
            case 'faceplant':
                this._playFaceplant(vol);
                this.vibrate([80, 40, 120]);
                break;
            case 'mapTransition':
                this._playMapTransition(vol);
                break;
            case 'elimination':
                this._playElimination(vol);
                this.vibrate([100, 50, 200]);
                break;
            case 'raceFinish':
                this._playRaceFinish(vol);
                this.vibrate([40, 20, 40, 20, 80]);
                break;
            case 'timerWarning':
                this._playTimerWarning(vol);
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

        var pitchShift = (this.correctCounter % 5) * 30;
        var baseFreq = 523 + pitchShift;
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

    _playCoinVariation(vol, lane) {
        var variation = Math.floor(Math.random() * 4);
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var g = ctx.createGain();

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

    // ===== NEW SOUND EFFECTS =====

    _playHeart(vol) {
        // Warm, comforting "life gained" sound — ascending warm tones
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(330, t);
        o.frequency.setValueAtTime(440, t + 0.08);
        o.frequency.setValueAtTime(550, t + 0.16);
        g.gain.setValueAtTime(vol * 0.14, t);
        g.gain.setValueAtTime(vol * 0.12, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); o.start(t); o.stop(t + 0.35);

        // Second layer: warm triangle
        var g2 = ctx.createGain();
        g2.connect(ctx.destination);
        var o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(660, t + 0.05);
        o2.frequency.setValueAtTime(880, t + 0.15);
        g2.gain.setValueAtTime(vol * 0.06, t + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o2.connect(g2); o2.start(t + 0.05); o2.stop(t + 0.35);
    }

    _playMonsterClose(vol) {
        // Deep rumble with increasing pitch — menacing
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(40, t);
        o.frequency.linearRampToValueAtTime(80, t + 0.4);

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        filter.Q.value = 5;

        g.gain.setValueAtTime(vol * 0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(filter); filter.connect(g);
        o.start(t); o.stop(t + 0.5);

        // Noise layer
        var bufSize = ctx.sampleRate * 0.3;
        var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        var noise = ctx.createBufferSource();
        noise.buffer = buf;
        var nFilter = ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.value = 150;
        var nGain = ctx.createGain();
        nGain.gain.setValueAtTime(vol * 0.06, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(ctx.destination);
        noise.start(t);
    }

    _playMonsterConsume(vol) {
        // Dramatic crash/crunch — descending distorted sweep
        var ctx = this.ctx;
        var t = ctx.currentTime;

        // Descending sweep
        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(400, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        g.gain.setValueAtTime(vol * 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

        var distortion = ctx.createWaveShaperNode();
        var curve = new Float32Array(256);
        for (var i = 0; i < 256; i++) {
            var x = (i / 128) - 1;
            curve[i] = (Math.PI + 10) * x / (Math.PI + 10 * Math.abs(x));
        }
        distortion.curve = curve;

        o.connect(distortion); distortion.connect(g);
        o.start(t); o.stop(t + 0.8);

        // Impact noise burst
        var bufSize = ctx.sampleRate * 0.15;
        var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var j = 0; j < bufSize; j++) data[j] = (Math.random() * 2 - 1);
        var noise = ctx.createBufferSource();
        noise.buffer = buf;
        var nGain = ctx.createGain();
        nGain.gain.setValueAtTime(vol * 0.15, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(nGain); nGain.connect(ctx.destination);
        noise.start(t);
    }

    _playFaceplant(vol) {
        // Comedic thud — low sine impact + noise
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(vol * 0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g); o.start(t); o.stop(t + 0.25);

        // Dust/slide noise
        var bufSize = ctx.sampleRate * 0.1;
        var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        var noise = ctx.createBufferSource();
        noise.buffer = buf;
        var nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.value = 800;
        nFilter.Q.value = 1;
        var nGain = ctx.createGain();
        nGain.gain.setValueAtTime(vol * 0.08, t + 0.05);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(ctx.destination);
        noise.start(t + 0.05);
    }

    _playMapTransition(vol) {
        // Whoosh/transition — ascending filtered sweep
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(1200, t + 0.5);

        var filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.exponentialRampToValueAtTime(2000, t + 0.5);
        filter.Q.value = 2;

        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * 0.1, t + 0.15);
        g.gain.linearRampToValueAtTime(0, t + 0.6);

        o.connect(filter); filter.connect(g);
        o.start(t); o.stop(t + 0.65);

        // Shimmer
        var g2 = ctx.createGain();
        g2.connect(ctx.destination);
        var o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(800, t + 0.1);
        o2.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
        g2.gain.setValueAtTime(vol * 0.04, t + 0.1);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o2.connect(g2); o2.start(t + 0.1); o2.stop(t + 0.6);
    }

    _playElimination(vol) {
        // Dramatic sting — descending minor chord hit
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var freqs = [330, 392, 466]; // E4, G4, Bb4 (diminished feel)

        for (var i = 0; i < freqs.length; i++) {
            var g = ctx.createGain();
            g.connect(ctx.destination);
            var o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freqs[i], t);
            o.frequency.exponentialRampToValueAtTime(freqs[i] * 0.5, t + 0.4);

            var filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(3000, t);
            filter.frequency.exponentialRampToValueAtTime(200, t + 0.4);

            g.gain.setValueAtTime(vol * 0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            o.connect(filter); filter.connect(g);
            o.start(t); o.stop(t + 0.5);
        }
    }

    _playRaceFinish(vol) {
        // Triumphant fanfare — ascending major arpeggio
        var ctx = this.ctx;
        var t = ctx.currentTime;
        var notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

        for (var i = 0; i < notes.length; i++) {
            var delay = i * 0.08;
            var g = ctx.createGain();
            g.connect(ctx.destination);
            var o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(notes[i], t + delay);
            g.gain.setValueAtTime(0, t + delay);
            g.gain.linearRampToValueAtTime(vol * 0.15, t + delay + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
            o.connect(g); o.start(t + delay); o.stop(t + delay + 0.45);
        }
    }

    _playTimerWarning(vol) {
        // Ticking sound — short high click
        var ctx = this.ctx;
        var t = ctx.currentTime;

        var g = ctx.createGain();
        g.connect(ctx.destination);
        var o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(1200, t);
        g.gain.setValueAtTime(vol * 0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        o.connect(g); o.start(t); o.stop(t + 0.04);
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

    // ===== BACKGROUND MUSIC (New Procedural System) =====

    startMusic() {
        if (this.musicPlaying) return;
        if (!this.ensureContext()) return;
        this.musicPlaying = true;

        // Create master music gain node
        if (!this.musicGain) {
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.getMusicVolume() * 0.8;
            this.musicGain.connect(this.ctx.destination);
        }

        // Start with a default skin music if no specific skin set
        if (!this.musicGenerator) {
            this.musicGenerator = new MusicGenerator(this.ctx, this.musicGain, 'Neural Highway');
        }
        this.musicGenerator.play();
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.musicGenerator) {
            this.musicGenerator.stop();
        }
        if (this.crossfadeGenerator) {
            this.crossfadeGenerator.stop();
            this.crossfadeGenerator.dispose();
            this.crossfadeGenerator = null;
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
            this.musicGain.gain.value = this.getMusicVolume() * 0.8;
        }
    }

    // ===== MAP TRANSITION CROSSFADE =====

    crossfadeMusic(newSkinName, duration) {
        if (!this.ensureContext() || !this.musicPlaying) return;
        if (!duration) duration = 3.0;

        if (!this.musicGain) {
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.getMusicVolume() * 0.8;
            this.musicGain.connect(this.ctx.destination);
        }

        // Fade out current generator
        if (this.musicGenerator) {
            this.musicGenerator.fadeOut(duration);
        }

        // Clean up any previous crossfade generator
        if (this.crossfadeGenerator) {
            this.crossfadeGenerator.stop();
            this.crossfadeGenerator.dispose();
        }

        // Create new generator and fade it in
        var newGen = new MusicGenerator(this.ctx, this.musicGain, newSkinName);
        newGen.fadeIn(duration);

        // After crossfade completes, swap references
        var self = this;
        setTimeout(function () {
            if (self.musicGenerator) {
                self.musicGenerator.dispose();
            }
            self.musicGenerator = newGen;
            self.crossfadeGenerator = null;
        }, (duration + 0.5) * 1000);

        this.crossfadeGenerator = newGen;
    }

    // ===== SPEED-REACTIVE PITCH =====

    updateSpeedPitch(baseSpeed, currentSpeed) {
        var ratio = currentSpeed / Math.max(baseSpeed, 0.01);
        this.speedPitchMultiplier = 1.0 + Math.min((ratio - 1) * 0.05, 0.15);

        // Update music tempo based on speed
        if (this.musicGenerator && ratio > 1.1) {
            this.musicGenerator.setTempoMultiplier(Math.min(ratio * 0.7 + 0.3, 1.3));
        }
    }

    // ===== AMBIENT ENVIRONMENTAL SOUNDS (replaces annoying drones) =====

    startAmbient(skinName) {
        this.stopAmbient();
        if (!this.ensureContext()) return;

        this.ambientPlaying = true;

        // Start music with the skin-specific style
        if (this.musicPlaying && this.musicGenerator) {
            // If music is already playing with a different skin, crossfade
            if (this.musicGenerator.skinName !== skinName) {
                this.crossfadeMusic(skinName, 1.5);
            }
        } else if (storage.get('musicOn')) {
            // Create new music generator for this skin
            if (!this.musicGain) {
                this.musicGain = this.ctx.createGain();
                this.musicGain.gain.value = this.getMusicVolume() * 0.8;
                this.musicGain.connect(this.ctx.destination);
            }
            if (this.musicGenerator) {
                this.musicGenerator.dispose();
            }
            this.musicGenerator = new MusicGenerator(this.ctx, this.musicGain, skinName);
            this.musicPlaying = true;
            this.musicGenerator.play();
        }

        // Subtle environmental sound effects (occasional beeps, blips)
        this._startEnvironmentalFX(skinName);
    }

    _startEnvironmentalFX(skinName) {
        var self = this;
        var vol = storage.get('masterVolume') * 0.02; // Very quiet

        // Hospital-themed skins get occasional monitor beeps
        var hospitalSkins = ['Neon ER', 'Surgical Theater', 'Cardiac Pulse'];
        var natureSkins = ['Cellular Matrix', 'DNA Helix Tunnel'];

        function scheduleBeep() {
            if (!self.ambientPlaying) return;
            var delay = 3000 + Math.random() * 8000;
            var timer = setTimeout(function () {
                if (!self.ambientPlaying || !self.ctx) return;
                var t = self.ctx.currentTime;
                var g = self.ctx.createGain();
                g.connect(self.ctx.destination);
                var o = self.ctx.createOscillator();
                o.type = 'sine';

                if (hospitalSkins.indexOf(skinName) >= 0) {
                    // Heart monitor beep
                    o.frequency.setValueAtTime(1000, t);
                    g.gain.setValueAtTime(vol, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                    o.connect(g); o.start(t); o.stop(t + 0.08);
                } else if (natureSkins.indexOf(skinName) >= 0) {
                    // Gentle bubble/blip
                    o.frequency.setValueAtTime(400 + Math.random() * 300, t);
                    o.frequency.exponentialRampToValueAtTime(200, t + 0.1);
                    g.gain.setValueAtTime(vol * 0.5, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    o.connect(g); o.start(t); o.stop(t + 0.15);
                } else {
                    // Generic subtle click
                    o.frequency.setValueAtTime(800 + Math.random() * 400, t);
                    g.gain.setValueAtTime(vol * 0.3, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
                    o.connect(g); o.start(t); o.stop(t + 0.05);
                }

                scheduleBeep();
            }, delay);
            self.ambientTimers.push(timer);
        }

        scheduleBeep();
    }

    stopAmbient() {
        // Clear environmental FX timers
        for (var i = 0; i < this.ambientTimers.length; i++) {
            clearTimeout(this.ambientTimers[i]);
        }
        this.ambientTimers = [];
        this.ambientPlaying = false;

        // Stop music when ambient stops (end of run)
        if (this.musicPlaying) {
            this.stopMusic();
        }
    }
}

export var audio = new AudioEngine();
