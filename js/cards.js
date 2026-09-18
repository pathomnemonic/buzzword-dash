// js/cards.js — Hub file for Buzzword Dash card database
// Integration Agent: Combines all 15 subject card files into unified exports

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

export const CARDS = [].concat(
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

/*
// ═══════════════════════════════════════════════════════════
// VALIDATION SCRIPT — Run in browser console to verify all cards
// ═══════════════════════════════════════════════════════════
// 
// To use: Open browser console and paste this function, then call validateCards()
//
function validateCards() {
  var errors = [];
  var ids = {};
  CARDS.forEach(function(c, i) {
    // Check duplicate IDs
    if (ids[c.id]) errors.push('Duplicate ID: ' + c.id);
    ids[c.id] = true;

    // Check required fields
    ['id','subj','bw','ans','d','tp','ww','exams','baseDifficulty',
     'questionType','source','tags','hx','yr','pearls'].forEach(function(f) {
      if (c[f] === undefined) errors.push(c.id + ' missing field: ' + f);
    });

    // Check buzzword length (max 10 words each)
    if (c.bw) c.bw.forEach(function(b) {
      if (b.split(/\s+/).length > 10) errors.push(c.id + ' buzzword too long: "' + b + '"');
    });

    // Check answer leak
    if (c.ans && c.bw) {
      var ansWords = c.ans.toLowerCase().split(/[\s\-\/\(\)]+/).filter(function(w) {
        return w.length > 4;
      });
      c.bw.forEach(function(b) {
        var bwLower = b.toLowerCase();
        ansWords.forEach(function(w) {
          if (bwLower.indexOf(w) >= 0) {
            var alsoInDistractor = c.d && c.d.some(function(d) {
              return d.toLowerCase().indexOf(w) >= 0;
            });
            if (!alsoInDistractor) {
              errors.push(c.id + ' ANSWER LEAK: "' + b + '" contains "' + w + '"');
            }
          }
        });
      });
    }

    // Check distractor count
    if (!c.d || c.d.length !== 2) errors.push(c.id + ' needs exactly 2 distractors');

    // Check ww keys match distractors
    if (c.d && c.ww) {
      c.d.forEach(function(dist) {
        if (!c.ww[dist]) errors.push(c.id + ' missing ww entry for distractor: "' + dist + '"');
      });
    }

    // Check new field types
    if (c.exams && !Array.isArray(c.exams)) errors.push(c.id + ' exams must be array');
    if (c.tags && !Array.isArray(c.tags)) errors.push(c.id + ' tags must be array');
    if (c.pearls && !Array.isArray(c.pearls)) errors.push(c.id + ' pearls must be array');
    if (c.baseDifficulty && (c.baseDifficulty < 1 || c.baseDifficulty > 3)) {
      errors.push(c.id + ' baseDifficulty must be 1-3');
    }
    if (c.yr && (c.yr < 1 || c.yr > 4)) {
      errors.push(c.id + ' yr must be 1-4');
    }
    if (c.hx !== undefined && typeof c.hx !== 'boolean') {
      errors.push(c.id + ' hx must be boolean');
    }
  });

  // Summary stats
  var subjCounts = {};
  var typeCounts = {};
  var hxCount = 0;
  CARDS.forEach(function(c) {
    subjCounts[c.subj] = (subjCounts[c.subj] || 0) + 1;
    typeCounts[c.questionType] = (typeCounts[c.questionType] || 0) + 1;
    if (c.hx) hxCount++;
  });

  console.log('══════════════════════════════════════');
  console.log('BUZZWORD DASH — Card Validation Report');
  console.log('══════════════════════════════════════');
  console.log('Total cards:', CARDS.length);
  console.log('Errors found:', errors.length);
  console.log('High-yield cards:', hxCount, '(' + Math.round(hxCount/CARDS.length*100) + '%)');
  console.log('');
  console.log('Cards by subject:');
  Object.keys(subjCounts).sort().forEach(function(s) {
    console.log('  ' + s + ': ' + subjCounts[s]);
  });
  console.log('');
  console.log('Cards by question type:');
  Object.keys(typeCounts).sort().forEach(function(t) {
    console.log('  ' + t + ': ' + typeCounts[t]);
  });
  console.log('');
  if (errors.length > 0) {
    console.warn('ERRORS:');
    errors.forEach(function(e) { console.warn('  ⚠ ' + e); });
  } else {
    console.log('✅ All cards passed validation!');
  }
  return errors;
}
validateCards();
*/
