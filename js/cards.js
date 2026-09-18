// js/cards.js — Hub file for Buzzword Dash card database
// Auto-validates and filters cards at import time. Zero manual steps required.

import { NEUROLOGY_CARDS } from './cards/neurology.js';
import { CARDIOLOGY_CARDS } from './cards/cardiology.js';
import { NEPHROLOGY_CARDS } from './cards/nephrology.js';
import { PSYCHIATRY_CARDS } from './cards/psychiatry.js';
import { GASTRO_CARDS } from './cards/gastroenterology.js';
import { PULM_CARDS } from './cards/pulmonology.js';
import { ID_CARDS } from './cards/infectious.js';
import { ENDO_CARDS } from './cards/endocrinology.js';
import { HEMEONC_CARDS } from './cards/hemeonc.js';
import { RHEUM_CARDS } from './cards/rheumatology.js';
import { OBGYN_CARDS } from './cards/obgyn.js';
import { PEDS_CARDS } from './cards/pediatrics.js';
import { SURGERY_CARDS } from './cards/surgery.js';
import { EM_CARDS } from './cards/emergency.js';
import { MULTI_CARDS } from './cards/multisystem.js';

export const SUBJECTS = [
  "Neurology", "Cardiology", "Nephrology", "Psychiatry",
  "Gastroenterology", "Pulmonology", "Infectious Disease",
  "Endocrinology", "Hematology/Oncology", "Rheumatology",
  "Obstetrics/Gynecology", "Pediatrics", "Surgery",
  "Emergency Medicine", "Multisystem / Mixed"
];

export const EXAM_FILTERS = [
  "step1", "step2", "step3", "comlex1", "comlex2",
  "shelf_im", "shelf_surg", "shelf_peds", "shelf_obgyn",
  "shelf_psych", "shelf_neuro", "shelf_fm"
];

export const QUESTION_TYPES = [
  "buzzword_dx", "dx_to_tx", "dx_to_workup", "mechanism",
  "side_effect", "lab_dx", "pharm", "prevention", "management"
];

export const SOURCE_DISCIPLINES = [
  "pathology", "pharmacology", "physiology", "biochemistry",
  "microbiology", "anatomy", "embryology", "behavioral",
  "biostatistics", "clinical_medicine", "surgery_principles",
  "genetics", "immunology", "ethics"
];

// ═══════════════════════════════════════════════════════════
// AUTOMATIC CARD CLEANING — runs once at import time
// ═══════════════════════════════════════════════════════════

