/**
 * trails.js — Player trail effect system
 *
 * VISIBILITY OVERHAUL:
 * - Particle sizes increased ~2.5x
 * - Particle lifetimes extended to 0.8-1.2 seconds
 * - Base spawn rate increased
 * - Higher starting opacity
 */

import * as THREE from 'three';
import { storage } from '../storage.js';

var MAX_PARTICLES = 50;

var TRAIL_CONFIGS = {
  trail_none: null,
  trail_ekg: {
    color1: 0x00ff44,
    color2: 0x00aa22,
    size: 0.18,
    spread: 0.08,
    type: 'line'
  },
  trail_neural: {
    color1: 0xaa44ff,
    color2: 0x6622cc,
    size: 0.25,
    spread: 0.35,
    type: 'spark'
  },
  trail_blood: {
    color1: 0xff2222,
    color2: 0xaa0000,
    size: 0.22,
    spread: 0.2,
    type: 'sphere'
  },
  trail_dna: {
    color1: 0x4488ff,
    color2: 0xff4488,
    size: 0.14,
    spread: 0.3,
    type: 'helix'
  },
  trail_fire: {
    color1: 0xff8800,
    color2: 0xff2200,
    size: 0.28,
    spread: 0.25,
    type: 'sphere'
  },
  trail_rainbow: {
    color1: 0xff44ff,
    color2: 0x44ffff,
    size: 0.22,
    spread: 0.3,
    type: 'sphere'
  }
};

export class TrailSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.pool = [];
    this.time = 0;
    this.spawnTimer = 0;

    for (var i = 0; i < MAX_PARTICLES; i++) {
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.9
        })
      );
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh: mesh,
        life: 0,
        maxLife: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        active: false
      });
    }
  }

  getConfig() {
    var equipped = storage.get('equipped');
    var trailId = equipped.trail || 'trail_none';
    return TRAIL_CONFIGS[trailId] || null;
  }

  update(dt, playerX, playerY, playerZ, streak) {
    this.time += dt;
    var config = this.getConfig();

    if (!config) {
      for (var h = 0; h < this.pool.length; h++) {
        this.pool[h].mesh.visible = false;
        this.pool[h].active = false;
      }
      return;
    }

    var intensity = Math.min(2.5, 1.0 + streak * 0.06);
    var spawnRate = 0.02 / intensity;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = spawnRate;
      this.spawnParticle(config, playerX, playerY, playerZ, intensity);
    }

    for (var i = 0; i < this.pool.length; i++) {
      var p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      var lifeRatio = p.life / p.maxLife;
      p.mesh.material.opacity = lifeRatio * 0.85;

      var scale = lifeRatio * config.size * 12;
      p.mesh.scale.set(scale, scale, scale);

      if (config.type === 'helix') {
        var angle = this.time * 8 + i * 0.5;
        p.mesh.position.x += Math.sin(angle) * 0.03;
        p.mesh.position.y += Math.cos(angle) * 0.03;
      }
    }
  }

  spawnParticle(config, px, py, pz, intensity) {
    var p = null;
    for (var i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        p = this.pool[i];
        break;
      }
    }
    if (!p) return;

    p.active = true;
    p.mesh.visible = true;
    p.maxLife = 0.8 + Math.random() * 0.4;
    p.life = p.maxLife;

    var spread = config.spread * intensity;
    p.mesh.position.set(
      px + (Math.random() - 0.5) * spread,
      (py + 0.5) + (Math.random() - 0.5) * spread * 0.5,
      pz + 0.5 + Math.random() * 0.3
    );

    p.vx = (Math.random() - 0.5) * 1.5;
    p.vy = (Math.random() - 0.3) * 1.0;
    p.vz = 2.0 + Math.random() * 2.0;

    var t = Math.random();
    var c1 = new THREE.Color(config.color1);
    var c2 = new THREE.Color(config.color2);
    c1.lerp(c2, t);
    p.mesh.material.color.copy(c1);
    p.mesh.material.opacity = 0.9;

    var s = config.size * (0.8 + Math.random() * 0.4) * intensity * 12;
    p.mesh.scale.set(s, s, s);

    if (config.type === 'line') {
      p.mesh.scale.set(s * 0.3, s * 0.3, s * 2.5);
      p.vy = 0;
      p.vx = 0;
    }
  }

  dispose() {
    for (var i = 0; i < this.pool.length; i++) {
      this.scene.remove(this.pool[i].mesh);
      this.pool[i].mesh.geometry.dispose();
      this.pool[i].mesh.material.dispose();
    }
    this.pool = [];
  }
}
