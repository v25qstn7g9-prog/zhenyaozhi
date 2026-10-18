'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const data = require('../src/records.js');
function valid() {
  return { app: 'zhenyaozhi', version: 1, profile: { gender: 'female', heightCm: 160, startWeight: 90, goalWeight: 65, medication: '司美格魯肽', intervalDays: 7, totalSpend: 0, remindersOn: false, seeded: false, startDate: '2026-09-01', lang: 'zh', fatUnit: 'kg', muscleUnit: 'pct', kcalTarget: 1500 }, weights: [{ id: 'w', date: '2026-10-18', time: '08:30', weightKg: 80, fatKg: 20, fatPercent: 25, muscleKg: 24, musclePercent: 30, leanKg: 60, waistCm: 88, visceralFat: 5, score: 75, custom: [{ name: 'Change', value: -1 }] }], injections: [{ id: 's', date: '2026-10-18', time: '09:00', medication: 'wegovy', doseMg: 0.25, site: 'r-abd-u' }], meals: [{ id: 'm', date: '2026-10-18', meal: 'lunch', name: 'Meal', portion: '1 serving', kcal: 500, protein: 30, carbs: 50, fat: 20, fiber: 6, source: 'manual' }], purchases: [{ id: 'p', date: '2026-10-18', medication: 'wegovy', items: [{ doseMg: 0.25, qty: 2 }], price: 6000, place: 'Store' }] };
}
test('valid current backups preserve all optional measurements without mutating the input', () => {
  const input = valid(), copy = JSON.stringify(input); assert.equal(data.isBackup(input), true); assert.equal(JSON.stringify(input), copy);
});
test('legacy backups accept absent profile, IDs, times and new arrays', () => {
  assert.equal(data.isBackup({ weights: [{ date: '2026-09-01', weightKg: 88, fatKg: null, muscleKg: null }], injections: [{ date: '2026-09-01', doseMg: 0.25, site: 'l-thigh' }] }), true);
  assert.equal(data.isBackup({ profile: {}, weights: [], injections: [] }), true);
});
const invalid = {
  'null record': d => { d.weights[0] = null; },
  'missing date': d => { delete d.weights[0].date; },
  'null date': d => { d.weights[0].date = null; },
  'impossible date': d => { d.weights[0].date = '2026-02-30'; },
  'non-leap date': d => { d.weights[0].date = '2025-02-29'; },
  'bad date shape': d => { d.weights[0].date = '2026-1-1'; },
  'bad time': d => { d.weights[0].time = '24:00'; },
  'string number': d => { d.weights[0].weightKg = '80'; },
  'missing weight': d => { delete d.weights[0].weightKg; },
  'zero weight': d => { d.weights[0].weightKg = 0; },
  'infinite weight': d => { d.weights[0].weightKg = Infinity; },
  'NaN weight': d => { d.weights[0].weightKg = NaN; },
  'negative optional measurement': d => { d.weights[0].fatKg = -1; },
  'percent beyond 100': d => { d.weights[0].fatPercent = 101; },
  'custom invalid name': d => { d.weights[0].custom[0].name = ''; },
  'custom invalid number': d => { d.weights[0].custom[0].value = Infinity; },
  'duplicate IDs': d => { d.weights.push({ ...d.weights[0] }); },
  'invalid ID type': d => { d.weights[0].id = {}; },
  'invalid dose': d => { d.injections[0].doseMg = 0; },
  'invalid site': d => { d.injections[0].site = 'unknown'; },
  'invalid medicine': d => { d.injections[0].medication = 'unknown'; },
  'invalid meal group': d => { d.meals[0].meal = 'unknown'; },
  'blank meal name': d => { d.meals[0].name = ' '; },
  'negative energy': d => { d.meals[0].kcal = -1; },
  'negative protein': d => { d.meals[0].protein = -1; },
  'non-finite nutrients': d => { d.meals[0].fiber = Infinity; },
  'empty purchase items': d => { d.purchases[0].items = []; },
  'fractional quantity': d => { d.purchases[0].items[0].qty = 0.5; },
  'zero quantity': d => { d.purchases[0].items[0].qty = 0; },
  'negative price': d => { d.purchases[0].price = -1; },
  'invalid profile type': d => { d.profile = []; },
  'profile HTML in number': d => { d.profile.heightCm = '" onfocus="alert(1)'; },
  'negative profile weight': d => { d.profile.startWeight = -1; },
  'invalid profile interval': d => { d.profile.intervalDays = 0; },
  'invalid profile language': d => { d.profile.lang = 'unknown'; },
  'invalid start date': d => { d.profile.startDate = '2026-02-30'; },
  'invalid boolean': d => { d.profile.seeded = 'false'; },
  'invalid unit': d => { d.profile.fatUnit = 'lb'; },
  'invalid array type': d => { d.meals = {}; },
  'unsupported version': d => { d.version = 2; },
  'prototype key': d => { d.profile = JSON.parse('{"__proto__":{"heightCm":1}}'); }
};
for (const [name, mutate] of Object.entries(invalid)) test('rejects ' + name, () => { const input = valid(); mutate(input); assert.equal(data.isBackup(input), false); });
test('leap days and optional empty time remain compatible', () => { const input = valid(); input.weights[0].date = '2024-02-29'; input.weights[0].time = ''; assert.equal(data.isBackup(input), true); });
test('IDs containing markup are accepted as text for the rendering boundary to escape', () => { const input = valid(); input.weights[0].id = '"><img onerror="alert(1)">'; assert.equal(data.isBackup(input), true); });
test('local calendar dates use the supplied date local components', () => {
  const date = new Date(2026, 9, 19, 0, 30); assert.equal(data.localDate(date), '2026-10-19');
});