function cleanCards(rawCards) {
  const cleaned = [];
  const dropped = [];
  const warnings = [];
  const seenIds = {};

  for (const c of rawCards) {

    // ── 1. Skip cards missing essential fields ──
    if (!c || !c.id || !c.bw || !c.ans) {
      dropped.push({ id: c?.id || '??', reason: 'missing id, bw, or ans' });
      continue;
    }

    // ── 2. Skip duplicate IDs (keep first occurrence) ──
    if (seenIds[c.id]) {
      dropped.push({ id: c.id, reason: 'duplicate ID (already seen)' });
      continue;
    }
    seenIds[c.id] = true;

    // ── 3. Skip cards without exactly 2 distractors ──
    if (!c.d || c.d.length !== 2) {
      dropped.push({ id: c.id, reason: `needs exactly 2 distractors, has ${c.d ? c.d.length : 0}` });
      continue;
    }

    // ── 4. Patch missing new fields with safe defaults ──
    if (c.exams === undefined) {
      c.exams = ["step1", "step2"];
      warnings.push(`${c.id}: added default exams`);
    }
    if (c.baseDifficulty === undefined) {
      c.baseDifficulty = 2;
      warnings.push(`${c.id}: added default baseDifficulty`);
    }
    if (c.questionType === undefined) {
      c.questionType = "buzzword_dx";
      warnings.push(`${c.id}: added default questionType`);
    }
    if (c.source === undefined) {
      c.source = "clinical_medicine";
      warnings.push(`${c.id}: added default source`);
    }
    if (c.tags === undefined) {
      c.tags = c.subj ? [c.subj.toLowerCase()] : [];
      warnings.push(`${c.id}: added default tags`);
    }
    if (c.hx === undefined) {
      c.hx = false;
      warnings.push(`${c.id}: added default hx`);
    }
    if (c.yr === undefined) {
      c.yr = 2;
      warnings.push(`${c.id}: added default yr`);
    }
    if (c.pearls === undefined) {
      c.pearls = c.tp ? [c.tp.split('.')[0]] : [];
      warnings.push(`${c.id}: added default pearl from teaching point`);
    }

    // ── 5. Fix ww keys that don't match distractors ──
    if (c.ww) {
      const wwKeys = Object.keys(c.ww);
      const newWw = {};
      let wwFixed = false;
      c.d.forEach((dist, idx) => {
        if (c.ww[dist]) {
          newWw[dist] = c.ww[dist];
        } else if (wwKeys[idx]) {
          newWw[dist] = c.ww[wwKeys[idx]];
          wwFixed = true;
        } else {
          newWw[dist] = "See teaching point for comparison.";
          wwFixed = true;
        }
      });
      if (wwFixed) {
        warnings.push(`${c.id}: remapped ww keys to match distractors`);
      }
      c.ww = newWw;
    }

    // ── 6. Trim buzzwords that are too long (>10 words) ──
    //    Split them into shorter chunks rather than dropping the card
    c.bw = c.bw.flatMap(b => {
      const words = b.split(/\s+/);
      if (words.length > 10) {
        warnings.push(`${c.id}: split long buzzword "${b.substring(0, 40)}..."`);
        const chunks = [];
        for (let j = 0; j < words.length; j += 7) {
          chunks.push(words.slice(j, j + 7).join(' '));
        }
        return chunks;
      }
      return [b];
    });

    // ── 7. Answer-leak filtering ──
    // Get significant words from the answer (longer than 4 characters)
    const ansWords = c.ans
      .toLowerCase()
      .split(/[\s\-\/\(\)]+/)
      .filter(w => w.length > 4);

    // Get significant words from each distractor
    const distractorWords = new Set();
    for (const dist of c.d) {
      dist.toLowerCase().split(/[\s\-\/\(\)]+/).forEach(w => {
        if (w.length > 4) distractorWords.add(w);
      });
    }

    // Filter buzzwords: remove any that leak the answer
    let leaksFound = 0;
    const safeBuzzwords = c.bw.filter(bw => {
      const bwLower = bw.toLowerCase();
      for (const w of ansWords) {
        // It's a leak ONLY if the word appears in the buzzword
        // AND does NOT also appear in a distractor
        // (if it's in a distractor too, it doesn't uniquely point to the answer)
        if (bwLower.includes(w) && !distractorWords.has(w)) {
          leaksFound++;
          return false; // remove this buzzword
        }
      }
      return true; // keep this buzzword
    });

    // Drop the entire card if fewer than 2 buzzwords survive
    if (safeBuzzwords.length < 2) {
      dropped.push({
        id: c.id,
        reason: `only ${safeBuzzwords.length} buzzword(s) left after removing ${leaksFound} leak(s)`
      });
      continue;
    }

    // Use the cleaned buzzwords
    if (leaksFound > 0) {
      warnings.push(`${c.id}: removed ${leaksFound} leaking buzzword(s), ${safeBuzzwords.length} remain`);
    }
    c.bw = safeBuzzwords;

    cleaned.push(c);
  }

  // ── Console output ──
  // Always log the summary
  console.log(
    `[Buzzword Dash] ${cleaned.length} cards loaded, ${dropped.length} dropped, ${warnings.length} auto-fixes applied`
  );

  // Log dropped cards so you know what was filtered
  if (dropped.length > 0) {
    console.warn(`[Buzzword Dash] Dropped ${dropped.length} card(s):`);
    for (const d of dropped) {
      console.warn(`  ✖ ${d.id}: ${d.reason}`);
    }
  }

  // Log auto-fixes at debug level (collapsed group so it doesn't flood the console)
  if (warnings.length > 0) {
    console.groupCollapsed(`[Buzzword Dash] ${warnings.length} auto-fix(es) applied (click to expand)`);
    for (const w of warnings) {
      console.log(`  🔧 ${w}`);
    }
    console.groupEnd();
  }

  return cleaned;
}

// ═══════════════════════════════════════════════════════════
// Combine all raw cards, then clean them once
// ═══════════════════════════════════════════════════════════

const RAW_CARDS = [].concat(
  NEUROLOGY_CARDS,
  CARDIOLOGY_CARDS,
  NEPHROLOGY_CARDS,
  PSYCHIATRY_CARDS,
  GASTRO_CARDS,
  PULM_CARDS,
  ID_CARDS,
  ENDO_CARDS,
  HEMEONC_CARDS,
  RHEUM_CARDS,
  OBGYN_CARDS,
  PEDS_CARDS,
  SURGERY_CARDS,
  EM_CARDS,
  MULTI_CARDS
);

export const CARDS = cleanCards(RAW_CARDS);
