/* Shared record checks. No storage access, coercion or medical recommendations. */
(function(root){
  'use strict';
  var owns = function(obj, key){ return Object.prototype.hasOwnProperty.call(obj, key); };
  function object(value){ return value!==null && typeof value==='object' && !Array.isArray(value); }
  function number(value, min, exclusive, max){
    return typeof value==='number' && Number.isFinite(value) && (exclusive ? value>min : value>=min) &&
      (max==null || value<=max);
  }
  function text(value){ return typeof value==='string'; }
  function nonblank(value){ return text(value) && value.trim().length>0; }
  function localDate(date){
    function pad(n){ return String(n).padStart(2, '0'); }
    return String(date.getFullYear()).padStart(4, '0')+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
  }
  function date(value){
    if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number), d = new Date(0);
    d.setUTCFullYear(parts[0], parts[1]-1, parts[2]);
    return d.getUTCFullYear()===parts[0] && d.getUTCMonth()===parts[1]-1 && d.getUTCDate()===parts[2];
  }
  function time(value){ return value==='' || (text(value) && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)); }
  function optional(obj, key, check){ return !owns(obj, key) || check(obj[key]); }
  function nullableNumber(value){ return value===null || number(value, 0); }
  function percent(value){ return value===null || (number(value, 0) && value<=100); }
  function oneOf(values){ return function(value){ return values.indexOf(value)!==-1; }; }
  var medication = oneOf(['mounjaro', 'wegovy']);
  var site = oneOf(['r-abd-u','c-abd-u','l-abd-u','r-abd-m','l-abd-m','r-abd-l','c-abd-l','l-abd-l','r-arm','l-arm','r-thigh','l-thigh']);
  function base(record){
    return object(record) && date(record.date) && optional(record, 'id', nonblank) && optional(record, 'time', time);
  }
  function weight(record){
    return base(record) && number(record.weightKg, 0, true) &&
      ['fatKg','muscleKg','visceralFat','waistCm','leanKg','score'].every(function(key){ return optional(record, key, nullableNumber); }) &&
      ['fatPercent','musclePercent'].every(function(key){ return optional(record, key, percent); }) &&
      optional(record, 'custom', function(list){ return Array.isArray(list) && list.every(function(item){
        return object(item) && nonblank(item.name) && typeof item.value==='number' && Number.isFinite(item.value);
      }); });
  }
  function injection(record){
    return base(record) && number(record.doseMg, 0, true) && site(record.site) && optional(record, 'medication', medication);
  }
  function meal(record){
    return base(record) && oneOf(['breakfast','lunch','dinner','snack'])(record.meal) && nonblank(record.name) &&
      number(record.kcal, 0, false, 5000) && ['protein','carbs','fat','fiber'].every(function(key){ return optional(record, key, function(value){ return number(value, 0); }); }) &&
      optional(record, 'portion', text) && optional(record, 'source', oneOf(['manual','photo','text']));
  }
  function purchase(record){
    return base(record) && medication(record.medication) && number(record.price, 0, true, 100000) && optional(record, 'place', text) &&
      Array.isArray(record.items) && record.items.length>0 && record.items.every(function(item){
        return object(item) && number(item.doseMg, 0, true) && Number.isSafeInteger(item.qty) && item.qty>0;
      });
  }
  function profile(value){
    return object(value) &&
      ['heightCm','startWeight','goalWeight','intervalDays'].every(function(key){ return optional(value, key, function(n){ return number(n, 0, true); }); }) &&
      optional(value, 'totalSpend', function(n){ return number(n, 0); }) &&
      optional(value, 'kcalTarget', function(n){ return number(n, 800) && n<=5000; }) &&
      optional(value, 'gender', oneOf(['female','male','other'])) && optional(value, 'medication', text) &&
      optional(value, 'lang', oneOf(['zh','en'])) && optional(value, 'startDate', date) &&
      ['remindersOn','seeded'].every(function(key){ return optional(value, key, function(v){ return typeof v==='boolean'; }); }) &&
      ['fatUnit','muscleUnit'].every(function(key){ return optional(value, key, oneOf(['kg','pct'])); });
  }
  function list(records, check){
    if (!Array.isArray(records)) return false;
    var ids = new Set();
    return records.every(function(record){
      if (!check(record)) return false;
      if (!owns(record, 'id')) return true;
      if (ids.has(record.id)) return false;
      ids.add(record.id); return true;
    });
  }
  // JSON metadata is retained, but prototype-changing keys must never reach Object.assign.
  function safeKeys(value){
    if (!value || typeof value!=='object') return true;
    return Object.keys(value).every(function(key){
      return key!=='__proto__' && key!=='constructor' && key!=='prototype' && safeKeys(value[key]);
    });
  }
  function backup(value){
    return object(value) && safeKeys(value) && optional(value, 'app', function(v){ return v==='zhenyaozhi'; }) &&
      optional(value, 'version', function(v){ return v===1; }) && optional(value, 'exportedAt', function(v){ return text(v) && Number.isFinite(Date.parse(v)); }) &&
      optional(value, 'profile', profile) && list(value.weights, weight) && list(value.injections, injection) &&
      optional(value, 'meals', function(v){ return list(v, meal); }) && optional(value, 'purchases', function(v){ return list(v, purchase); });
  }
  var api = {isBackup:backup, isProfile:profile, isWeight:weight, isInjection:injection, isMeal:meal, isPurchase:purchase, isDate:date, localDate:localDate};
  if (typeof module==='object' && module.exports) module.exports = api;
  else root.ZY_RECORDS = api;
})(typeof window!=='undefined' ? window : globalThis);
