/**
 * themes.js — Specialty theme color configs
 */

export const THEMES = {
  "Neurology": {
    bg: 0x0a0828, ground: 0x0c0a30, wall: 0x2020aa,
    glow: 0x8844ff, gate: 0x1a1060, accent: 0xaa66ff
  },
  "Cardiology": {
    bg: 0x1a0808, ground: 0x200a0a, wall: 0xaa2020,
    glow: 0xff4444, gate: 0x601020, accent: 0xff6666
  },
  "Nephrology": {
    bg: 0x081820, ground: 0x0a1828, wall: 0x2080aa,
    glow: 0x44ccff, gate: 0x103050, accent: 0x66eeff
  },
  "Psychiatry": {
    bg: 0x140828, ground: 0x180a30, wall: 0x8830aa,
    glow: 0xcc66ff, gate: 0x401060, accent: 0xdd88ff
  },
  "Gastroenterology": {
    bg: 0x181008, ground: 0x201410, wall: 0xaa6620,
    glow: 0xffaa44, gate: 0x604020, accent: 0xffcc66
  },
  "Pulmonology": {
    bg: 0x081018, ground: 0x0a1420, wall: 0x2060aa,
    glow: 0x44aaff, gate: 0x103060, accent: 0x66ccff
  },
  "Infectious Disease": {
    bg: 0x081808, ground: 0x0a200a, wall: 0x20aa40,
    glow: 0x44ff66, gate: 0x104020, accent: 0x66ff88
  },
  "Endocrinology": {
    bg: 0x181808, ground: 0x201e0a, wall: 0xaaaa20,
    glow: 0xffff44, gate: 0x605020, accent: 0xffff88
  },
  "Hematology/Oncology": {
    bg: 0x180810, ground: 0x200a14, wall: 0xaa2060,
    glow: 0xff44aa, gate: 0x601040, accent: 0xff66cc
  },
  "Rheumatology": {
    bg: 0x100818, ground: 0x140a20, wall: 0x6020aa,
    glow: 0x9944ff, gate: 0x401060, accent: 0xbb66ff
  },
  "Obstetrics/Gynecology": {
    bg: 0x180814, ground: 0x200a18, wall: 0xaa2080,
    glow: 0xff44cc, gate: 0x601050, accent: 0xff88dd
  },
  "Pediatrics": {
    bg: 0x081018, ground: 0x101828, wall: 0x4060aa,
    glow: 0x66aaff, gate: 0x204060, accent: 0x88ccff
  },
  "Surgery": {
    bg: 0x0a0a10, ground: 0x101018, wall: 0x606080,
    glow: 0xaaaacc, gate: 0x303050, accent: 0xccccee
  },
  "Emergency Medicine": {
    bg: 0x181008, ground: 0x201408, wall: 0xaa4420,
    glow: 0xff6644, gate: 0x603020, accent: 0xff8866
  },
  "default": {
    bg: 0x050816, ground: 0x0a1030, wall: 0x1a3060,
    glow: 0x18ffff, gate: 0x102040, accent: 0x44ddff
  }
};

export function getTheme(selectedSubjects) {
  for (const s of selectedSubjects) {
    if (THEMES[s]) return THEMES[s];
  }
  return THEMES["default"];
}
