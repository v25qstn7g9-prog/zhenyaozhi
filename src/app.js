(function(){
  "use strict";

  /* ---------- constants ---------- */
  var SITES = [
    {id:'r-abd-l', x:48, y:72},
    {id:'l-arm',   x:100,y:34},
    {id:'r-arm',   x:26, y:34},
    {id:'l-abd-u', x:78, y:56},
    {id:'r-abd-u', x:48, y:56},
    {id:'l-abd-l', x:78, y:72},
    {id:'l-thigh', x:82, y:108},
    {id:'r-thigh', x:44, y:108}
  ];
  var SITE_LABELS = {
    zh:{'l-arm':'左上臂','r-arm':'右上臂','l-abd-u':'左上腹','r-abd-u':'右上腹','l-abd-l':'左下腹','r-abd-l':'右下腹','l-thigh':'左大腿','r-thigh':'右大腿'},
    en:{'l-arm':'Left upper arm','r-arm':'Right upper arm','l-abd-u':'Left upper abdomen','r-abd-u':'Right upper abdomen','l-abd-l':'Left lower abdomen','r-abd-l':'Right lower abdomen','l-thigh':'Left thigh','r-thigh':'Right thigh'}
  };
  var DOW = { zh:['日','一','二','三','四','五','六'], en:['S','M','T','W','T','F','S'] };
  var MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var todayISO = new Date().toISOString().slice(0,10);

  /* ---------- i18n ---------- */
  var LANG = 'zh';
  var T = window.ZY_T;
  function L(key, vars){
    var s = (T[LANG] && T[LANG][key]!=null) ? T[LANG][key] : T.zh[key];
    if (s==null) return key;
    if (vars){ Object.keys(vars).forEach(function(k){ s = s.split('{'+k+'}').join(vars[k]); }); }
    return s;
  }
  function siteLabel(id){
    return (SITE_LABELS[LANG] && SITE_LABELS[LANG][id]) || SITE_LABELS.zh[id] || id;
  }
  function monthLabel(y, m){
    return LANG==='en' ? (MONTHS_EN[m] + ' ' + y) : (y + ' 年 ' + (m+1) + ' 月');
  }

  /* ---------- tiny state / persistence (per-device localStorage) ---------- */
  var mem = {
    profile: null,
    weights: [],
    injections: []
  };
  var LS_KEY = 'zhenyaozhi.records.v1';
  var persistMode = 'memory'; // 'local' | 'memory'
  var downloadsCap = null;
  var sampleCap = null;
  var sampleImgLimits = null;

  function uuid(){ return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  function defaultProfile(){
    return {
      gender:'female', heightCm:160, startWeight:90, goalWeight:65,
      medication:'司美格魯肽', intervalDays:7, totalSpend:0,
      remindersOn:false, seeded:true, startDate: todayISO, lang:'zh'
    };
  }

  function seedDemoData(){
    var out = {weights:[], injections:[]};
    var start = new Date(); start.setDate(start.getDate()-56);
    var w = 90;
    for (var i=0;i<8;i++){
      var d = new Date(start); d.setDate(d.getDate() + i*7);
      w = +(w - (1.1 + Math.random()*0.9)).toFixed(1);
      out.weights.push({id:uuid(), date:d.toISOString().slice(0,10), weightKg:w, fatKg:null, muscleKg:null});
      out.injections.push({id:uuid(), date:d.toISOString().slice(0,10), doseMg: i<3?0.25:(i<6?0.5:1.0), site:SITES[i%SITES.length].id});
    }
    return out;
  }

  function readLocalStorage(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && obj.profile && Array.isArray(obj.weights) && Array.isArray(obj.injections)) return obj;
    }catch(e){}
    return null;
  }
  function writeLocalStorage(){
    if (persistMode!=='local') return false;
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({profile:mem.profile, weights:mem.weights, injections:mem.injections}));
      return true;
    }catch(e){ return false; }
  }

  async function initPersistence(){
    try{
      var probe = '__zy_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      persistMode = 'local';
    }catch(e){ persistMode = 'memory'; }

    var saved = persistMode==='local' ? readLocalStorage() : null;
    if (saved){
      mem.profile = Object.assign(defaultProfile(), saved.profile, {seeded:false});
      mem.weights = saved.weights;
      mem.injections = saved.injections;
    } else {
      var seed = seedDemoData();
      mem.profile = defaultProfile();
      mem.weights = seed.weights;
      mem.injections = seed.injections;
      writeLocalStorage();
    }
    sortData();

    try{
      if (window.claude && window.claude.use) downloadsCap = await window.claude.use('downloads');
    }catch(e){ downloadsCap = null; }

    try{
      if (window.claude && window.claude.use) sampleCap = await window.claude.use('sample');
      if (sampleCap) sampleImgLimits = await sampleCap.limits().catch(function(){ return null; });
    }catch(e){ sampleCap = null; sampleImgLimits = null; }
  }

  function sortData(){
    mem.weights.sort(function(a,b){ return a.date.localeCompare(b.date); });
    mem.injections.sort(function(a,b){ return a.date.localeCompare(b.date); });
  }

  async function saveProfile(patch){
    mem.profile = Object.assign({}, mem.profile, patch);
    writeLocalStorage();
  }
  async function addWeight(rec){
    rec.id = uuid();
    mem.weights.push(rec); sortData();
    writeLocalStorage();
  }
  async function deleteWeight(id){
    mem.weights = mem.weights.filter(function(r){ return r.id!==id; });
    writeLocalStorage();
  }
  async function addInjection(rec){
    rec.id = uuid();
    mem.injections.push(rec); sortData();
    writeLocalStorage();
  }
  async function deleteInjection(id){
    mem.injections = mem.injections.filter(function(r){ return r.id!==id; });
    writeLocalStorage();
  }
  async function clearAllData(){
    mem.weights = []; mem.injections = [];
    writeLocalStorage();
  }
  async function restoreFromBackup(obj){
    mem.profile = Object.assign(defaultProfile(), mem.profile, obj.profile||{}, {seeded:false});
    mem.weights = obj.weights.map(function(w){ return Object.assign({}, w, {id:w.id||uuid()}); });
    mem.injections = obj.injections.map(function(r){ return Object.assign({}, r, {id:r.id||uuid()}); });
    sortData();
    writeLocalStorage();
  }

  /* ---------- backup / restore (export file or text, re-import) ---------- */
  function buildBackupObject(){
    return {app:'zhenyaozhi', version:1, exportedAt:new Date().toISOString(),
      profile:mem.profile, weights:mem.weights, injections:mem.injections};
  }
  function backupJSONText(){ return JSON.stringify(buildBackupObject(), null, 2); }
  function parseBackupText(text){
    try{
      var obj = JSON.parse(text);
      if (obj && typeof obj==='object' && Array.isArray(obj.weights) && Array.isArray(obj.injections)) return obj;
    }catch(e){}
    return null;
  }
  async function exportBackupFile(){
    var text = backupJSONText();
    if (downloadsCap){
      try{
        await downloadsCap.save({filename:'針藥誌備份_'+todayISO+'.json', data:text});
        return {ok:true, mode:'file'};
      }catch(e){ /* fall through to clipboard */ }
    }
    var copied = await copyToClipboard(text);
    return {ok:copied, mode:'clipboard'};
  }
  function confirmInline(msgEl, message, confirmLabel, onConfirm){
    msgEl.innerHTML = esc(message) + ' <button class="btn small danger" id="__confirmBtn" type="button">'+esc(confirmLabel)+'</button>';
    msgEl.style.color = 'var(--warn)';
    document.getElementById('__confirmBtn').onclick = function(){ msgEl.textContent=''; onConfirm(); };
  }

  /* ---------- InBody CSV / Excel bulk import ---------- */
  function normalizeHeader(h){
    return String(h==null?'':h).toLowerCase().replace(/[\s_\-()]/g,'');
  }
  function pickColumn(headers, patterns, exclude){
    for (var i=0;i<headers.length;i++){
      var nh = normalizeHeader(headers[i]);
      if (exclude && exclude.some(function(x){ return nh.indexOf(x)!==-1; })) continue;
      for (var j=0;j<patterns.length;j++){ if (nh.indexOf(patterns[j])!==-1) return i; }
    }
    return -1;
  }
  function pad2(n){ n = String(n); return n.length<2 ? '0'+n : n; }
  function toISODateAny(v){
    if (v==null || v==='') return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v.getFullYear()+'-'+pad2(v.getMonth()+1)+'-'+pad2(v.getDate());
    var s = String(v).trim();
    // compact YYYYMMDD or YYYYMMDDHHMMSS (InBody's own native export format)
    var cm = s.match(/^(\d{4})(\d{2})(\d{2})(\d{6})?$/);
    if (cm){
      var yy=+cm[1], mo=+cm[2], da=+cm[3];
      if (yy>=1900 && yy<=2100 && mo>=1 && mo<=12 && da>=1 && da<=31) return cm[1]+'-'+pad2(mo)+'-'+pad2(da);
    }
    if (typeof v === 'number' && isFinite(v) && v>0 && v<100000){
      try{
        var dc = window.XLSX && XLSX.SSF && XLSX.SSF.parse_date_code(v);
        if (dc && dc.y) return dc.y+'-'+pad2(dc.m)+'-'+pad2(dc.d);
      }catch(e){}
    }
    var m = s.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (m) return m[1]+'-'+pad2(m[2])+'-'+pad2(m[3]);
    m = s.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
    if (m) return m[3]+'-'+pad2(m[1])+'-'+pad2(m[2]);
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
    return null;
  }
  function toNum(v){
    if (v==null || v==='') return null;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g,''));
    return isNaN(n) ? null : n;
  }

  function parseInBodyFile(file){
    return new Promise(function(resolve, reject){
      var isCsv = /\.csv$/i.test(file.name);
      var reader = new FileReader();
      reader.onerror = function(){ reject(new Error('read_failed')); };
      reader.onload = function(){
        try{
          var wb = isCsv ?
            XLSX.read(String(reader.result), {type:'string'}) :
            XLSX.read(reader.result, {type:'array', cellDates:true});
          var sheet = wb.Sheets[wb.SheetNames[0]];
          var grid = XLSX.utils.sheet_to_json(sheet, {header:1, raw:true, defval:null});
          if (!grid.length){ resolve({rows:[], unmatched:true}); return; }
          var headers = grid[0].map(function(h){ return h==null?'':String(h); });
          var idx = {
            date: pickColumn(headers, ['testdate','date','時間','日期','測試日期','檢測日期','量測日期']),
            weight: pickColumn(headers, ['weight(kg)','weight','體重']),
            fatPercent: pickColumn(headers, ['pbf','bodyfatpercentage','bodyfat%','體脂率','脂肪率','體脂百分比']),
            fatKg: pickColumn(headers, ['bfm','fatmass','bodyfatmass','體脂肪','體脂重']),
            muscleKg: pickColumn(headers, ['smm','skeletalmuscle','骨骼肌','肌肉量']),
            visceralFat: pickColumn(headers, ['內臟脂肪等級','visceralfatlevel','vfl','內臟脂肪'], ['面積','area','cm2','cm²']),
            score: pickColumn(headers, ['inbodyscore','score','inbody分數','inbody評分','評分'])
          };
          if (idx.date===-1 || idx.weight===-1){ resolve({rows:[], unmatched:true}); return; }
          var rows = [];
          for (var r=1; r<grid.length; r++){
            var row = grid[r];
            if (!row) continue;
            var date = toISODateAny(row[idx.date]);
            var weightKg = toNum(row[idx.weight]);
            if (!date || weightKg==null) continue;
            rows.push({
              date: date,
              weightKg: weightKg,
              fatPercent: idx.fatPercent>-1 ? toNum(row[idx.fatPercent]) : null,
              fatKg: idx.fatKg>-1 ? toNum(row[idx.fatKg]) : null,
              muscleKg: idx.muscleKg>-1 ? toNum(row[idx.muscleKg]) : null,
              visceralFat: idx.visceralFat>-1 ? toNum(row[idx.visceralFat]) : null,
              score: idx.score>-1 ? toNum(row[idx.score]) : null
            });
          }
          resolve({rows:rows, unmatched:false});
        }catch(e){ reject(e); }
      };
      if (isCsv) reader.readAsText(file, 'utf-8'); else reader.readAsArrayBuffer(file);
    });
  }

  async function importInBodyRows(rows){
    rows.forEach(function(rec){
      var existing = mem.weights.find(function(w){ return w.date===rec.date; });
      if (existing){
        existing.weightKg = rec.weightKg;
        if (rec.fatPercent!=null) existing.fatPercent = rec.fatPercent;
        if (rec.fatKg!=null) existing.fatKg = rec.fatKg;
        if (rec.muscleKg!=null) existing.muscleKg = rec.muscleKg;
        if (rec.visceralFat!=null) existing.visceralFat = rec.visceralFat;
        if (rec.score!=null) existing.score = rec.score;
      } else {
        rec.id = uuid();
        mem.weights.push(rec);
      }
    });
    sortData();
    writeLocalStorage();
  }

  /* ---------- helpers ---------- */
  function fmtKg(n){ return (Math.round(n*10)/10).toFixed(1); }
  // Doses need two decimals (0.25 mg must not show as 0.3); trailing zeros dropped.
  function fmtDose(n){ return String(Math.round(n*1000)/1000); }
  function fmtMD(iso){ var p=iso.split('-'); return p[1]+'/'+p[2]; }
  function fmtYMD(iso){ var p=iso.split('-'); return p[0]+'年'+(+p[1])+'月'+(+p[2])+'日'; }
  function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function latestWeight(){
    return mem.weights.length ? mem.weights[mem.weights.length-1] : null;
  }
  function latestInjection(){
    return mem.injections.length ? mem.injections[mem.injections.length-1] : null;
  }
  function currentBMI(){
    var lw = latestWeight();
    var kg = lw ? lw.weightKg : mem.profile.startWeight;
    var h = mem.profile.heightCm/100;
    if (!h) return null;
    return kg / (h*h);
  }
  function nextInjectionDate(){
    var li = latestInjection();
    var base = li ? li.date : mem.profile.startDate;
    var d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + (mem.profile.intervalDays||7));
    return d.toISOString().slice(0,10);
  }
  function recentSites(n){
    var arr = mem.injections.slice(-n).reverse();
    return arr.map(function(r){ return r.site; });
  }
  function recommendedSite(){
    var used = recentSites(3);
    for (var i=0;i<SITES.length;i++){
      if (used.indexOf(SITES[i].id) === -1) return SITES[i].id;
    }
    return SITES[0].id;
  }

  /* ---------- chart ---------- */
  var chartSeq = 0;
  function lineChart(points, opts){
    opts = opts || {};
    var W = 340, H = opts.height || 190, padL=40, padR=14, padT=50, padB=26;
    if (!points.length){
      return '<svg class="chart" viewBox="0 0 '+W+' '+H+'"><text x="'+(W/2)+'" y="'+(H/2)+'" text-anchor="middle" font-size="13">'+esc(L('chart_empty'))+'</text></svg>';
    }
    var gid = 'fillg' + (++chartSeq);
    var xs = points.map(function(p){ return new Date(p.date).getTime(); });
    var ys = points.map(function(p){ return p.value; });
    if (opts.goal!=null) ys = ys.concat([opts.goal]);
    var xMin=Math.min.apply(null,xs), xMax=Math.max.apply(null,xs);
    var yMin=Math.min.apply(null,ys), yMax=Math.max.apply(null,ys);
    if (xMin===xMax){ xMin -= 86400000; xMax += 86400000; }
    if (yMin===yMax){ yMin -= 1; yMax += 1; }
    var pad = (yMax-yMin)*0.08;
    yMin -= pad; yMax += pad;
    function X(x){ return padL + (x-xMin)/(xMax-xMin) * (W-padL-padR); }
    function Y(y){ return H-padB - (y-yMin)/(yMax-yMin) * (H-padT-padB); }

    var d = points.map(function(p,i){
      return (i===0?'M':'L') + X(new Date(p.date).getTime()).toFixed(1) + ' ' + Y(p.value).toFixed(1);
    }).join(' ');
    var area = d + ' L' + X(xs[xs.length-1]).toFixed(1) + ' ' + (H-padB) + ' L' + X(xs[0]).toFixed(1) + ' ' + (H-padB) + ' Z';

    var grid = '';
    [yMax, (yMin+yMax)/2, yMin].forEach(function(gy, i){
      grid += '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+Y(gy).toFixed(1)+'" y2="'+Y(gy).toFixed(1)+'" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="'+(padL-6)+'" y="'+(Y(gy)+4).toFixed(1)+'" text-anchor="end" font-size="12">'+Math.round(gy)+(i===0?'':'')+'</text>';
    });

    var goalLine = '';
    if (opts.goal!=null){
      goalLine = '<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+Y(opts.goal).toFixed(1)+'" y2="'+Y(opts.goal).toFixed(1)+'" stroke="var(--sage)" stroke-width="1.5" stroke-dasharray="4 4"/>';
    }

    var last = points[points.length-1];
    var lx = X(xs[xs.length-1]), ly = Y(last.value);
    var tipText = fmtMD(last.date) + ' · ' + fmtKg(last.value) + ' kg';
    var tipW = 7.4*tipText.length + 22, tipH = 30;
    var tipX = Math.min(W - padR - tipW, Math.max(padL, lx - tipW/2)), tipY = 6;
    var tip = '<line x1="'+lx.toFixed(1)+'" x2="'+lx.toFixed(1)+'" y1="'+(tipY+tipH)+'" y2="'+(H-padB)+'" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="3 4" opacity=".7"/>' +
      '<rect class="tip-bg" x="'+tipX.toFixed(1)+'" y="'+tipY+'" width="'+tipW.toFixed(1)+'" height="'+tipH+'" rx="9"/>' +
      '<text class="tip-tx" x="'+(tipX+tipW/2).toFixed(1)+'" y="'+(tipY+20)+'" text-anchor="middle" font-size="13">'+esc(tipText)+'</text>';

    var xLabels = '<text x="'+padL+'" y="'+(H-6)+'" font-size="12">'+fmtMD(points[0].date)+'</text>' +
      '<text x="'+(W-padR)+'" y="'+(H-6)+'" text-anchor="end" font-size="12">'+fmtMD(last.date)+'</text>';

    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+esc(tipText)+'">' +
      '<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22"/>' +
        '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      grid + goalLine +
      '<path d="'+area+'" fill="url(#'+gid+')"/>' +
      '<path d="'+d+'" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      tip +
      '<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="5.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.6"/>' +
      xLabels +
      '</svg>';
  }

  /* ---------- body site diagram ---------- */
  function bodyDiagram(){
    var used1 = recentSites(1)[0];
    var used2 = recentSites(3).slice(1);
    var rec = recommendedSite();
    var dots = SITES.map(function(s){
      var ring = '';
      var fill = 'var(--surface)', stroke = 'var(--ink-faint)', op = '1';
      if (s.id===used1){ fill = 'var(--accent-deep)'; stroke = 'none'; }
      else if (used2.indexOf(s.id)!==-1){ fill = 'var(--accent)'; stroke = 'none'; op = '0.5'; }
      if (s.id===rec) ring = '<circle cx="'+s.x+'" cy="'+s.y+'" r="8.2" fill="none" stroke="var(--accent-deep)" stroke-width="1.4" stroke-dasharray="2.4 2.2"/>';
      return ring + '<circle cx="'+s.x+'" cy="'+s.y+'" r="5.2" fill="'+fill+'" fill-opacity="'+op+'" stroke="'+stroke+'" stroke-width="1.3"/>';
    }).join('');
    return '<svg viewBox="0 0 126 152" aria-hidden="true">' +
      '<circle cx="63" cy="13" r="10" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.2"/>' +
      '<path d="M40 26 Q63 20 86 26 L108 36 L104 47 L89 39 L91 62 Q94 96 88 140 L72 140 L68 92 L58 92 L54 140 L38 140 Q32 96 35 62 L37 39 L22 47 L18 36 Z" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.2" stroke-linejoin="round"/>' +
      dots +
      '</svg>';
  }

  /* ---------- calendar ---------- */
  var calYear, calMonth;
  function ensureCalInit(){
    if (calYear==null){
      var t = new Date(); calYear = t.getFullYear(); calMonth = t.getMonth();
    }
  }
  function calendarHTML(){
    ensureCalInit();
    var first = new Date(calYear, calMonth, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    var shotDates = {};
    mem.injections.forEach(function(r){ shotDates[r.date]=true; });
    var cells = '';
    for (var i=0;i<startDow;i++) cells += '<div class="day pad"></div>';
    for (var d=1; d<=daysInMonth; d++){
      var iso = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      var cls = 'day';
      if (iso===todayISO) cls += ' today';
      if (shotDates[iso]) cls += ' shot';
      cells += '<div class="'+cls+'">'+d+'</div>';
    }
    return '<div class="cal-head"><div class="m-label">'+monthLabel(calYear,calMonth)+'</div>' +
      '<div class="cal-nav"><button data-cal="prev">‹</button><button data-cal="next">›</button></div></div>' +
      '<div class="cal-grid">' + DOW[LANG].map(function(w){ return '<div class="dow">'+w+'</div>'; }).join('') + cells + '</div>';
  }

  /* ---------- views ---------- */
  var currentView = 'home';
  var demoBannerDismissed = false;

  function dowOf(iso){ return DOW[LANG][new Date(iso+'T00:00:00').getDay()]; }
  function monthHead(iso){
    var p = iso.split('-');
    return L('month_head',{y:p[0], m:+p[1], mn:MONTHS_EN[(+p[1])-1]});
  }
  var ICON = {
    syringe:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/></svg>',
    plus:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    share:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    trash:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>',
    down:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 9v8H9"/></svg>'
  };
  function exportShortcut(btn){
    exportBackupFile().then(function(res){
      btn.setAttribute('aria-label', !res.ok ? L('msg_exportFailed') : (res.mode==='file' ? L('msg_exportedFile') : L('msg_exportedClipboard')));
      btn.style.borderColor = res.ok ? 'var(--sage)' : 'var(--warn)';
      setTimeout(function(){ btn.style.borderColor=''; }, 1600);
    });
  }

  function renderHome(){
    var lw = latestWeight();
    var curW = lw ? lw.weightKg : mem.profile.startWeight;
    var lost = mem.profile.startWeight - curW;
    var goalDist = Math.max(0, curW - mem.profile.goalWeight);
    var total = mem.profile.startWeight - mem.profile.goalWeight;
    var pct = total>0 ? Math.min(100, Math.max(0,(lost/total)*100)) : 0;
    var nd = nextInjectionDate();
    var cd = daysBetween(todayISO, nd);
    var streak = mem.weights.length ? daysBetween(mem.weights[0].date, todayISO) : 0;
    var bmi = currentBMI();
    var perKg = (lost>0.05 && mem.profile.totalSpend>0) ? (mem.profile.totalSpend/lost) : null;
    var chartPts = mem.weights.map(function(w){ return {date:w.date, value:w.weightKg}; }).slice(-30);

    var banner = (mem.profile.seeded && !demoBannerDismissed) ?
      '<div class="banner"><span>'+esc(L('home_banner'))+'</span><button id="dismissBanner">'+esc(L('home_bannerBtn'))+'</button></div>' : '';

    document.getElementById('view-home').innerHTML =
      banner +
      '<div class="hero">' +
        '<div class="cd-chip'+(cd<0?' overdue':'')+'"><b>'+Math.abs(cd)+'</b><small>'+esc(L('days_unit'))+'</small><div>'+esc(cd<0?L('home_overdueShort'):L('home_cdShort'))+'</div></div>' +
        '<div class="eyebrow">'+ICON.down+esc(L('home_lost'))+'</div>' +
        '<div class="big">'+ (lost>=0?'−':'+') + fmtKg(Math.abs(lost)) + '<span>kg</span></div>' +
        '<div class="sub">' + esc(lost>0.05 ? L('home_cheer') : L('home_cheerStart')) + '</div>' +
        '<div class="bar"><i style="width:'+pct.toFixed(0)+'%"></i></div>' +
        '<div class="bar-labels"><span>'+fmtKg(mem.profile.startWeight)+'kg</span><span>'+esc(L('home_toGoal',{x:fmtKg(goalDist)}))+'</span><span>'+fmtKg(mem.profile.goalWeight)+'kg</span></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('home_trendTitle'))+'</h2>' +
        '<p class="card-sub">'+esc(L('home_chartSub',{n:chartPts.length}))+'</p>' +
        lineChart(chartPts, {goal:mem.profile.goalWeight}) +
      '</div>' +
      '<div class="action-row">' +
        '<button class="btn" id="quickShot">'+ICON.syringe+esc(L('home_quickShot').replace('＋ ',''))+'</button>' +
        '<button class="btn primary" id="quickWeight">'+ICON.plus+esc(L('home_quickWeight').replace('＋ ',''))+'</button>' +
        '<button class="btn icon-only" id="quickExport" aria-label="'+esc(L('btn_export'))+'">'+ICON.share+'</button>' +
      '</div>' +
      '<div class="stat-row">' +
        '<div class="stat-tile"><div class="label">'+esc(L('streak_label'))+'</div><div class="value teal">'+streak+'<small>'+esc(L('days_unit'))+'</small></div></div>' +
        '<div class="stat-tile"><div class="label">'+esc(L('bmi_label'))+'</div><div class="value accent">'+(bmi?bmi.toFixed(1):'—')+'</div></div>' +
        '<div class="stat-tile"><div class="label">'+esc(L('perkg_label'))+'</div><div class="value">'+(perKg!=null?('<small>$</small>'+Math.round(perKg)):'—')+'</div></div>' +
      '</div>';

    var bn = document.getElementById('dismissBanner');
    if (bn) bn.onclick = function(){ demoBannerDismissed = true; renderHome(); };
    document.getElementById('quickShot').onclick = openInjectionForm;
    document.getElementById('quickWeight').onclick = openWeightForm;
    document.getElementById('quickExport').onclick = function(){ exportShortcut(this); };
  }

  var weightRange = '3m';
  function filteredWeights(){
    if (weightRange==='all' || !mem.weights.length) return mem.weights;
    var days = weightRange==='1m'?30:weightRange==='3m'?90:180;
    var cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
    var cutIso = cutoff.toISOString().slice(0,10);
    return mem.weights.filter(function(w){ return w.date>=cutIso; });
  }

  function renderWeight(){
    var pts = filteredWeights().map(function(w){ return {date:w.date, value:w.weightKg}; });
    var lw = latestWeight();
    var curW = lw?lw.weightKg:mem.profile.startWeight;
    var lost = mem.profile.startWeight - curW;
    var pctChange = mem.profile.startWeight ? (lost/mem.profile.startWeight*100) : 0;
    var goalDist = Math.max(0, curW - mem.profile.goalWeight);
    var total = mem.profile.startWeight - mem.profile.goalWeight;
    var pct = total>0 ? Math.min(100, Math.max(0,(lost/total)*100)) : 0;
    var circumference = 2*Math.PI*42;
    var dash = circumference*pct/100;
    var startDate = mem.weights.length ? mem.weights[0].date : mem.profile.startDate;

    var rows = '', lastMonth = '';
    mem.weights.slice().reverse().forEach(function(w){
      var m = w.date.slice(0,7);
      if (m!==lastMonth){ lastMonth = m; rows += '<tr class="month"><td colspan="8">'+esc(monthHead(w.date))+'</td></tr>'; }
      rows += '<tr><td><b>'+(+w.date.slice(8,10))+'</b> '+esc(LANG==='en'?'':'日')+'</td><td class="num strong">'+fmtKg(w.weightKg)+'</td>' +
        '<td class="num">'+(w.fatPercent!=null?fmtKg(w.fatPercent):'—')+'</td>' +
        '<td class="num">'+(w.fatKg!=null?fmtKg(w.fatKg):'—')+'</td>' +
        '<td class="num">'+(w.muscleKg!=null?fmtKg(w.muscleKg):'—')+'</td>' +
        '<td class="num">'+(w.visceralFat!=null?w.visceralFat:'—')+'</td>' +
        '<td class="num">'+(w.score!=null?w.score:'—')+'</td>' +
        '<td class="row-actions"><button class="icon-btn" aria-label="'+esc(L('a11y_delete'))+'" data-del-weight="'+w.id+'">'+ICON.trash+'</button></td></tr>';
    });
    if (!rows) rows = '<tr class="empty-row"><td colspan="8">'+esc(L('empty_weight'))+'</td></tr>';

    document.getElementById('view-weight').innerHTML =
      '<div class="seg" id="rangeSeg">' +
        ['1m','3m','6m','all'].map(function(r){
          var label = r==='1m'?L('range_1m'):r==='3m'?L('range_3m'):r==='6m'?L('range_6m'):L('range_all');
          return '<button data-range="'+r+'" class="'+(weightRange===r?'active':'')+'">'+esc(label)+'</button>';
        }).join('') +
      '</div>' +
      '<div class="card">' +
        lineChart(pts, {goal:mem.profile.goalWeight, height:210}) +
        '<div class="chart-legend"><span><i style="background:var(--accent)"></i>'+esc(L('legend_weight'))+' <b class="num" style="color:var(--accent-deep)">'+(lost>=0?'−':'+')+pctChange.toFixed(1).replace('-','')+'%</b></span><span><i style="background:var(--sage)"></i>'+esc(L('legend_goalKg',{kg:fmtKg(mem.profile.goalWeight)}))+'</span></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="total-line">'+esc(L('weight_total'))+' <b>'+(lost>=0?'−':'+')+fmtKg(Math.abs(lost))+'</b> kg　'+(lost>=0?'−':'+')+Math.abs(pctChange).toFixed(1)+'%</div>' +
        '<div class="summary-grid">' +
          '<div class="ring-wrap"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-2)" stroke-width="10"/>' +
          '<circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent-deep)" stroke-width="10" stroke-linecap="round" ' +
          'stroke-dasharray="'+dash.toFixed(1)+' '+circumference.toFixed(1)+'" transform="rotate(-90 50 50)"/></svg>' +
          '<div class="ring-val"><b>'+fmtKg(mem.profile.goalWeight).replace(/\.0$/,'')+' kg</b><small>'+esc(L('weight_target'))+'</small></div></div>' +
          '<div class="kv-list">' +
            '<div class="kv-row"><span class="k">'+esc(L('weight_distGoal2'))+'</span><span class="v">'+fmtKg(goalDist)+'<small>kg</small></span></div>' +
            '<div class="kv-row"><span class="k">'+esc(L('weight_currentWeight'))+'</span><span class="v">'+fmtKg(curW)+'<small>kg</small></span></div>' +
            '<div class="kv-row"><span class="k">'+esc(L('weight_start'))+'</span><span class="v">'+fmtKg(mem.profile.startWeight)+'<small>kg</small><em>'+esc(startDate?fmtYMD(startDate):'')+'</em></span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="action-row">' +
        '<button class="btn primary" id="addWeightBtn">'+ICON.plus+esc(L('weight_addBtn').replace('＋ ',''))+'</button>' +
        '<button class="btn icon-only" id="weightExport" aria-label="'+esc(L('btn_export'))+'">'+ICON.share+'</button>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h2>'+esc(L('weight_recordsTitle',{n:''}).trim())+' <span class="muted num">'+mem.weights.length+'</span></h2></div>' +
        '<div class="table-scroll"><table class="rec"><thead><tr><th>'+esc(L('th_date'))+'</th><th>'+esc(L('th_weight'))+'kg</th><th>'+esc(L('th_fatPercent'))+'</th><th>'+esc(L('th_fat'))+'kg</th><th>'+esc(L('th_muscle'))+'kg</th><th>'+esc(L('th_visceral'))+'</th><th>'+esc(L('th_score'))+'</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '</div>';

    document.getElementById('addWeightBtn').onclick = openWeightForm;
    document.getElementById('weightExport').onclick = function(){ exportShortcut(this); };
    document.querySelectorAll('#rangeSeg button').forEach(function(b){
      b.onclick = function(){ weightRange = this.getAttribute('data-range'); renderWeight(); };
    });
    document.querySelectorAll('[data-del-weight]').forEach(function(b){
      b.onclick = function(){ deleteWeight(this.getAttribute('data-del-weight')).then(function(){ renderWeight(); updateDayBadge(); }); };
    });
  }

  function renderShot(){
    var nd = nextInjectionDate();
    var cd = daysBetween(todayISO, nd);
    var li = latestInjection();
    var rec = recommendedSite();

    var items = '', lastMonth = '';
    var n = mem.injections.length;
    mem.injections.slice().reverse().forEach(function(r, i){
      var m = r.date.slice(0,7);
      if (m!==lastMonth){ lastMonth = m; items += '<li class="month">'+esc(monthHead(r.date))+'</li>'; }
      items += '<li class="shot-item"><div class="idx">'+(n-i)+'</div>' +
        '<div><div class="site">'+esc(siteLabel(r.site))+'</div><div class="when">'+esc(fmtYMD(r.date).replace(/^\d+年/,''))+esc(L('dow_paren',{d:dowOf(r.date)}))+'</div></div>' +
        '<div class="dose">'+fmtDose(r.doseMg)+'<small>mg</small></div>' +
        '<button class="icon-btn" aria-label="'+esc(L('a11y_delete'))+'" data-del-shot="'+r.id+'">'+ICON.trash+'</button></li>';
    });
    if (!items) items = '<li class="empty">'+esc(L('empty_shot'))+'</li>';

    document.getElementById('view-shot').innerHTML =
      '<div class="card"><div id="calBox">'+calendarHTML()+'</div></div>' +
      '<button class="btn primary block" id="addShotBtn">'+ICON.syringe+esc(L('shot_addBtn').replace('＋ ',''))+'</button>' +
      '<div class="card">' +
        '<div class="card-head"><div><h2>'+esc(L('shot_rotationTitle'))+'</h2><div class="muted">'+esc(L('shot_rotateSub'))+'</div></div></div>' +
        '<div class="site-wrap">' +
          '<div class="site-fig">'+bodyDiagram()+'</div>' +
          '<div class="site-side">' +
            '<div class="cd-block'+(cd<0?' overdue':'')+'"><div class="t">'+esc(cd<0?L('shot_overdueTitle'):L('shot_cdTitle'))+'</div>' +
              '<div class="n">'+Math.abs(cd)+'<small>'+esc(L('days_unit'))+' '+esc(fmtMD(nd))+esc(L('dow_paren',{d:dowOf(nd)}))+'</small></div></div>' +
            (li ? '<div class="last-chip"><div class="row1"><span>'+esc(fmtMD(li.date))+esc(L('dow_paren',{d:dowOf(li.date)}))+'</span><b>'+fmtDose(li.doseMg)+'mg</b></div>' +
              '<div class="row2"><span class="dot used1" style="width:12px;height:12px;border-radius:50%;display:inline-block"></span>'+esc(siteLabel(li.site))+'</div></div>' : '') +
            '<div class="site-key">' +
              '<div class="item"><span class="dot used2"></span>'+esc(L('shot_usedRecently'))+'</div>' +
              '<div class="item"><span class="dot next"></span>'+esc(L('shot_suggestNext',{site:siteLabel(rec)}))+'</div>' +
              '<div class="item"><span class="dot free"></span>'+esc(L('shot_unused'))+'</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="note" style="margin-top:12px">'+esc(L('shot_navelNote'))+'</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h2>'+esc(L('shot_recordsTitle',{n:''}).replace(/\s*筆$/,'').replace(/\s*\(\)$/,'').trim())+' <span class="muted num">'+n+'</span></h2></div>' +
        '<ul class="shot-list">'+items+'</ul>' +
      '</div>';

    document.getElementById('addShotBtn').onclick = openInjectionForm;
    document.querySelectorAll('[data-del-shot]').forEach(function(b){
      b.onclick = function(){ deleteInjection(this.getAttribute('data-del-shot')).then(function(){ renderShot(); setTitle('shot'); }); };
    });
    bindCalNav();
  }

  function bindCalNav(){
    var box = document.getElementById('calBox');
    if (!box) return;
    box.querySelectorAll('[data-cal]').forEach(function(b){
      b.onclick = function(){
        ensureCalInit();
        if (this.getAttribute('data-cal')==='prev'){ calMonth--; if (calMonth<0){calMonth=11;calYear--;} }
        else { calMonth++; if (calMonth>11){calMonth=0;calYear++;} }
        box.innerHTML = calendarHTML();
        bindCalNav();
      };
    });
  }

  function renderSettings(){
    var p = mem.profile;
    document.getElementById('view-settings').innerHTML =
      '<div class="card">' +
        '<h2>'+esc(L('settings_langTitle'))+'</h2>' +
        '<div class="seg" id="langSeg">' +
          '<button data-lang="zh" class="'+(LANG==='zh'?'active':'')+'">中文</button>' +
          '<button data-lang="en" class="'+(LANG==='en'?'active':'')+'">English</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('settings_profileTitle'))+'</h2>' +
        '<div class="field-row">' +
          '<div class="field"><label>'+esc(L('settings_gender'))+'</label><select id="f-gender">' +
            '<option value="female"'+(p.gender==='female'?' selected':'')+'>'+esc(L('gender_female'))+'</option>' +
            '<option value="male"'+(p.gender==='male'?' selected':'')+'>'+esc(L('gender_male'))+'</option>' +
            '<option value="other"'+(p.gender==='other'?' selected':'')+'>'+esc(L('gender_other'))+'</option>' +
          '</select></div>' +
          '<div class="field"><label>'+esc(L('settings_height'))+'</label><input id="f-height" type="number" inputmode="decimal" value="'+p.heightCm+'"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>'+esc(L('settings_startWeight'))+'</label><input id="f-start" type="number" inputmode="decimal" value="'+p.startWeight+'"></div>' +
          '<div class="field"><label>'+esc(L('settings_goalWeight'))+'</label><input id="f-goal" type="number" inputmode="decimal" value="'+p.goalWeight+'"></div>' +
        '</div>' +
        '<button class="btn teal block" id="saveProfile1">'+esc(L('btn_save'))+'</button>' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('settings_shotTitle'))+'</h2>' +
        '<div class="field"><label>'+esc(L('settings_medication'))+'</label><input id="f-med" type="text" value="'+esc(p.medication)+'"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>'+esc(L('settings_interval'))+'</label><input id="f-interval" type="number" inputmode="numeric" value="'+p.intervalDays+'"></div>' +
          '<div class="field"><label>'+esc(L('settings_spend'))+'</label><input id="f-spend" type="number" inputmode="decimal" value="'+p.totalSpend+'"></div>' +
        '</div>' +
        '<div class="toggle">' +
          '<div><div class="t-label">'+esc(L('settings_reminder'))+'</div><div class="t-sub">'+esc(L('settings_reminderNote'))+'</div></div>' +
          '<div class="switch'+(p.remindersOn?' on':'')+'" id="remindToggle"><i></i></div>' +
        '</div>' +
        '<button class="btn teal block" id="saveProfile2" style="margin-top:12px">'+esc(L('btn_save'))+'</button>' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('settings_backupTitle'))+'</h2>' +
        '<div class="note" style="margin-bottom:10px">'+esc(persistMode==='local' ? L('settings_backupNoteLocal') : L('settings_backupNoteMemory'))+esc(L('settings_backupTail'))+'</div>' +
        '<div class="action-row">' +
          '<button class="btn primary" id="exportFileBtn">'+esc(L('settings_exportFile'))+'</button>' +
          '<button class="btn ghost" id="exportCopyBtn">'+esc(L('settings_exportCopy'))+'</button>' +
        '</div>' +
        '<div style="height:16px"></div>' +
        '<input type="file" id="importFileInput" accept="application/json,.json" hidden>' +
        '<button class="btn block" id="importFileBtn">'+esc(L('settings_importFile'))+'</button>' +
        '<div style="height:12px"></div>' +
        '<div class="field"><label>'+esc(L('settings_importPasteLabel'))+'</label><textarea id="importPaste" rows="4" placeholder="'+esc(L('settings_importPastePh'))+'"></textarea></div>' +
        '<button class="btn teal block" id="importPasteBtn">'+esc(L('settings_importPasteBtn'))+'</button>' +
        '<div class="note" id="backupMsg" style="margin-top:10px;min-height:14px"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('settings_inbodyImportTitle'))+'</h2>' +
        '<div class="note" style="margin-bottom:10px">'+esc(L('settings_inbodyImportNote'))+'</div>' +
        '<input type="file" id="inbodyFileInput" accept=".csv,.xlsx,.xls" hidden>' +
        '<button class="btn primary block" id="inbodyImportBtn">'+esc(L('settings_inbodyImportBtn'))+'</button>' +
        '<div class="note" id="inbodyMsg" style="margin-top:10px;min-height:14px"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('settings_dataMgmtTitle'))+'</h2>' +
        '<button class="btn danger block" id="clearBtn">'+esc(L('settings_clearBtn'))+'</button>' +
        '<div class="note" id="clearMsg" style="margin-top:10px;min-height:14px"></div>' +
      '</div>' +
      '<div class="note" style="text-align:center;padding:4px 12px 0">'+esc(L('settings_footer'))+'</div>';

    document.querySelectorAll('#langSeg button').forEach(function(b){
      b.onclick = function(){
        var newLang = this.getAttribute('data-lang');
        if (newLang===LANG) return;
        saveProfile({lang:newLang}).then(function(){
          LANG = newLang;
          updateNavLabels();
          updateDayBadge();
          switchView('settings');
        });
      };
    });

    function save(){
      saveProfile({
        gender: document.getElementById('f-gender').value,
        heightCm: +document.getElementById('f-height').value || p.heightCm,
        startWeight: +document.getElementById('f-start').value || p.startWeight,
        goalWeight: +document.getElementById('f-goal').value || p.goalWeight,
        medication: document.getElementById('f-med').value || p.medication,
        intervalDays: +document.getElementById('f-interval').value || p.intervalDays,
        totalSpend: +document.getElementById('f-spend').value || 0
      }).then(function(){ renderSettings(); });
    }
    document.getElementById('saveProfile1').onclick = save;
    document.getElementById('saveProfile2').onclick = save;
    document.getElementById('remindToggle').onclick = function(){
      saveProfile({remindersOn: !mem.profile.remindersOn}).then(renderSettings);
    };

    function refreshAll(){ renderHome(); renderWeight(); renderShot(); }

    document.getElementById('exportFileBtn').onclick = function(){
      var btn = this, orig = btn.textContent;
      btn.textContent = L('msg_processing');
      exportBackupFile().then(function(res){
        btn.textContent = !res.ok ? L('msg_exportFailed') : (res.mode==='file' ? L('msg_exportedFile') : L('msg_exportedClipboard'));
        setTimeout(function(){ btn.textContent = orig; }, 2200);
      });
    };
    document.getElementById('exportCopyBtn').onclick = function(){
      var btn = this;
      copyToClipboard(backupJSONText()).then(function(ok){
        btn.textContent = ok ? L('msg_copied') : L('msg_copyFailedDownload');
        setTimeout(function(){ btn.textContent = L('settings_exportCopy'); }, 1800);
      });
    };
    document.getElementById('importFileBtn').onclick = function(){
      document.getElementById('importFileInput').click();
    };
    document.getElementById('importFileInput').onchange = function(e){
      var f = e.target.files && e.target.files[0];
      var msg = document.getElementById('backupMsg');
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function(){
        var obj = parseBackupText(String(reader.result));
        e.target.value = '';
        if (!obj){ msg.style.color='var(--warn)'; msg.textContent=L('msg_badFile'); return; }
        confirmInline(msg, L('msg_detected',{w:obj.weights.length, s:obj.injections.length}), L('msg_confirmRestore'), function(){
          restoreFromBackup(obj).then(function(){
            LANG = mem.profile.lang || LANG;
            msg.style.color='var(--teal)'; msg.textContent=L('msg_restored');
            updateNavLabels(); updateDayBadge(); refreshAll(); renderSettings();
          });
        });
      };
      reader.readAsText(f, 'utf-8');
    };
    document.getElementById('importPasteBtn').onclick = function(){
      var msg = document.getElementById('backupMsg');
      var text = document.getElementById('importPaste').value.trim();
      if (!text){ msg.style.color='var(--warn)'; msg.textContent=L('msg_pasteFirst'); return; }
      var obj = parseBackupText(text);
      if (!obj){ msg.style.color='var(--warn)'; msg.textContent=L('msg_badText'); return; }
      confirmInline(msg, L('msg_detected',{w:obj.weights.length, s:obj.injections.length}), L('msg_confirmRestore'), function(){
        restoreFromBackup(obj).then(function(){
          LANG = mem.profile.lang || LANG;
          msg.style.color='var(--teal)'; msg.textContent=L('msg_restored');
          updateNavLabels(); updateDayBadge(); refreshAll(); renderSettings();
        });
      });
    };
    document.getElementById('inbodyImportBtn').onclick = function(){
      document.getElementById('inbodyFileInput').click();
    };
    document.getElementById('inbodyFileInput').onchange = function(e){
      var f = e.target.files && e.target.files[0];
      var msg = document.getElementById('inbodyMsg');
      e.target.value = '';
      if (!f) return;
      msg.style.color = 'var(--ink-faint)';
      msg.textContent = L('msg_inbodyParsing');
      parseInBodyFile(f).then(function(res){
        if (res.unmatched || !res.rows.length){
          msg.style.color = 'var(--warn)';
          msg.textContent = L('msg_inbodyNoColumns');
          return;
        }
        var dates = res.rows.map(function(r){ return r.date; }).sort();
        confirmInline(msg, L('msg_inbodyDetected', {n:res.rows.length, from:dates[0], to:dates[dates.length-1]}), L('msg_inbodyImportBtn'), function(){
          importInBodyRows(res.rows).then(function(){
            msg.style.color = 'var(--teal)';
            msg.textContent = L('msg_inbodyImported', {n:res.rows.length});
            refreshAll(); renderSettings();
          });
        });
      }).catch(function(){
        msg.style.color = 'var(--warn)';
        msg.textContent = L('msg_inbodyBadFile');
      });
    };
    document.getElementById('clearBtn').onclick = function(){
      var msg = document.getElementById('clearMsg');
      confirmInline(msg, L('msg_confirmClear'), L('msg_confirmClearBtn'), function(){
        clearAllData().then(function(){
          msg.style.color='var(--teal)'; msg.textContent=L('msg_cleared');
          refreshAll();
        });
      });
    };
  }

  /* ---------- forms (bottom sheet) ---------- */
  var overlay = document.getElementById('sheetOverlay');
  var sheetBody = document.getElementById('sheetBody');
  function closeSheet(){ overlay.classList.remove('open'); }
  overlay.addEventListener('click', function(e){ if (e.target===overlay) closeSheet(); });

  function openWeightForm(){
    var aiAvailable = !!(sampleCap && sampleImgLimits && sampleImgLimits.images);
    sheetBody.innerHTML =
      '<div class="sheet-head"><h3>'+esc(L('wf_title'))+'</h3><button id="closeSheet">✕</button></div>' +
      (aiAvailable ?
        '<input type="file" id="wf-ai-input" accept="'+esc((sampleImgLimits.images.mediaTypes||['image/*']).join(','))+'" hidden>' +
        '<button class="btn ghost block" id="wf-ai-btn" type="button">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="14" r="3.5"/></svg> ' +
          esc(L('wf_aiImportBtn')) +
        '</button>' +
        '<div class="note" id="wf-ai-msg" style="margin:8px 0 4px;min-height:14px"></div>'
      : '') +
      '<div class="field"><label>'+esc(L('wf_date'))+'</label><input type="date" id="wf-date" value="'+todayISO+'"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label>'+esc(L('wf_weight'))+'</label><input type="number" inputmode="decimal" id="wf-weight" step="0.1" placeholder="'+esc(L('wf_weightPh'))+'"></div>' +
        '<div class="field"><label>'+esc(L('wf_fatPercent'))+'</label><input type="number" inputmode="decimal" id="wf-fatpct" step="0.1"></div>' +
      '</div>' +
      '<button class="btn ghost small" id="wf-inbody-toggle" type="button" style="margin-bottom:12px">'+esc(L('wf_inbodyToggle'))+' ▾</button>' +
      '<div id="wf-inbody-fields" hidden>' +
        '<div class="field-row">' +
          '<div class="field"><label>'+esc(L('wf_fat'))+'</label><input type="number" inputmode="decimal" id="wf-fat" step="0.1"></div>' +
          '<div class="field"><label>'+esc(L('wf_muscle'))+'</label><input type="number" inputmode="decimal" id="wf-muscle" step="0.1"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>'+esc(L('wf_visceralFat'))+'</label><input type="number" inputmode="numeric" id="wf-visceral" step="1"></div>' +
          '<div class="field"><label>'+esc(L('wf_score'))+'</label><input type="number" inputmode="numeric" id="wf-score" step="1"></div>' +
        '</div>' +
      '</div>' +
      '<button class="btn primary block" id="wf-save">'+esc(L('wf_save'))+'</button>';
    overlay.classList.add('open');
    document.getElementById('closeSheet').onclick = closeSheet;

    document.getElementById('wf-inbody-toggle').onclick = function(){
      var box = document.getElementById('wf-inbody-fields');
      box.hidden = !box.hidden;
    };

    function fillFromExtract(obj){
      if (obj.date) document.getElementById('wf-date').value = obj.date;
      if (obj.weightKg!=null) document.getElementById('wf-weight').value = obj.weightKg;
      if (obj.fatPercent!=null) document.getElementById('wf-fatpct').value = obj.fatPercent;
      if (obj.fatKg!=null) document.getElementById('wf-fat').value = obj.fatKg;
      if (obj.muscleKg!=null) document.getElementById('wf-muscle').value = obj.muscleKg;
      if (obj.visceralFat!=null) document.getElementById('wf-visceral').value = obj.visceralFat;
      if (obj.score!=null) document.getElementById('wf-score').value = obj.score;
      if (obj.fatKg!=null || obj.muscleKg!=null || obj.visceralFat!=null || obj.score!=null){
        document.getElementById('wf-inbody-fields').hidden = false;
      }
    }

    if (aiAvailable){
      var aiBtn = document.getElementById('wf-ai-btn');
      var aiMsg = document.getElementById('wf-ai-msg');
      aiBtn.onclick = function(){ document.getElementById('wf-ai-input').click(); };
      document.getElementById('wf-ai-input').onchange = function(e){
        var f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        aiBtn.disabled = true;
        aiMsg.style.color = 'var(--ink-faint)';
        aiMsg.textContent = L('wf_aiRecognizing');
        var prompt = 'This is a photo of an InBody body-composition scale report. Read the printed values and reply with ONLY this JSON object (no other text), using null for any field not visible on the report:\n' +
          '{"date": "YYYY-MM-DD or null", "weightKg": number or null, "fatPercent": number or null (body fat %, PBF), "fatKg": number or null (body fat mass), "muscleKg": number or null (skeletal muscle mass, SMM), "visceralFat": number or null (visceral fat level), "score": number or null (InBody score)}';
        sampleCap.json(prompt, {images:f, modelTier:'default', cache:false}).then(function(obj){
          fillFromExtract(obj||{});
          var gotAny = obj && (obj.weightKg!=null || obj.fatPercent!=null || obj.fatKg!=null || obj.muscleKg!=null);
          aiMsg.style.color = gotAny ? 'var(--teal)' : 'var(--warn)';
          aiMsg.textContent = gotAny ? L('wf_aiFilled') : L('wf_aiEmpty');
        }).catch(function(err){
          var code = err && err.code;
          if (code==='not_granted' || code==='sampling_disabled' || code==='not_declared' || code==='capability_disabled' || code==='capability_removed' || code==='images_unavailable'){
            aiBtn.style.display = 'none';
            aiMsg.textContent = '';
            return;
          }
          aiMsg.style.color = 'var(--warn)';
          if (code==='image_rejected') aiMsg.textContent = L('wf_aiImageRejected');
          else if (code==='rate_limited') aiMsg.textContent = L('wf_aiRateLimited');
          else if (code==='cancelled') aiMsg.textContent = '';
          else aiMsg.textContent = L('wf_aiUpstream');
        }).finally(function(){ aiBtn.disabled = false; });
      };
    }

    document.getElementById('wf-save').onclick = function(){
      var v = +document.getElementById('wf-weight').value;
      if (!v){ document.getElementById('wf-weight').focus(); return; }
      function numOrNull(id){ var el = document.getElementById(id); return el.value ? +el.value : null; }
      var rec = {
        date: document.getElementById('wf-date').value || todayISO,
        weightKg: v,
        fatPercent: numOrNull('wf-fatpct'),
        fatKg: numOrNull('wf-fat'),
        muscleKg: numOrNull('wf-muscle'),
        visceralFat: numOrNull('wf-visceral'),
        score: numOrNull('wf-score')
      };
      addWeight(rec).then(function(){
        closeSheet(); renderHome(); renderWeight(); updateDayBadge();
      });
    };
  }

  function openInjectionForm(){
    var rec = recommendedSite();
    sheetBody.innerHTML =
      '<div class="sheet-head"><h3>'+esc(L('sf_title'))+'</h3><button id="closeSheet">✕</button></div>' +
      '<div class="field"><label>'+esc(L('sf_date'))+'</label><input type="date" id="sf-date" value="'+todayISO+'"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label>'+esc(L('sf_dose'))+'</label><input type="number" inputmode="decimal" id="sf-dose" step="0.05" placeholder="'+esc(L('sf_dosePh'))+'"></div>' +
        '<div class="field"><label>'+esc(L('sf_site'))+'</label><select id="sf-site">' +
          SITES.map(function(s){ return '<option value="'+s.id+'"'+(s.id===rec?' selected':'')+'>'+esc(siteLabel(s.id))+(s.id===rec?esc(L('sf_recommended')):'')+'</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<button class="btn primary block" id="sf-save">'+esc(L('sf_save'))+'</button>';
    overlay.classList.add('open');
    document.getElementById('closeSheet').onclick = closeSheet;
    document.getElementById('sf-save').onclick = function(){
      var dose = +document.getElementById('sf-dose').value;
      if (!dose){ document.getElementById('sf-dose').focus(); return; }
      var r = {
        date: document.getElementById('sf-date').value || todayISO,
        doseMg: dose,
        site: document.getElementById('sf-site').value
      };
      addInjection(r).then(function(){
        closeSheet(); renderHome(); renderShot(); setTitle(currentView);
      });
    };
  }

  /* ---------- AI analysis (Gemini, free web app — no API key stored in the page) ---------- */
  function buildSummaryText(){
    var p = mem.profile;
    var genderText = p.gender==='female'?L('gender_female'):p.gender==='male'?L('gender_male'):L('gender_other');
    var lines = [];
    lines.push(L('ai_intro'));
    lines.push('');
    lines.push(L('ai_basicHeader'));
    lines.push(L('ai_genderHeight',{gender:genderText, h:p.heightCm}));
    lines.push(L('ai_startGoal',{start:fmtKg(p.startWeight), goal:fmtKg(p.goalWeight)}));
    lines.push(L('ai_medCycle',{med:p.medication, days:p.intervalDays}));
    lines.push('');
    lines.push(L('ai_weightHeader'));
    if (mem.weights.length){
      mem.weights.slice().reverse().forEach(function(w){
        lines.push(w.date + '  ' + fmtKg(w.weightKg) + '  ' + (w.fatPercent!=null?fmtKg(w.fatPercent):'-') + '  ' + (w.fatKg!=null?fmtKg(w.fatKg):'-') + '  ' + (w.muscleKg!=null?fmtKg(w.muscleKg):'-') + '  ' + (w.visceralFat!=null?w.visceralFat:'-') + '  ' + (w.score!=null?w.score:'-'));
      });
    } else { lines.push(L('ai_noRecords')); }
    lines.push('');
    lines.push(L('ai_shotHeader'));
    if (mem.injections.length){
      mem.injections.slice().reverse().forEach(function(r){
        lines.push(r.date + '  ' + fmtDose(r.doseMg) + 'mg  ' + siteLabel(r.site));
      });
    } else { lines.push(L('ai_noRecords')); }
    return lines.join('\n');
  }

  function fallbackCopy(text){
    try{
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }catch(e){ return false; }
  }
  function copyToClipboard(text){
    return new Promise(function(resolve){
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ resolve(true); }).catch(function(){ resolve(fallbackCopy(text)); });
      } else {
        resolve(fallbackCopy(text));
      }
    });
  }

  function openAISheet(){
    var text = buildSummaryText();
    sheetBody.innerHTML =
      '<div class="sheet-head"><h3>'+esc(L('ai_title'))+'</h3><button id="closeSheet">✕</button></div>' +
      '<div class="note" style="margin-bottom:10px">'+esc(L('ai_note'))+'</div>' +
      '<div class="ai-preview">'+esc(text)+'</div>' +
      '<div class="action-row" style="margin-top:12px">' +
        '<button class="btn ghost" id="aiCopyBtn">'+esc(L('ai_copyBtn'))+'</button>' +
        '<a class="btn primary" id="aiOpenBtn" href="https://gemini.google.com/app" target="_blank" rel="noopener">'+esc(L('ai_openBtn'))+'</a>' +
      '</div>';
    overlay.classList.add('open');
    document.getElementById('closeSheet').onclick = closeSheet;
    document.getElementById('aiCopyBtn').onclick = function(){
      var btn = this;
      copyToClipboard(text).then(function(ok){
        btn.textContent = ok ? L('msg_copied') : L('msg_copyFailedManual');
        setTimeout(function(){ btn.textContent = L('ai_copyBtn'); }, 1800);
      });
    };
  }

  /* ---------- nav / boot ---------- */
  function setTitle(name){
    var sub = '';
    if (name==='shot') sub = mem.injections.length + (L('shot_unitTimes') ? ' '+L('shot_unitTimes') : '');
    document.getElementById('viewTitle').innerHTML = esc(L('title_'+name)) + (sub ? '<small>'+esc(sub)+'</small>' : '');
  }
  function switchView(name){
    currentView = name;
    document.querySelectorAll('.view').forEach(function(v){ v.classList.toggle('active', v.getAttribute('data-view')===name); });
    document.querySelectorAll('nav.bottom button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-nav')===name); });
    setTitle(name);
    if (name==='home') renderHome();
    if (name==='weight') renderWeight();
    if (name==='shot') renderShot();
    if (name==='settings') renderSettings();
  }
  document.getElementById('aiPill').onclick = function(){ openAISheet(); };
  document.getElementById('navBar').addEventListener('click', function(e){
    var b = e.target.closest('[data-nav]');
    if (b) switchView(b.getAttribute('data-nav'));
  });

  function updateNavLabels(){
    document.getElementById('navLabelHome').textContent = L('nav_home');
    document.getElementById('navLabelWeight').textContent = L('nav_weight');
    document.getElementById('navLabelShot').textContent = L('nav_shot');
    document.getElementById('navLabelSettings').textContent = L('nav_settings');
  }

  function updateDayBadge(){
    var streak = mem.weights.length ? Math.max(1, daysBetween(mem.weights[0].date, todayISO)) : 1;
    document.getElementById('dayBadge').textContent = L('dayBadge', {n:streak});
  }

  initPersistence().then(function(){
    LANG = (mem.profile && mem.profile.lang) || 'zh';
    updateNavLabels();
    updateDayBadge();
    switchView('home');
  });
})();
