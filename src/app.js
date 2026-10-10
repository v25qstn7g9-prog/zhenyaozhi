(function(){
  "use strict";

  /* ---------- constants ---------- */
  // Injection sites. The eight original ids stay valid; 2026-10 added four more abdomen points
  // (8 around the navel). x/y are for the small 126×152 figure on the 注射 page; bx/by for the
  // larger per-region figure (300×220) in the log sheet. The person's right side is on the viewer's left.
  var SITES = [
    {id:'r-abd-u', r:'abd',   x:50, y:54, bx:92,  by:62},
    {id:'c-abd-u', r:'abd',   x:63, y:52, bx:150, by:52},
    {id:'l-abd-u', r:'abd',   x:76, y:54, bx:208, by:62},
    {id:'r-abd-m', r:'abd',   x:49, y:64, bx:80,  by:112},
    {id:'l-abd-m', r:'abd',   x:77, y:64, bx:220, by:112},
    {id:'r-abd-l', r:'abd',   x:50, y:75, bx:92,  by:162},
    {id:'c-abd-l', r:'abd',   x:63, y:77, bx:150, by:172},
    {id:'l-abd-l', r:'abd',   x:76, y:75, bx:208, by:162},
    {id:'r-arm',   r:'arm',   x:26, y:34, bx:70,  by:96},
    {id:'l-arm',   r:'arm',   x:100,y:34, bx:230, by:96},
    {id:'r-thigh', r:'thigh', x:44, y:108,bx:104, by:96},
    {id:'l-thigh', r:'thigh', x:82, y:108,bx:196, by:96}
  ];
  // Order used to suggest the next site inside a region (alternate sides, then the centre).
  var ROTATION = ['r-abd-l','l-abd-u','r-abd-u','l-abd-l','r-abd-m','l-abd-m','c-abd-l','c-abd-u','r-arm','l-arm','r-thigh','l-thigh'];
  var REGIONS = ['abd','arm','thigh'];
  var SITE_LABELS = {
    zh:{'l-arm':'左上臂','r-arm':'右上臂','l-abd-u':'左上腹','r-abd-u':'右上腹','c-abd-u':'上腹中間','l-abd-m':'肚臍左側','r-abd-m':'肚臍右側',
        'l-abd-l':'左下腹','r-abd-l':'右下腹','c-abd-l':'下腹中間','l-thigh':'左大腿','r-thigh':'右大腿'},
    en:{'l-arm':'Left upper arm','r-arm':'Right upper arm','l-abd-u':'Left upper abdomen','r-abd-u':'Right upper abdomen','c-abd-u':'Upper abdomen, centre',
        'l-abd-m':'Left of navel','r-abd-m':'Right of navel','l-abd-l':'Left lower abdomen','r-abd-l':'Right lower abdomen','c-abd-l':'Lower abdomen, centre',
        'l-thigh':'Left thigh','r-thigh':'Right thigh'}
  };
  // Medicines and their standard pen strengths (mg). Anything else is entered as 自訂.
  var MEDS = { mounjaro:[2.5,5,7.5,10,12.5,15], wegovy:[0.25,0.5,1,1.7,2.4] };
  var MED_LABELS = { zh:{mounjaro:'猛健樂', wegovy:'週纖達'}, en:{mounjaro:'Mounjaro', wegovy:'Wegovy'} };
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
    injections: [],
    meals: [],   // added 2026-10: diet log; older saves simply have none
    purchases: [] // added 2026-10: 帳本 {id,date,medication,items:[{doseMg,qty}],price,place}
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
      localStorage.setItem(LS_KEY, JSON.stringify({profile:mem.profile, weights:mem.weights, injections:mem.injections, meals:mem.meals, purchases:mem.purchases}));
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
      mem.meals = Array.isArray(saved.meals) ? saved.meals : [];
      mem.purchases = Array.isArray(saved.purchases) ? saved.purchases : [];
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

  function byDateTime(a,b){ return a.date.localeCompare(b.date) || String(a.time||'').localeCompare(String(b.time||'')); }
  function sortData(){
    mem.weights.sort(byDateTime);
    mem.injections.sort(byDateTime);
    mem.purchases.sort(function(a,b){ return a.date.localeCompare(b.date); });
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
  function addPurchase(rec){
    rec.id = uuid();
    mem.purchases.push(rec); sortData();
    writeLocalStorage();
  }
  function deletePurchase(id){
    mem.purchases = mem.purchases.filter(function(r){ return r.id!==id; });
    writeLocalStorage();
  }
  async function clearAllData(){
    mem.weights = []; mem.injections = []; mem.meals = []; mem.purchases = [];
    writeLocalStorage();
  }
  async function restoreFromBackup(obj){
    mem.profile = Object.assign(defaultProfile(), mem.profile, obj.profile||{}, {seeded:false});
    mem.weights = obj.weights.map(function(w){ return Object.assign({}, w, {id:w.id||uuid()}); });
    mem.injections = obj.injections.map(function(r){ return Object.assign({}, r, {id:r.id||uuid()}); });
    // Backups made before the diet page have no meals: keep what is on this phone instead of wiping it.
    if (Array.isArray(obj.meals)) mem.meals = obj.meals.map(function(m){ return Object.assign({}, m, {id:m.id||uuid()}); });
    if (Array.isArray(obj.purchases)) mem.purchases = obj.purchases.map(function(m){ return Object.assign({}, m, {id:m.id||uuid()}); });
    sortData();
    writeLocalStorage();
  }

  /* ---------- backup / restore (export file or text, re-import) ---------- */
  function buildBackupObject(){
    return {app:'zhenyaozhi', version:1, exportedAt:new Date().toISOString(),
      profile:mem.profile, weights:mem.weights, injections:mem.injections, meals:mem.meals, purchases:mem.purchases};
  }
  function backupJSONText(){ return JSON.stringify(buildBackupObject(), null, 2); }
  function parseBackupText(text){
    try{
      var obj = JSON.parse(text);
      if (obj && typeof obj==='object' && Array.isArray(obj.weights) && Array.isArray(obj.injections)) return obj;
    }catch(e){}
    return null;
  }
  // Real file on the live site: phones get the share sheet (儲存到「檔案」、LINE、Email…),
  // computers get a normal download; copying the text is only the last resort.
  function backupFileName(){ return 'zhenyaozhi-backup-'+todayISO+'.json'; }
  function downloadBlob(blob, name){
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
  async function exportBackupFile(){
    var text = backupJSONText();
    if (downloadsCap){
      try{
        await downloadsCap.save({filename:backupFileName(), data:text});
        return {ok:true, mode:'file'};
      }catch(e){ /* fall through */ }
    }
    var name = backupFileName();
    var blob = new Blob([text], {type:'application/json'});
    var coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
    if (coarse && typeof File==='function' && navigator.canShare){
      var file = new File([blob], name, {type:'application/json'});
      if (navigator.canShare({files:[file]})){
        try{ await navigator.share({files:[file], title:name}); return {ok:true, mode:'share'}; }
        catch(e){ if (e && e.name==='AbortError') return {ok:false, mode:'cancelled'}; }
      }
    }
    try{ downloadBlob(blob, name); return {ok:true, mode:'file'}; }
    catch(e){ /* fall through */ }
    var copied = await copyToClipboard(text);
    return {ok:copied, mode:'clipboard'};
  }
  function backupCounts(obj){
    return {w:obj.weights.length, s:obj.injections.length,
      m:Array.isArray(obj.meals)?obj.meals.length:0, p:Array.isArray(obj.purchases)?obj.purchases.length:0};
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
  function kgShort(n){ return fmtKg(n).replace(/\.0$/,''); }
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
  function siteById(id){ for (var i=0;i<SITES.length;i++){ if (SITES[i].id===id) return SITES[i]; } return null; }
  function regionOf(id){ var s = siteById(id); return s ? s.r : 'abd'; }
  // Suggest the least recently used site in a region (default: the region of the last shot).
  function recommendedSite(region){
    var li = latestInjection();
    region = region || (li ? regionOf(li.site) : 'abd');
    var last = {};
    mem.injections.forEach(function(r, i){ last[r.site] = i; });
    var best = null, bestIdx = Infinity;
    ROTATION.forEach(function(id){
      if (regionOf(id)!==region) return;
      var idx = last[id]==null ? -1 : last[id];
      if (idx < bestIdx){ best = id; bestIdx = idx; }
    });
    return best || ROTATION[0];
  }

  /* ---------- medicine + money helpers ---------- */
  function medLabel(k){ return (MED_LABELS[LANG] && MED_LABELS[LANG][k]) || MED_LABELS.zh[k] || ''; }
  function medKeyFromText(s){
    s = String(s||'').toLowerCase();
    if (/猛健|tirzep|mounjaro|zepbound/.test(s)) return 'mounjaro';
    if (/週纖|司美|semaglut|wegovy|ozempic|胰妥/.test(s)) return 'wegovy';
    return null;
  }
  function defaultMed(){
    for (var i=mem.injections.length-1;i>=0;i--){ if (MEDS[mem.injections[i].medication]) return mem.injections[i].medication; }
    return medKeyFromText(mem.profile.medication) || 'mounjaro';
  }
  function lastDoseFor(med){
    for (var i=mem.injections.length-1;i>=0;i--){
      var r = mem.injections[i];
      if ((r.medication || medKeyFromText(mem.profile.medication)) === med) return +r.doseMg;
    }
    return null;
  }
  function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
  function purchaseQty(p){ return (p.items||[]).reduce(function(a,it){ return a + (+it.qty||0); }, 0); }
  // Ledger entries win; the old single 累計花費 number from 設定 is used until the first purchase is logged.
  function spendTotal(){
    if (mem.purchases.length) return mem.purchases.reduce(function(a,p){ return a + (+p.price||0); }, 0);
    return +mem.profile.totalSpend || 0;
  }
  function kgLost(){
    var lw = latestWeight();
    return mem.profile.startWeight - (lw ? lw.weightKg : mem.profile.startWeight);
  }
  function nowHM(){ var d = new Date(); return pad2(d.getHours())+':'+pad2(d.getMinutes()); }

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
      if (s.id===rec) ring = '<circle cx="'+s.x+'" cy="'+s.y+'" r="6.8" fill="none" stroke="var(--accent-deep)" stroke-width="1.3" stroke-dasharray="2.2 2"/>';
      return ring + '<circle cx="'+s.x+'" cy="'+s.y+'" r="4.3" fill="'+fill+'" fill-opacity="'+op+'" stroke="'+stroke+'" stroke-width="1.2"/>';
    }).join('') + '<circle cx="63" cy="64.5" r="1.6" fill="var(--ink-faint)"/>';
    return '<svg viewBox="0 0 126 152" aria-hidden="true">' +
      '<circle cx="63" cy="13" r="10" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.2"/>' +
      '<path d="M40 26 Q63 20 86 26 L108 36 L104 47 L89 39 L91 62 Q94 96 88 140 L72 140 L68 92 L58 92 L54 140 L38 140 Q32 96 35 62 L37 39 L22 47 L18 36 Z" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.2" stroke-linejoin="round"/>' +
      dots +
      '</svg>';
  }

  // Larger figure for one region, used in the log sheet. Tapping a dot picks the site.
  function regionFigure(region, selected){
    var used = recentSites(3), rec = recommendedSite(region);
    var shape = '', side = 'font-size="15" font-weight="700" fill="var(--ink-faint)"';
    var R = LANG==='en' ? 'R' : '右', Lf = LANG==='en' ? 'L' : '左';
    if (region==='abd'){
      shape = '<path d="M46 4 C40 70 34 140 50 216 L250 216 C266 140 260 70 254 4 Z" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2"/>' +
        '<ellipse cx="150" cy="112" rx="3.5" ry="5" fill="var(--ink-faint)"/>' +
        '<circle cx="150" cy="112" r="34" fill="none" stroke="var(--ink-faint)" stroke-width="1.2" stroke-dasharray="3 5" opacity=".7"/>' +
        '<text x="22" y="117" text-anchor="middle" '+side+'>'+R+'</text><text x="278" y="117" text-anchor="middle" '+side+'>'+Lf+'</text>';
    } else if (region==='arm'){
      shape = '<path d="M122 0 L178 0 L182 216 L118 216 Z" fill="var(--surface-2)" opacity=".55"/>' +
        '<rect x="40" y="6" width="60" height="204" rx="30" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2"/>' +
        '<rect x="200" y="6" width="60" height="204" rx="30" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2"/>' +
        '<text x="70" y="160" text-anchor="middle" '+side+'>'+R+'</text><text x="230" y="160" text-anchor="middle" '+side+'>'+Lf+'</text>';
    } else {
      shape = '<path d="M58 6 Q100 -2 146 6 L136 214 L76 214 Z" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M154 6 Q200 -2 242 6 L224 214 L164 214 Z" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/>' +
        '<text x="104" y="160" text-anchor="middle" '+side+'>'+R+'</text><text x="196" y="160" text-anchor="middle" '+side+'>'+Lf+'</text>';
    }
    var dots = SITES.filter(function(s){ return s.r===region; }).map(function(s){
      var on = s.id===selected, u = used.indexOf(s.id);
      var fill = on ? 'var(--accent-deep)' : (u!==-1 ? 'color-mix(in srgb, var(--accent) 38%, var(--surface))' : 'var(--surface)');
      var stroke = on ? 'var(--accent-deep)' : (u!==-1 ? 'var(--accent)' : 'var(--ink-faint)');
      return '<g class="site-dot'+(on?' on':'')+'" data-site="'+s.id+'" role="button" tabindex="0" aria-label="'+esc(siteLabel(s.id))+'">' +
        '<circle cx="'+s.bx+'" cy="'+s.by+'" r="26" fill="transparent"/>' +
        (s.id===rec && !on ? '<circle cx="'+s.bx+'" cy="'+s.by+'" r="23" fill="none" stroke="var(--accent-deep)" stroke-width="1.6" stroke-dasharray="3 3"/>' : '') +
        '<circle cx="'+s.bx+'" cy="'+s.by+'" r="16" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2"/>' +
        (on ? '<path d="M'+(s.bx-6)+' '+s.by+' l4 4.5 l8 -9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' :
          (u!==-1 ? '<text x="'+s.bx+'" y="'+(s.by+5)+'" text-anchor="middle" font-size="13" font-weight="800" fill="var(--accent-deep)">'+(u+1)+'</text>' : '')) +
        '</g>';
    }).join('');
    return '<svg class="region-fig" viewBox="0 0 300 220" role="group">'+shape+dots+'</svg>';
  }

  // Swipe-right-to-save control. Keyboard: Enter / Space.
  function slideToSave(el, onDone){
    var knob = el.querySelector('.ss-knob'), fill = el.querySelector('.ss-fill');
    var startX = 0, x = 0, dragging = false;
    function max(){ return el.clientWidth - knob.offsetWidth - 8; }
    function set(v, anim){
      x = Math.max(0, Math.min(max(), v));
      knob.style.transition = fill.style.transition = anim ? 'transform .2s ease, width .2s ease' : 'none';
      knob.style.transform = 'translateX('+x+'px)';
      fill.style.width = x>0 ? (x + knob.offsetWidth + 8) + 'px' : '0';
    }
    function finish(){
      if (x >= max()*0.82){ set(max(), true); if (onDone() === false) setTimeout(function(){ set(0, true); }, 260); }
      else set(0, true);
    }
    knob.addEventListener('pointerdown', function(e){ dragging = true; startX = e.clientX - x; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
    knob.addEventListener('pointermove', function(e){ if (dragging) set(e.clientX - startX, false); });
    knob.addEventListener('pointerup', function(){ if (!dragging) return; dragging = false; finish(); });
    knob.addEventListener('pointercancel', function(){ dragging = false; set(0, true); });
    el.addEventListener('keydown', function(e){ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); set(max(), true); if (onDone() === false) setTimeout(function(){ set(0, true); }, 260); } });
    set(0, false);
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
    camera:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="14" r="3.5"/></svg>',
    chat:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>',
    edit:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    down:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 9v8H9"/></svg>'
  };
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
    var spent = spendTotal();
    var perKg = (lost>0.05 && spent>0) ? (spent/lost) : null;
    var chartPts = mem.weights.map(function(w){ return {date:w.date, value:w.weightKg}; }).slice(-30);

    var banner = (mem.profile.seeded && !demoBannerDismissed) ?
      '<div class="banner"><span>'+esc(L('home_banner'))+'</span><button id="dismissBanner">'+esc(L('home_bannerBtn'))+'</button></div>' : '';

    document.getElementById('view-home').innerHTML =
      banner +
      '<div class="hero">' +
        '<div class="cd-chip'+(cd<0?' overdue':'')+'"><b>'+Math.abs(cd)+'</b><small>'+esc(L('days_unit'))+'</small><div>'+esc(cd<0?L('home_overdueShort'):L('home_cdShort'))+'</div></div>' +
        '<div class="eyebrow">'+ICON.down+esc(L('home_lost'))+'</div>' +
        '<div class="big">'+ (lost>=0?'−':'+') + kgShort(Math.abs(lost)) + '<span>kg</span></div>' +
        '<div class="sub">' + esc(lost>0.05 ? L('home_cheer') : L('home_cheerStart')) + '</div>' +
        '<div class="bar"><i style="width:'+pct.toFixed(0)+'%"></i></div>' +
        '<div class="bar-labels"><span>'+kgShort(mem.profile.startWeight)+'kg</span><span>'+esc(L('home_toGoal',{x:kgShort(goalDist)}))+'</span><span>'+kgShort(mem.profile.goalWeight)+'kg</span></div>' +
        '<img class="hero-cat" src="cat.webp?v=1" alt="" aria-hidden="true" onerror="this.remove()">' +
      '</div>' +
      '<div class="card">' +
        '<h2>'+esc(L('home_trendTitle'))+'</h2>' +
        '<p class="card-sub">'+esc(L('home_chartSub',{n:chartPts.length}))+'</p>' +
        lineChart(chartPts, {goal:mem.profile.goalWeight}) +
      '</div>' +
      '<div class="action-row">' +
        '<button class="btn" id="quickShot">'+ICON.syringe+esc(L('home_quickShot').replace('＋ ',''))+'</button>' +
        '<button class="btn primary" id="quickWeight">'+ICON.plus+esc(L('home_quickWeight').replace('＋ ',''))+'</button>' +
        '<button class="btn icon-only" id="quickShare" aria-label="'+esc(L('share_title'))+'">'+ICON.share+'</button>' +
      '</div>' +
      '<div class="stat-row">' +
        '<div class="stat-tile"><div class="label">'+esc(L('streak_label'))+'</div><div class="value teal">'+streak+'<small>'+esc(L('days_unit'))+'</small></div></div>' +
        '<div class="stat-tile"><div class="label">'+esc(L('bmi_label'))+'</div><div class="value accent">'+(bmi?bmi.toFixed(1):'—')+'</div></div>' +
        '<div class="stat-tile tappable" id="perKgTile" role="button" tabindex="0"><div class="label">'+esc(L('perkg_label'))+'</div><div class="value">'+(perKg!=null?('<small>$</small>'+Math.round(perKg).toLocaleString('en-US')):'—')+'</div></div>' +
      '</div>';

    var bn = document.getElementById('dismissBanner');
    if (bn) bn.onclick = function(){ demoBannerDismissed = true; renderHome(); };
    document.getElementById('quickShot').onclick = openInjectionForm;
    document.getElementById('quickWeight').onclick = openWeightForm;
    document.getElementById('quickShare').onclick = openShareSheet;
    document.getElementById('perKgTile').onclick = function(){ switchView('ledger'); };
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

    var hasWaist = mem.weights.some(function(w){ return w.waistCm!=null; });
    var cols = hasWaist ? 9 : 8;
    var rows = '', lastMonth = '';
    mem.weights.slice().reverse().forEach(function(w){
      var m = w.date.slice(0,7);
      if (m!==lastMonth){ lastMonth = m; rows += '<tr class="month"><td colspan="'+cols+'">'+esc(monthHead(w.date))+'</td></tr>'; }
      rows += '<tr><td><b>'+(+w.date.slice(8,10))+'</b> '+esc(LANG==='en'?'':'日')+'</td><td class="num strong">'+fmtKg(w.weightKg)+'</td>' +
        '<td class="num">'+(w.fatPercent!=null?fmtKg(w.fatPercent):'—')+'</td>' +
        '<td class="num">'+(w.fatKg!=null?fmtKg(w.fatKg):'—')+'</td>' +
        '<td class="num">'+(w.muscleKg!=null?fmtKg(w.muscleKg):'—')+'</td>' +
        '<td class="num">'+(w.visceralFat!=null?w.visceralFat:'—')+'</td>' +
        '<td class="num">'+(w.score!=null?w.score:'—')+'</td>' +
        (hasWaist ? '<td class="num">'+(w.waistCm!=null?fmtKg(w.waistCm):'—')+'</td>' : '') +
        '<td class="row-actions"><button class="icon-btn" aria-label="'+esc(L('a11y_delete'))+'" data-del-weight="'+w.id+'">'+ICON.trash+'</button></td></tr>';
    });
    if (!rows) rows = '<tr class="empty-row"><td colspan="'+cols+'">'+esc(L('empty_weight'))+'</td></tr>';

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
        '<button class="btn icon-only" id="weightShare" aria-label="'+esc(L('share_title'))+'">'+ICON.share+'</button>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h2>'+esc(L('weight_recordsTitle',{n:''}).trim())+' <span class="muted num">'+mem.weights.length+'</span></h2></div>' +
        '<div class="table-scroll"><table class="rec"><thead><tr><th>'+esc(L('th_date'))+'</th><th>'+esc(L('th_weight'))+'kg</th><th>'+esc(L('th_fatPercent'))+'</th><th>'+esc(L('th_fat'))+'kg</th><th>'+esc(L('th_muscle'))+'kg</th><th>'+esc(L('th_visceral'))+'</th><th>'+esc(L('th_score'))+'</th>'+(hasWaist?'<th>'+esc(L('th_waist'))+'</th>':'')+'<th></th></tr></thead><tbody>'+rows+'</tbody></table></div>' +
      '</div>';

    document.getElementById('addWeightBtn').onclick = openWeightForm;
    document.getElementById('weightShare').onclick = openShareSheet;
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
        '<div><div class="site">'+esc(siteLabel(r.site))+'</div><div class="when">'+esc(fmtYMD(r.date).replace(/^\d+年/,''))+esc(L('dow_paren',{d:dowOf(r.date)}))+(r.time?' '+esc(r.time):'')+'</div></div>' +
        '<div class="dose">'+fmtDose(r.doseMg)+'<small>mg</small>'+(r.medication?'<em>'+esc(medLabel(r.medication))+'</em>':'')+'</div>' +
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
          '<div class="field"><label>'+esc(L('settings_spend'))+'</label><input id="f-spend" type="number" inputmode="decimal" value="'+p.totalSpend+'"'+(mem.purchases.length?' disabled':'')+'></div>' +
        '</div>' +
        (mem.purchases.length ? '<div class="note" style="margin:-6px 0 8px">'+esc(L('settings_spendLedger'))+'</div>' : '') +
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
        '<input type="file" id="importFileInput" accept=".json,application/json,text/plain,.txt" hidden>' +
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

    // The settings page is redrawn after a restore, so the message goes on the new element.
    function showBackupMsg(t){ var el = document.getElementById('backupMsg'); if (el){ el.style.color='var(--teal)'; el.textContent=t; } }
    function refreshAll(){ renderHome(); renderWeight(); renderShot(); renderLedger(); }

    document.getElementById('exportFileBtn').onclick = function(){
      var btn = this, orig = btn.textContent;
      btn.textContent = L('msg_processing');
      exportBackupFile().then(function(res){
        btn.textContent = res.mode==='cancelled' ? orig : !res.ok ? L('msg_exportFailed') : (res.mode==='share' ? L('msg_exportedShare') : res.mode==='file' ? L('msg_exportedFile') : L('msg_exportedClipboard'));
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
        confirmInline(msg, L('msg_detected',backupCounts(obj)), L('msg_confirmRestore'), function(){
          restoreFromBackup(obj).then(function(){
            LANG = mem.profile.lang || LANG;
            updateNavLabels(); updateDayBadge(); refreshAll(); renderSettings();
            showBackupMsg(L('msg_restored',backupCounts(mem)));
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
      confirmInline(msg, L('msg_detected',backupCounts(obj)), L('msg_confirmRestore'), function(){
        restoreFromBackup(obj).then(function(){
          LANG = mem.profile.lang || LANG;
          updateNavLabels(); updateDayBadge(); refreshAll(); renderSettings();
          showBackupMsg(L('msg_restored',backupCounts(mem)));
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
    var fatUnit = mem.profile.fatUnit==='pct' ? 'pct' : 'kg';
    var muscleUnit = mem.profile.muscleUnit==='pct' ? 'pct' : 'kg';
    // Custom items the user tracked last time come back as empty rows, so repeat entries are one tap.
    var lastCustom = [];
    for (var i=mem.weights.length-1;i>=0;i--){ if (Array.isArray(mem.weights[i].custom) && mem.weights[i].custom.length){ lastCustom = mem.weights[i].custom; break; } }

    function unitSeg(id, unit){
      return '<div class="mini-seg" id="'+id+'"><button type="button" data-u="kg" class="'+(unit==='kg'?'active':'')+'">kg</button><button type="button" data-u="pct" class="'+(unit==='pct'?'active':'')+'">%</button></div>';
    }
    function customRow(name){
      return '<div class="custom-row"><input class="cr-name" placeholder="'+esc(L('wf_customName'))+'" value="'+esc(name||'')+'">' +
        '<input class="cr-val" type="number" inputmode="decimal" step="0.1" placeholder="'+esc(L('wf_customVal'))+'">' +
        '<button type="button" class="icon-btn cr-del" aria-label="'+esc(L('a11y_delete'))+'">✕</button></div>';
    }

    sheetBody.innerHTML =
      sheetHead(L('wf_title')) +
      (aiAvailable ?
        '<input type="file" id="wf-ai-input" accept="'+esc((sampleImgLimits.images.mediaTypes||['image/*']).join(','))+'" hidden>' +
        '<button class="btn ghost block" id="wf-ai-btn" type="button">'+ICON.camera+' '+esc(L('wf_aiImportBtn'))+'</button>' +
        '<div class="note" id="wf-ai-msg" style="margin:8px 0 4px;min-height:14px"></div>'
      : '') +
      '<div class="fcard"><div class="fc-title">'+esc(L('sf_when'))+'</div>' +
        '<div class="dt-row"><input type="date" id="wf-date" value="'+todayISO+'"><input type="time" id="wf-time" value="'+nowHM()+'"></div></div>' +
      '<div class="fcard"><div class="fc-title">'+esc(L('wf_weightLabel'))+'<b class="req">*</b></div>' +
        '<div class="unit-input big"><input type="number" inputmode="decimal" id="wf-weight" step="0.1" placeholder="'+esc(L('wf_weightPh'))+'"><span>kg</span></div></div>' +
      '<div class="fcard-row">' +
        '<div class="fcard"><div class="fc-title">'+esc(L('wf_fatMass'))+unitSeg('wf-fat-unit', fatUnit)+'</div>' +
          '<div class="unit-input"><input type="number" inputmode="decimal" id="wf-fat" step="0.1" placeholder="—"><span id="wf-fat-u">'+(fatUnit==='kg'?'kg':'%')+'</span></div></div>' +
        '<div class="fcard"><div class="fc-title">'+esc(L('wf_muscleMass'))+unitSeg('wf-muscle-unit', muscleUnit)+'</div>' +
          '<div class="unit-input"><input type="number" inputmode="decimal" id="wf-muscle" step="0.1" placeholder="—"><span id="wf-muscle-u">'+(muscleUnit==='kg'?'kg':'%')+'</span></div></div>' +
      '</div>' +
      '<button class="more-btn" id="wf-more" type="button" aria-expanded="false">'+esc(L('wf_more'))+' <span>▾</span></button>' +
      '<div id="wf-more-box" hidden>' +
        '<div class="fcard">' +
          '<div class="field-row">' +
            '<div class="field"><label>'+esc(L('wf_visceralFat'))+'</label><input type="number" inputmode="decimal" id="wf-visceral" step="1"></div>' +
            '<div class="field"><label>'+esc(L('wf_waist'))+'</label><input type="number" inputmode="decimal" id="wf-waist" step="0.1"></div>' +
          '</div>' +
          '<div class="field-row">' +
            '<div class="field"><label>'+esc(L('wf_lean'))+'</label><input type="number" inputmode="decimal" id="wf-lean" step="0.1"></div>' +
            '<div class="field"><label>'+esc(L('wf_score'))+'</label><input type="number" inputmode="numeric" id="wf-score" step="1"></div>' +
          '</div>' +
          '<div id="wf-custom">'+lastCustom.map(function(c){ return customRow(c.name); }).join('')+'</div>' +
          '<button class="link-btn" id="wf-add-custom" type="button">＋ '+esc(L('wf_addCustom'))+'</button>' +
        '</div>' +
      '</div>' +
      '<div class="note" id="wf-msg" style="min-height:14px;color:var(--warn)"></div>' +
      '<div class="sheet-foot two"><button class="btn" id="wf-cancel" type="button">'+esc(L('btn_cancel'))+'</button><button class="btn primary" id="wf-save" type="button">'+esc(L('btn_save'))+'</button></div>';
    overlay.classList.add('open');
    sheetBody.scrollTop = 0;
    document.getElementById('closeSheet').onclick = closeSheet;
    document.getElementById('wf-cancel').onclick = closeSheet;

    function bindUnit(segId, labelId, set){
      document.querySelectorAll('#'+segId+' button').forEach(function(b){
        b.onclick = function(){
          var u = this.getAttribute('data-u'); set(u);
          document.querySelectorAll('#'+segId+' button').forEach(function(x){ x.classList.toggle('active', x===b); });
          document.getElementById(labelId).textContent = u==='kg' ? 'kg' : '%';
        };
      });
    }
    bindUnit('wf-fat-unit', 'wf-fat-u', function(u){ fatUnit = u; });
    bindUnit('wf-muscle-unit', 'wf-muscle-u', function(u){ muscleUnit = u; });

    function openMore(){
      document.getElementById('wf-more-box').hidden = false;
      document.getElementById('wf-more').setAttribute('aria-expanded','true');
      document.getElementById('wf-more').classList.add('open');
    }
    document.getElementById('wf-more').onclick = function(){
      var box = document.getElementById('wf-more-box');
      if (box.hidden) openMore();
      else { box.hidden = true; this.setAttribute('aria-expanded','false'); this.classList.remove('open'); }
    };
    function bindCustom(){
      document.querySelectorAll('#wf-custom .cr-del').forEach(function(b){ b.onclick = function(){ this.parentNode.remove(); }; });
    }
    document.getElementById('wf-add-custom').onclick = function(){
      document.getElementById('wf-custom').insertAdjacentHTML('beforeend', customRow(''));
      bindCustom();
      var rows = document.querySelectorAll('#wf-custom .cr-name'); rows[rows.length-1].focus();
    };
    bindCustom();

    function setUnit(segId, labelId, u){
      var b = document.querySelector('#'+segId+' [data-u="'+u+'"]'); if (b) b.click();
    }
    function fillFromExtract(obj){
      if (obj.date) document.getElementById('wf-date').value = obj.date;
      if (obj.weightKg!=null) document.getElementById('wf-weight').value = obj.weightKg;
      if (obj.fatKg!=null){ setUnit('wf-fat-unit','wf-fat-u','kg'); document.getElementById('wf-fat').value = obj.fatKg; }
      else if (obj.fatPercent!=null){ setUnit('wf-fat-unit','wf-fat-u','pct'); document.getElementById('wf-fat').value = obj.fatPercent; }
      if (obj.muscleKg!=null){ setUnit('wf-muscle-unit','wf-muscle-u','kg'); document.getElementById('wf-muscle').value = obj.muscleKg; }
      if (obj.visceralFat!=null) document.getElementById('wf-visceral').value = obj.visceralFat;
      if (obj.score!=null) document.getElementById('wf-score').value = obj.score;
      if (obj.visceralFat!=null || obj.score!=null) openMore();
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
      if (!(v>0)){ document.getElementById('wf-msg').textContent = L('wf_needWeight'); document.getElementById('wf-weight').focus(); return; }
      function numOrNull(id){ var el = document.getElementById(id); return el.value!=='' && isFinite(+el.value) ? +el.value : null; }
      function r1(n){ return Math.round(n*10)/10; }
      var fat = numOrNull('wf-fat'), muscle = numOrNull('wf-muscle');
      var custom = [];
      document.querySelectorAll('#wf-custom .custom-row').forEach(function(row){
        var name = row.querySelector('.cr-name').value.trim(), val = row.querySelector('.cr-val').value;
        if (name && val!=='' && isFinite(+val)) custom.push({name:name.slice(0,20), value:+val});
      });
      var rec = {
        date: document.getElementById('wf-date').value || todayISO,
        time: document.getElementById('wf-time').value || '',
        weightKg: v,
        // Both kg and % are kept so the table and charts work whichever one was typed.
        fatKg: fat==null ? null : (fatUnit==='kg' ? fat : r1(v*fat/100)),
        fatPercent: fat==null ? null : (fatUnit==='pct' ? fat : r1(fat/v*100)),
        muscleKg: muscle==null ? null : (muscleUnit==='kg' ? muscle : r1(v*muscle/100)),
        musclePercent: muscle==null ? null : (muscleUnit==='pct' ? muscle : r1(muscle/v*100)),
        visceralFat: numOrNull('wf-visceral'),
        waistCm: numOrNull('wf-waist'),
        leanKg: numOrNull('wf-lean'),
        score: numOrNull('wf-score')
      };
      if (custom.length) rec.custom = custom;
      mem.profile.fatUnit = fatUnit; mem.profile.muscleUnit = muscleUnit;
      addWeight(rec).then(function(){
        closeSheet(); renderHome(); renderWeight(); updateDayBadge();
      });
    };
  }

  function medSeg(id, med){
    return '<div class="seg med-seg" id="'+id+'">' + Object.keys(MEDS).map(function(k){
      return '<button type="button" data-med="'+k+'" class="'+(k===med?'active':'')+'">'+esc(medLabel(k))+'</button>';
    }).join('') + '</div>';
  }
  function sheetHead(title, extra){
    return '<div class="sheet-head"><h3>'+esc(title)+'</h3><button id="closeSheet" type="button" aria-label="close">✕</button>' +
      (extra ? '<div class="head-extra">'+extra+'</div>' : '') + '</div>';
  }

  function openInjectionForm(){
    var med = defaultMed();
    var li = latestInjection();
    var region = li ? regionOf(li.site) : 'abd';
    var site = recommendedSite(region);
    var dose = lastDoseFor(med);
    var custom = dose!=null && MEDS[med].indexOf(dose)===-1;

    sheetBody.innerHTML =
      sheetHead(L('sf_title'), medSeg('sf-med', med)) +
      '<div class="fcard"><div class="fc-title">'+esc(L('sf_when'))+'</div>' +
        '<div class="dt-row"><input type="date" id="sf-date" value="'+todayISO+'"><input type="time" id="sf-time" value="'+nowHM()+'"></div></div>' +
      '<div class="fcard"><div class="fc-title">'+esc(L('sf_dose'))+'<span class="fc-aside" id="sf-med-name"></span></div>' +
        '<div class="chip-grid" id="sf-doses"></div>' +
        '<div class="unit-input" id="sf-custom-box" hidden><input type="number" inputmode="decimal" id="sf-dose" step="0.05" placeholder="'+esc(L('sf_dosePh'))+'"><span>mg</span></div></div>' +
      '<div class="fcard"><div class="fc-title">'+esc(L('sf_site'))+'<span class="fc-aside site-name" id="sf-site-name"></span></div>' +
        '<div class="seg" id="sf-region">'+REGIONS.map(function(r){ return '<button type="button" data-region="'+r+'">'+esc(L('region_'+r))+'</button>'; }).join('')+'</div>' +
        '<div id="sf-fig"></div>' +
        '<div class="fig-key"><span><i class="k-used"></i>'+esc(L('sf_keyUsed'))+'</span><span><i class="k-rec"></i>'+esc(L('sf_keyRec'))+'</span></div>' +
        '<div class="note" id="sf-navel">'+esc(L('shot_navelNote'))+'</div></div>' +
      '<div class="note" id="sf-msg" style="min-height:14px;color:var(--warn)"></div>' +
      '<div class="sheet-foot"><div class="slide-save" id="sf-slide" tabindex="0" role="button" aria-label="'+esc(L('sf_slide'))+'">' +
        '<div class="ss-fill"></div><span class="ss-text">'+esc(L('sf_slide'))+' ›››</span><div class="ss-knob">'+ICON.syringe+'</div></div></div>';
    overlay.classList.add('open');
    sheetBody.scrollTop = 0;
    document.getElementById('closeSheet').onclick = closeSheet;

    function drawDoses(){
      var list = MEDS[med];
      document.getElementById('sf-doses').innerHTML = list.map(function(d){
        return '<button type="button" class="chip'+(!custom && dose===d?' on':'')+'" data-dose="'+d+'">'+fmtDose(d)+'</button>';
      }).join('') + '<button type="button" class="chip'+(custom?' on':'')+'" data-dose="custom">'+esc(L('sf_custom'))+'</button>';
      document.getElementById('sf-custom-box').hidden = !custom;
      if (custom && dose!=null) document.getElementById('sf-dose').value = fmtDose(dose);
      document.getElementById('sf-med-name').textContent = medLabel(med);
      document.querySelectorAll('#sf-doses [data-dose]').forEach(function(b){
        b.onclick = function(){
          var v = this.getAttribute('data-dose');
          if (v==='custom'){ custom = true; drawDoses(); document.getElementById('sf-dose').focus(); }
          else { custom = false; dose = +v; drawDoses(); }
        };
      });
    }
    function drawSite(){
      document.querySelectorAll('#sf-region button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-region')===region); });
      document.getElementById('sf-fig').innerHTML = regionFigure(region, site);
      document.getElementById('sf-site-name').textContent = site ? siteLabel(site) : '';
      document.getElementById('sf-navel').hidden = region!=='abd';
      document.querySelectorAll('#sf-fig [data-site]').forEach(function(g){
        g.onclick = function(){ site = this.getAttribute('data-site'); drawSite(); };
        g.onkeydown = function(e){ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); this.onclick(); } };
      });
    }
    document.querySelectorAll('#sf-med button').forEach(function(b){
      b.onclick = function(){
        med = this.getAttribute('data-med');
        document.querySelectorAll('#sf-med button').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-med')===med); });
        dose = lastDoseFor(med); custom = dose!=null && MEDS[med].indexOf(dose)===-1;
        drawDoses();
      };
    });
    document.querySelectorAll('#sf-region button').forEach(function(b){
      b.onclick = function(){
        region = this.getAttribute('data-region');
        if (regionOf(site)!==region) site = recommendedSite(region);
        drawSite();
      };
    });
    drawDoses(); drawSite();

    slideToSave(document.getElementById('sf-slide'), function(){
      var msgEl = document.getElementById('sf-msg');
      var d = custom ? +document.getElementById('sf-dose').value : dose;
      if (!(d>0)){ msgEl.textContent = L('sf_needDose'); if (custom) document.getElementById('sf-dose').focus(); return false; }
      if (!site){ msgEl.textContent = L('sf_needSite'); return false; }
      addInjection({
        date: document.getElementById('sf-date').value || todayISO,
        time: document.getElementById('sf-time').value || '',
        medication: med,
        doseMg: d,
        site: site
      }).then(function(){
        closeSheet(); renderHome(); renderShot(); setTitle(currentView);
      });
    });
  }


  /* ---------- 帳本 (ledger) ---------- */
  function purchaseDoseText(p){
    return (p.items||[]).filter(function(it){ return +it.qty>0; }).map(function(it){ return fmtDose(+it.doseMg)+'mg×'+it.qty; }).join('、') || '—';
  }
  function renderLedger(){
    var total = spendTotal();
    var units = mem.purchases.reduce(function(a,p){ return a + purchaseQty(p); }, 0);
    var month = todayISO.slice(0,7);
    var monthSpend = mem.purchases.filter(function(p){ return p.date.slice(0,7)===month; }).reduce(function(a,p){ return a + (+p.price||0); }, 0);
    var lost = kgLost();
    var perKg = (lost>0.05 && total>0) ? total/lost : null;
    var perShot = (mem.injections.length && total>0) ? total/mem.injections.length : null;
    var first = mem.purchases.length ? mem.purchases[0].date : (mem.weights.length ? mem.weights[0].date : mem.profile.startDate);

    var rows = '', lastMonth = '';
    mem.purchases.slice().reverse().forEach(function(p){
      var m = p.date.slice(0,7);
      if (m!==lastMonth){ lastMonth = m; rows += '<li class="month">'+esc(monthHead(p.date))+'</li>'; }
      rows += '<li class="buy-row"><div class="b-date num">'+esc(fmtMD(p.date))+'</div>' +
        '<div class="b-dose"><small>'+esc(medLabel(p.medication))+'</small>'+esc(purchaseDoseText(p))+'</div>' +
        '<div class="b-price num">'+money(+p.price||0)+'</div>' +
        '<div class="b-place">'+esc(p.place||'—')+'</div>' +
        '<button class="icon-btn" aria-label="'+esc(L('a11y_delete'))+'" data-del-buy="'+p.id+'">'+ICON.trash+'</button></li>';
    });
    if (!rows) rows = '<li class="empty">'+esc(L('ledger_empty'))+'</li>';

    document.getElementById('view-ledger').innerHTML =
      '<div class="hero ledger-hero">' +
        '<div class="eyebrow">'+esc(L('ledger_total'))+'</div>' +
        '<div class="big">'+money(total).replace('$','<span class="cur">$</span>')+'</div>' +
        '<div class="sub">'+esc(L('ledger_since',{d:fmtYMD(first)}))+'</div>' +
        '<div class="lh-foot"><div class="lh-stat"><small>'+esc(L('ledger_units'))+'</small><b class="num">'+units+'</b>'+esc(L('ledger_unit'))+
          (units ? '<em>'+esc(L('ledger_avg'))+' '+money(total/units)+'</em>' : '')+'</div>' +
          '<button class="lh-btn" id="addBuyBtn" type="button">'+ICON.plus+esc(L('ledger_add'))+'</button></div>' +
        (mem.purchases.length || !(+mem.profile.totalSpend) ? '' : '<div class="lh-note">'+esc(L('ledger_fromSettings'))+'</div>') +
      '</div>' +
      '<div class="stat-row">' +
        '<div class="stat-tile"><div class="label">'+esc(L('ledger_month'))+'</div><div class="value">'+(monthSpend?('<small>$</small>'+Math.round(monthSpend).toLocaleString('en-US')):'—')+'</div></div>' +
        '<div class="stat-tile"><div class="label">'+esc(L('ledger_perKg'))+'</div><div class="value teal">'+(perKg!=null?('<small>$</small>'+Math.round(perKg).toLocaleString('en-US')):'—')+'</div></div>' +
        '<div class="stat-tile"><div class="label">'+esc(L('ledger_perShot'))+'</div><div class="value accent">'+(perShot!=null?('<small>$</small>'+Math.round(perShot).toLocaleString('en-US')):'—')+'</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h2>'+esc(L('ledger_listTitle'))+' <span class="muted num">'+mem.purchases.length+'</span></h2></div>' +
        '<div class="buy-head"><span>'+esc(L('th_date'))+'</span><span>'+esc(L('ledger_colDose'))+'</span><span>'+esc(L('ledger_colPrice'))+'</span><span>'+esc(L('ledger_colPlace'))+'</span><span></span></div>' +
        '<ul class="buy-list">'+rows+'</ul>' +
      '</div>' +
      '<div class="note" style="padding:0 6px">'+esc(L('ledger_note'))+'</div>';

    document.getElementById('addBuyBtn').onclick = openPurchaseForm;
    document.querySelectorAll('[data-del-buy]').forEach(function(b){
      b.onclick = function(){ deletePurchase(this.getAttribute('data-del-buy')); renderLedger(); };
    });
  }

  function openPurchaseForm(){
    var med = defaultMed();
    var counts = {mounjaro:{}, wegovy:{}};      // per medicine: dose -> qty
    var customDose = {mounjaro:'', wegovy:''}, customQty = {mounjaro:0, wegovy:0};
    var places = [];
    mem.purchases.slice().reverse().forEach(function(p){ if (p.place && places.indexOf(p.place)===-1) places.push(p.place); });

    sheetBody.innerHTML =
      sheetHead(L('ledger_add'), medSeg('pf-med', med)) +
      '<div class="fcard"><div class="fc-title">'+esc(L('wf_date'))+'</div><div class="dt-row"><input type="date" id="pf-date" value="'+todayISO+'"></div></div>' +
      '<div class="fcard"><div class="fc-title">'+esc(L('pf_doseQty'))+'<span class="fc-aside" id="pf-med-name"></span></div><div id="pf-rows"></div></div>' +
      '<div class="fcard"><div class="fc-title">'+esc(L('pf_price'))+'<b class="req">*</b></div>' +
        '<div class="unit-input big"><span class="pre">$</span><input type="number" inputmode="decimal" id="pf-price" step="1" placeholder="0"></div></div>' +
      '<div class="fcard"><div class="fc-title">'+esc(L('pf_place'))+'</div>' +
        '<div class="unit-input"><input type="text" id="pf-place" list="pf-places" maxlength="40" placeholder="'+esc(L('pf_placePh'))+'"></div>' +
        '<datalist id="pf-places">'+places.map(function(p){ return '<option value="'+esc(p)+'">'; }).join('')+'</datalist></div>' +
      '<div class="note" id="pf-msg" style="min-height:14px;color:var(--warn)"></div>' +
      '<div class="sheet-foot two"><button class="btn" id="pf-cancel" type="button">'+esc(L('btn_cancel'))+'</button><button class="btn primary" id="pf-save" type="button">'+esc(L('btn_save'))+'</button></div>';
    overlay.classList.add('open');
    sheetBody.scrollTop = 0;
    document.getElementById('closeSheet').onclick = closeSheet;
    document.getElementById('pf-cancel').onclick = closeSheet;

    function stepper(key, qty){
      return '<div class="stepper"><button type="button" data-step="-1" data-key="'+key+'" aria-label="−"'+(qty?'':' disabled')+'>−</button>' +
        '<b class="num">'+qty+'</b><button type="button" data-step="1" data-key="'+key+'" aria-label="+">+</button></div>';
    }
    function draw(){
      var c = counts[med];
      document.getElementById('pf-med-name').textContent = medLabel(med);
      document.getElementById('pf-rows').innerHTML = MEDS[med].map(function(d){
        var q = c[d]||0;
        return '<div class="qty-row'+(q?' on':'')+'"><span class="num"><b>'+fmtDose(d)+'</b> mg</span>'+stepper(String(d), q)+'</div>';
      }).join('') +
      '<div class="qty-row custom'+(customQty[med]?' on':'')+'"><span class="custom-dose"><small>'+esc(L('sf_custom'))+'</small><input type="number" inputmode="decimal" id="pf-custom" step="0.05" placeholder="mg" value="'+esc(customDose[med])+'"></span>'+stepper('custom', customQty[med])+'</div>';
      document.getElementById('pf-custom').oninput = function(){ customDose[med] = this.value; };
      document.querySelectorAll('#pf-rows [data-step]').forEach(function(b){
        b.onclick = function(){
          var key = this.getAttribute('data-key'), step = +this.getAttribute('data-step');
          if (key==='custom') customQty[med] = Math.max(0, customQty[med]+step);
          else c[key] = Math.max(0, (c[key]||0)+step);
          draw();
        };
      });
    }
    document.querySelectorAll('#pf-med button').forEach(function(b){
      b.onclick = function(){
        med = this.getAttribute('data-med');
        document.querySelectorAll('#pf-med button').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-med')===med); });
        draw();
      };
    });
    draw();

    document.getElementById('pf-save').onclick = function(){
      var msgEl = document.getElementById('pf-msg');
      var items = MEDS[med].filter(function(d){ return counts[med][d]>0; }).map(function(d){ return {doseMg:d, qty:counts[med][d]}; });
      if (customQty[med]>0){
        var cd = +customDose[med];
        if (!(cd>0)){ msgEl.textContent = L('pf_needCustom'); document.getElementById('pf-custom').focus(); return; }
        items.push({doseMg:cd, qty:customQty[med]});
      }
      var price = +document.getElementById('pf-price').value;
      if (!items.length){ msgEl.textContent = L('pf_needQty'); return; }
      if (!(price>0)){ msgEl.textContent = L('pf_needPrice'); document.getElementById('pf-price').focus(); return; }
      addPurchase({
        date: document.getElementById('pf-date').value || todayISO,
        medication: med, items: items, price: price,
        place: document.getElementById('pf-place').value.trim().slice(0,40)
      });
      closeSheet(); renderLedger(); renderHome();
    };
  }

  /* ---------- share card ---------- */
  var catImg = null;
  function loadCat(){
    if (catImg) return catImg;
    catImg = new Promise(function(resolve){
      var im = new Image(); im.onload = function(){ resolve(im); }; im.onerror = function(){ resolve(null); }; im.src = 'cat.webp?v=1';
    });
    return catImg;
  }
  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  }
  function drawShareCard(showWeight){
    var W = 1080, H = 1350;
    var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([
      document.fonts.load('900 100px Nunito'), document.fonts.load('800 40px Nunito')
    ]).catch(function(){}) : Promise.resolve();
    return Promise.all([loadCat(), fontsReady]).then(function(res){
      var cat = res[0];
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d');
      var NUM = 'Nunito, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
      var TXT = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      var lw = latestWeight(), start = mem.profile.startWeight, cur = lw ? lw.weightKg : start;
      var lost = start - cur, pct = start ? lost/start*100 : 0;
      var days = mem.weights.length ? Math.max(1, daysBetween(mem.weights[0].date, todayISO)) : 1;
      var firstDate = mem.weights.length ? mem.weights[0].date : mem.profile.startDate;

      var g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#E39A86'); g.addColorStop(1, '#C26A58');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.09)';
      ctx.beginPath(); ctx.arc(980, 120, 260, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(80, 560, 140, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textBaseline = 'alphabetic';
      ctx.font = '800 40px '+TXT; ctx.textAlign = 'left'; ctx.fillText(L('title_home'), 80, 120);
      ctx.font = '800 38px '+NUM; ctx.textAlign = 'right'; ctx.fillText(todayISO.replace(/-/g,'.'), W-80, 120);

      ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
      ctx.font = '700 46px '+TXT; ctx.fillText(L('share_day',{n:days}), 80, 236);
      ctx.font = '900 210px '+NUM;
      var bigTxt = (lost>=0?'−':'+') + kgShort(Math.abs(lost));
      ctx.fillText(bigTxt, 72, 430);
      var bw = ctx.measureText(bigTxt).width;
      ctx.font = '800 72px '+NUM; ctx.globalAlpha = .85; ctx.fillText('kg', 72+bw+16, 430); ctx.globalAlpha = 1;

      // pill: cumulative %
      var pill = L('share_pct',{p:(lost>=0?'−':'+')+Math.abs(pct).toFixed(1)});
      ctx.font = '800 40px '+TXT; var pw = ctx.measureText(pill).width + 56;
      ctx.fillStyle = 'rgba(255,255,255,.22)'; roundRect(ctx, 80, 470, pw, 70, 35); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(pill, 108, 518);

      // chart card
      var cx = 64, cy = 600, cw = W-128, ch = 590;
      ctx.fillStyle = '#FFFFFF'; roundRect(ctx, cx, cy, cw, ch, 48); ctx.fill();
      ctx.fillStyle = '#2A211F'; ctx.font = '800 40px '+TXT; ctx.fillText(L('home_trendTitle'), cx+48, cy+86);
      if (showWeight){
        ctx.fillStyle = '#C46C5A'; ctx.font = '900 40px '+NUM; ctx.textAlign = 'right';
        ctx.fillText(kgShort(start)+' → '+kgShort(cur)+' kg', cx+cw-48, cy+86); ctx.textAlign = 'left';
      }
      var pts = mem.weights.slice(-60);
      var px0 = cx+ (showWeight?120:56), px1 = cx+cw-56, py0 = cy+140, py1 = cy+ch-110;
      if (pts.length){
        var xs = pts.map(function(p){ return new Date(p.date).getTime(); });
        var ys = pts.map(function(p){ return p.weightKg; });
        var xMin = Math.min.apply(null,xs), xMax = Math.max.apply(null,xs), yMin = Math.min.apply(null,ys), yMax = Math.max.apply(null,ys);
        if (xMin===xMax){ xMin -= 86400000; xMax += 86400000; }
        if (yMin===yMax){ yMin -= 1; yMax += 1; }
        var pad = (yMax-yMin)*.12; yMin -= pad; yMax += pad;
        var X = function(x){ return px0 + (x-xMin)/(xMax-xMin)*(px1-px0); };
        var Y = function(y){ return py1 - (y-yMin)/(yMax-yMin)*(py1-py0); };
        ctx.strokeStyle = '#F0E4DF'; ctx.lineWidth = 2;
        [0,.5,1].forEach(function(f){ var yy = py0 + (py1-py0)*f; ctx.beginPath(); ctx.moveTo(px0, yy); ctx.lineTo(px1, yy); ctx.stroke(); });
        if (showWeight){
          ctx.fillStyle = '#AC9C97'; ctx.font = '700 30px '+NUM; ctx.textAlign = 'right';
          ctx.fillText(Math.round(yMax), px0-18, py0+10); ctx.fillText(Math.round(yMin), px0-18, py1+10); ctx.textAlign = 'left';
        }
        var ag = ctx.createLinearGradient(0, py0, 0, py1); ag.addColorStop(0, 'rgba(217,130,111,.30)'); ag.addColorStop(1, 'rgba(217,130,111,0)');
        ctx.beginPath(); pts.forEach(function(p,i){ var x = X(xs[i]), y = Y(p.weightKg); if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y); });
        ctx.lineTo(X(xs[xs.length-1]), py1); ctx.lineTo(X(xs[0]), py1); ctx.closePath(); ctx.fillStyle = ag; ctx.fill();
        ctx.beginPath(); pts.forEach(function(p,i){ var x = X(xs[i]), y = Y(p.weightKg); if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y); });
        ctx.strokeStyle = '#D9826F'; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
        var lx = X(xs[xs.length-1]), ly = Y(ys[ys.length-1]);
        ctx.beginPath(); ctx.arc(lx, ly, 14, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 7; ctx.stroke();
      }
      ctx.fillStyle = '#7B6B66'; ctx.font = '700 32px '+NUM;
      ctx.textAlign = 'left'; ctx.fillText(L('share_start')+' '+firstDate.replace(/-/g,'.'), cx+48, cy+ch-44);
      ctx.textAlign = 'right'; ctx.fillText(L('share_today')+' '+todayISO.replace(/-/g,'.'), cx+cw-48, cy+ch-44);

      if (cat){ var cwid = 400, chei = cwid*cat.height/cat.width; ctx.drawImage(cat, W-80-cwid, cy-chei+18, cwid, chei); }

      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = '700 34px '+TXT;
      ctx.fillText(L('share_footer'), W/2, H-62);
      return c;
    });
  }
  function canvasBlob(c){ return new Promise(function(res){ c.toBlob(function(b){ res(b); }, 'image/png'); }); }

  function openShareSheet(){
    var show = !!mem.profile.shareShowWeight;
    var blob = null;
    sheetBody.innerHTML =
      sheetHead(L('share_title')) +
      '<p class="share-sub">'+esc(L('share_sub'))+'</p>' +
      '<div class="share-preview"><img id="shareImg" alt="'+esc(L('share_title'))+'"></div>' +
      '<div class="toggle"><div><div class="t-label">'+esc(L('share_showWeight'))+'</div><div class="t-sub">'+esc(L('share_showWeightSub'))+'</div></div>' +
        '<div class="switch'+(show?' on':'')+'" id="shareToggle" role="switch" aria-checked="'+show+'" tabindex="0"><i></i></div></div>' +
      '<div class="note" id="shareMsg" style="min-height:14px"></div>' +
      '<div class="sheet-foot two"><button class="btn" id="shareSave" type="button">'+esc(L('share_save'))+'</button><button class="btn primary" id="shareGo" type="button">'+ICON.share+esc(L('share_go'))+'</button></div>';
    overlay.classList.add('open');
    sheetBody.scrollTop = 0;
    document.getElementById('closeSheet').onclick = closeSheet;
    var msg = function(t){ document.getElementById('shareMsg').textContent = t||''; };

    function refresh(){
      blob = null;
      drawShareCard(show).then(function(c){
        var img = document.getElementById('shareImg');
        if (img) img.src = c.toDataURL('image/png');
        return canvasBlob(c);
      }).then(function(b){ blob = b; });
    }
    function ready(){ return blob ? Promise.resolve(blob) : drawShareCard(show).then(canvasBlob).then(function(b){ blob = b; return b; }); }
    function download(b){
      var url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = 'zhenyaozhi-'+todayISO+'.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    }
    var tg = document.getElementById('shareToggle');
    tg.onclick = function(){
      show = !show; this.classList.toggle('on', show); this.setAttribute('aria-checked', String(show));
      saveProfile({shareShowWeight:show}); refresh();
    };
    tg.onkeydown = function(e){ if (e.key==='Enter' || e.key===' '){ e.preventDefault(); this.onclick(); } };
    document.getElementById('shareSave').onclick = function(){
      ready().then(function(b){ download(b); msg(L('share_saved')); });
    };
    document.getElementById('shareGo').onclick = function(){
      ready().then(function(b){
        var file = new File([b], 'zhenyaozhi-'+todayISO+'.png', {type:'image/png'});
        if (navigator.canShare && navigator.canShare({files:[file]})){
          return navigator.share({files:[file], text:L('share_text')}).catch(function(e){ if (!e || e.name!=='AbortError') msg(L('share_failed')); });
        }
        download(b); msg(L('share_noShare'));
      });
    };
    refresh();
  }

  /* ---------- diet (飲食) ---------- */
  var dietDate = todayISO;
  var MEAL_KEYS = ['breakfast','lunch','dinner','snack'];
  var MEAL_ICON = {breakfast:'🌅', lunch:'☀️', dinner:'🌙', snack:'🍪'};
  function kcalTarget(){ var t = +mem.profile.kcalTarget; return t>=800 && t<=5000 ? t : 1500; }
  // Macro targets follow a common split: protein 24%, carbs 51%, fat 25% of calories; fibre 14 g per 1000 kcal.
  function macroTargets(){
    var k = kcalTarget();
    return {protein:Math.round(k*0.24/4), carbs:Math.round(k*0.51/4), fat:Math.round(k*0.25/9), fiber:Math.round(k/1000*14)};
  }
  function mealsOn(date){ return mem.meals.filter(function(m){ return m.date===date; }); }
  function sumMeals(list){
    return list.reduce(function(a,m){ a.kcal+=+m.kcal||0; a.protein+=+m.protein||0; a.carbs+=+m.carbs||0; a.fat+=+m.fat||0; a.fiber+=+m.fiber||0; return a; }, {kcal:0,protein:0,carbs:0,fat:0,fiber:0});
  }
  function defaultMeal(){ var h = new Date().getHours(); return h<10?'breakfast':h<15?'lunch':h<21?'dinner':'snack'; }
  function addMeals(list){ list.forEach(function(m){ m.id = uuid(); mem.meals.push(m); }); writeLocalStorage(); }
  function deleteMeal(id){ mem.meals = mem.meals.filter(function(m){ return m.id!==id; }); writeLocalStorage(); }
  function isoShift(iso, days){ var d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+days); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function r1(n){ return String(Math.round(n*10)/10); }

  function dietTips(sum, tg){
    var tips = [];
    var leftP = tg.protein - sum.protein, leftK = kcalTarget() - sum.kcal;
    if (!mealsOn(dietDate).length) tips.push(L('tip_start'));
    if (leftP > 25) tips.push(L('tip_protein',{g:Math.round(leftP)}));
    if (sum.fiber < tg.fiber*0.5 && sum.kcal > 300) tips.push(L('tip_fiber'));
    if (leftK < 0) tips.push(L('tip_over',{k:Math.round(-leftK)}));
    else if (sum.kcal > 0 && leftK < 300) tips.push(L('tip_close'));
    if (sum.fat > tg.fat*1.1) tips.push(L('tip_fat'));
    tips.push(L('tip_glp1'));
    return tips.slice(0,3);
  }

  function renderDiet(){
    var tg = macroTargets(), k = kcalTarget();
    var list = mealsOn(dietDate), sum = sumMeals(list);
    var left = k - sum.kcal, pct = Math.min(100, Math.max(0, sum.kcal/k*100));
    var circ = 2*Math.PI*42;
    // week strip (Sun–Sat) containing the selected day
    var d0 = new Date(dietDate+'T00:00:00'); var sun = isoShift(dietDate, -d0.getDay());
    var days = '';
    for (var i=0;i<7;i++){
      var iso = isoShift(sun, i), on = iso===dietDate, has = mealsOn(iso).length>0;
      days += '<button class="wk-day'+(on?' on':'')+(has?' has':'')+(iso===todayISO?' today':'')+'" data-day="'+iso+'"><small>'+DOW[LANG][i]+'</small><b>'+(+iso.slice(8,10))+'</b></button>';
    }
    var bars = [['protein','🍗'],['carbs','🍞'],['fiber','🥦'],['fat','🥑']].map(function(x){
      var key = x[0], v = sum[key], t = tg[key], w = Math.min(100, t? v/t*100 : 0);
      return '<div class="mac"><div class="mac-row"><span>'+x[1]+' '+esc(L('mac_'+key))+'</span><span class="num"><b>'+r1(v)+'</b> / '+t+'g</span></div><div class="mac-bar"><i style="width:'+w.toFixed(0)+'%"></i></div></div>';
    }).join('');
    var sections = MEAL_KEYS.map(function(mk){
      var items = list.filter(function(m){ return m.meal===mk; });
      var s = sumMeals(items);
      return '<div class="card meal-card">' +
        '<div class="meal-head"><span>'+MEAL_ICON[mk]+' <b>'+esc(L('meal_'+mk))+'</b>'+(items.length?' <small class="num">'+Math.round(s.kcal)+' kcal</small>':'')+'</span><button class="link-btn" data-add-meal="'+mk+'">＋ '+esc(L('diet_add'))+'</button></div>' +
        items.map(function(m){
          return '<div class="food-row"><div><div class="food-name">'+esc(m.name)+(m.portion?' <small>'+esc(m.portion)+'</small>':'')+'</div>' +
            '<div class="food-mac">'+esc(L('mac_protein'))+' '+r1(+m.protein||0)+'g · '+esc(L('mac_carbs'))+' '+r1(+m.carbs||0)+'g · '+esc(L('mac_fat'))+' '+r1(+m.fat||0)+'g</div></div>' +
            '<div class="food-kcal num">'+Math.round(+m.kcal||0)+'<small>kcal</small></div>' +
            '<button class="icon-btn" aria-label="'+esc(L('a11y_delete'))+'" data-del-meal="'+m.id+'">'+ICON.trash+'</button></div>';
        }).join('') +
      '</div>';
    }).join('');
    var dl = new Date(dietDate+'T00:00:00');
    var dateLabel = LANG==='en' ? (MONTHS_EN[dl.getMonth()]+' '+dl.getDate()) : ((dl.getMonth()+1)+'月'+dl.getDate()+'日'+L('dow_paren',{d:DOW.zh[dl.getDay()]}));

    document.getElementById('view-diet').innerHTML =
      '<div class="card">' +
        '<div class="cal-head"><div class="m-label">'+esc(dateLabel)+'</div><div class="cal-nav"><button data-wk="-7" aria-label="prev">‹</button><button data-wk="7" aria-label="next">›</button></div></div>' +
        '<div class="wk-strip">'+days+'</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="diet-sum">' +
          '<div class="ring-wrap"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-2)" stroke-width="10"/>' +
            '<circle cx="50" cy="50" r="42" fill="none" stroke="'+(left<0?'var(--warn)':'var(--accent-deep)')+'" stroke-width="10" stroke-linecap="round" stroke-dasharray="'+(circ*pct/100).toFixed(1)+' '+circ.toFixed(1)+'" transform="rotate(-90 50 50)"/></svg>' +
            '<div class="ring-val"><b class="'+(left<0?'over':'')+'">'+Math.abs(Math.round(left))+'</b><small>'+esc(left<0?L('diet_over'):L('diet_left'))+'</small></div></div>' +
          '<div class="macs">'+bars+'</div>' +
        '</div>' +
        '<div class="diet-foot"><button class="link-btn" id="editTarget">'+esc(L('diet_target'))+' <b class="num">'+k+'</b> kcal ✎</button><span>'+esc(L('diet_eaten'))+' <b class="num">'+Math.round(sum.kcal)+'</b> kcal · '+Math.round(pct)+'%</span></div>' +
      '</div>' +
      '<div class="action-row">' +
        '<button class="btn" id="foodText">'+ICON.chat+esc(L('diet_text'))+'</button>' +
        '<button class="btn primary" id="foodPhoto">'+ICON.camera+esc(L('diet_photo'))+'</button>' +
        '<button class="btn icon-only" id="foodManual" aria-label="'+esc(L('diet_manual'))+'">'+ICON.edit+'</button>' +
      '</div>' +
      '<div class="card tips-card"><h2>'+esc(L('diet_tipsTitle'))+'</h2><ul class="tips">'+dietTips(sum, tg).map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul></div>' +
      sections;

    document.querySelectorAll('[data-day]').forEach(function(b){ b.onclick = function(){ dietDate = this.getAttribute('data-day'); renderDiet(); }; });
    document.querySelectorAll('[data-wk]').forEach(function(b){ b.onclick = function(){ dietDate = isoShift(dietDate, +this.getAttribute('data-wk')); renderDiet(); }; });
    document.querySelectorAll('[data-add-meal]').forEach(function(b){ b.onclick = function(){ openFoodSheet('photo', this.getAttribute('data-add-meal')); }; });
    document.querySelectorAll('[data-del-meal]').forEach(function(b){ b.onclick = function(){ deleteMeal(this.getAttribute('data-del-meal')); renderDiet(); }; });
    document.getElementById('foodText').onclick = function(){ openFoodSheet('text'); };
    document.getElementById('foodPhoto').onclick = function(){ openFoodSheet('photo'); };
    document.getElementById('foodManual').onclick = function(){ openFoodSheet('manual'); };
    document.getElementById('editTarget').onclick = function(){
      var v = window.prompt(L('diet_targetPrompt'), String(k));
      if (v==null) return;
      var n = Math.round(+v);
      if (n>=800 && n<=5000){ saveProfile({kcalTarget:n}).then(renderDiet); }
    };
  }

  // Shrink a photo to max 1024px JPEG so it uploads fast and stays far under Vercel's request limit.
  function photoToDataURL(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var s = Math.min(1, 1024/Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }
  function estimateFood(payload){
    var ctl = new AbortController(); var t = setTimeout(function(){ ctl.abort(); }, 45000);
    return fetch('/api/food', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload), signal:ctl.signal})
      .then(function(r){ return r.json().catch(function(){ return {ok:false, error:'http_'+r.status}; }); })
      .catch(function(e){ return {ok:false, error: e && e.name==='AbortError' ? 'timeout' : 'network'}; })
      .finally(function(){ clearTimeout(t); });
  }
  function aiErrorText(res){
    var map = {not_configured:L('ai_err_key'), rate_limited:L('ai_err_rate'), invalid_image:L('ai_err_image'), timeout:L('ai_err_timeout'), network:L('ai_err_network')};
    return map[res.error] || (L('ai_err_other') + (res.reason ? '（'+res.reason+'）' : res.error ? '（'+res.error+'）' : ''));
  }

  function openFoodSheet(mode, meal){
    meal = meal || defaultMeal();
    var pending = []; // items waiting for confirmation
    function itemsHTML(){
      if (!pending.length) return '';
      var tot = sumMeals(pending);
      return '<div class="est-list">' + pending.map(function(it, i){
        return '<div class="est-item"><div class="est-top"><input class="est-name" data-i="'+i+'" data-k="name" value="'+esc(it.name)+'">' +
          '<button class="icon-btn" data-rm="'+i+'" aria-label="'+esc(L('a11y_delete'))+'">'+ICON.trash+'</button></div>' +
          (it.portion?'<div class="est-portion">'+esc(it.portion)+'</div>':'') +
          '<div class="est-nums">' + ['kcal','protein','carbs','fat','fiber'].map(function(k){
            return '<label><span>'+esc(k==='kcal'?'kcal':L('mac_'+k))+'</span><input type="number" inputmode="decimal" data-i="'+i+'" data-k="'+k+'" value="'+(+it[k]||0)+'"></label>';
          }).join('') + '</div></div>';
      }).join('') + '<div class="est-total">'+esc(L('diet_total'))+' <b class="num">'+Math.round(tot.kcal)+'</b> kcal</div></div>' +
      '<button class="btn primary block" id="fs-save">'+esc(L('diet_saveItems',{n:pending.length}))+'</button>';
    }
    function draw(){
      var seg = '<div class="seg" id="fs-meal">'+MEAL_KEYS.map(function(mk){ return '<button data-meal="'+mk+'" class="'+(meal===mk?'active':'')+'">'+esc(L('meal_'+mk))+'</button>'; }).join('')+'</div>';
      var body = '';
      if (mode==='photo'){
        body = '<input type="file" id="fs-file" accept="image/*" capture="environment" hidden><input type="file" id="fs-album" accept="image/*" hidden>' +
          '<div class="photo-pick"><button class="btn primary" id="fs-cam">'+ICON.camera+esc(L('diet_takePhoto'))+'</button><button class="btn" id="fs-alb">'+esc(L('diet_album'))+'</button></div>' +
          '<div id="fs-preview"></div>' +
          '<div class="field"><label>'+esc(L('diet_photoHint'))+'</label><input id="fs-hint" placeholder="'+esc(L('diet_photoHintPh'))+'"></div>';
      } else if (mode==='text'){
        body = '<div class="field"><label>'+esc(L('diet_textLabel'))+'</label><textarea id="fs-text" rows="3" placeholder="'+esc(L('diet_textPh'))+'"></textarea></div>' +
          '<button class="btn primary block" id="fs-est">'+esc(L('diet_estimate'))+'</button>';
      } else {
        body = '<div class="field"><label>'+esc(L('diet_foodName'))+'</label><input id="fm-name" placeholder="'+esc(L('diet_foodNamePh'))+'"></div>' +
          '<div class="field-row"><div class="field"><label>kcal</label><input id="fm-kcal" type="number" inputmode="decimal"></div><div class="field"><label>'+esc(L('mac_protein'))+' (g)</label><input id="fm-protein" type="number" inputmode="decimal"></div></div>' +
          '<div class="field-row"><div class="field"><label>'+esc(L('mac_carbs'))+' (g)</label><input id="fm-carbs" type="number" inputmode="decimal"></div><div class="field"><label>'+esc(L('mac_fat'))+' (g)</label><input id="fm-fat" type="number" inputmode="decimal"></div><div class="field"><label>'+esc(L('mac_fiber'))+' (g)</label><input id="fm-fiber" type="number" inputmode="decimal"></div></div>' +
          '<button class="btn primary block" id="fm-save">'+esc(L('wf_save'))+'</button>';
      }
      sheetBody.innerHTML =
        '<div class="sheet-head"><h3>'+esc(L(mode==='photo'?'diet_photo':mode==='text'?'diet_text':'diet_manual'))+'</h3><button id="closeSheet">✕</button></div>' +
        seg + '<div style="height:14px"></div>' + body +
        '<div class="note" id="fs-msg" style="margin:10px 0;min-height:14px"></div>' +
        '<div id="fs-items">'+itemsHTML()+'</div>' +
        '<div class="note">'+esc(L('diet_disclaimer'))+'</div>';
      bind();
    }
    function msg(t, bad){ var el = document.getElementById('fs-msg'); el.textContent = t||''; el.style.color = bad ? 'var(--warn)' : 'var(--ink-faint)'; }
    function refreshItems(){ document.getElementById('fs-items').innerHTML = itemsHTML(); bindItems(); }
    function bindItems(){
      document.querySelectorAll('#fs-items [data-k]').forEach(function(inp){
        inp.oninput = function(){ var i = +this.getAttribute('data-i'), k = this.getAttribute('data-k'); pending[i][k] = k==='name' ? this.value : (+this.value||0);
          if (k!=='name'){ var tot = document.querySelector('.est-total b'); if (tot) tot.textContent = Math.round(sumMeals(pending).kcal); } };
      });
      document.querySelectorAll('#fs-items [data-rm]').forEach(function(b){ b.onclick = function(){ pending.splice(+this.getAttribute('data-rm'),1); refreshItems(); }; });
      var sv = document.getElementById('fs-save');
      if (sv) sv.onclick = function(){
        var keep = pending.filter(function(it){ return String(it.name).trim(); }).map(function(it){
          return {date:dietDate, meal:meal, name:String(it.name).trim(), portion:it.portion||'', kcal:+it.kcal||0, protein:+it.protein||0, carbs:+it.carbs||0, fat:+it.fat||0, fiber:+it.fiber||0, source:mode};
        });
        if (!keep.length) return;
        addMeals(keep); closeSheet(); renderDiet();
      };
    }
    function handleResult(res){
      if (!res.ok){ msg(aiErrorText(res), true); return; }
      if (!res.items || !res.items.length){ msg(res.note || L('ai_err_none'), true); return; }
      pending = res.items; msg(res.note ? (L('diet_aiDone')+' '+res.note) : L('diet_aiDone')); refreshItems();
    }
    function bind(){
      document.getElementById('closeSheet').onclick = closeSheet;
      document.querySelectorAll('#fs-meal button').forEach(function(b){ b.onclick = function(){ meal = this.getAttribute('data-meal'); document.querySelectorAll('#fs-meal button').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-meal')===meal); }); }; });
      bindItems();
      if (mode==='photo'){
        var onFile = function(e){
          var f = e.target.files && e.target.files[0]; e.target.value = '';
          if (!f) return;
          msg(L('diet_reading'));
          photoToDataURL(f).then(function(data){
            document.getElementById('fs-preview').innerHTML = '<img class="food-shot" src="'+data+'" alt="">';
            return estimateFood({image:data, text:(document.getElementById('fs-hint')||{}).value||''});
          }).then(handleResult).catch(function(){ msg(L('ai_err_image'), true); });
        };
        document.getElementById('fs-file').onchange = onFile;
        document.getElementById('fs-album').onchange = onFile;
        document.getElementById('fs-cam').onclick = function(){ document.getElementById('fs-file').click(); };
        document.getElementById('fs-alb').onclick = function(){ document.getElementById('fs-album').click(); };
      } else if (mode==='text'){
        document.getElementById('fs-est').onclick = function(){
          var t = document.getElementById('fs-text').value.trim();
          if (!t){ document.getElementById('fs-text').focus(); return; }
          var btn = this; btn.disabled = true; msg(L('diet_reading'));
          estimateFood({text:t}).then(handleResult).finally(function(){ btn.disabled = false; });
        };
      } else {
        document.getElementById('fm-save').onclick = function(){
          var name = document.getElementById('fm-name').value.trim();
          var kcal = +document.getElementById('fm-kcal').value;
          if (!name){ document.getElementById('fm-name').focus(); return; }
          if (!(kcal>=0)) kcal = 0;
          function n(id){ return +document.getElementById(id).value || 0; }
          addMeals([{date:dietDate, meal:meal, name:name, portion:'', kcal:kcal, protein:n('fm-protein'), carbs:n('fm-carbs'), fat:n('fm-fat'), fiber:n('fm-fiber'), source:'manual'}]);
          closeSheet(); renderDiet();
        };
      }
    }
    draw();
    overlay.classList.add('open');
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
        lines.push(w.date + '  ' + fmtKg(w.weightKg) + '  ' + (w.fatPercent!=null?fmtKg(w.fatPercent):'-') + '  ' + (w.fatKg!=null?fmtKg(w.fatKg):'-') + '  ' + (w.muscleKg!=null?fmtKg(w.muscleKg):'-') + '  ' + (w.visceralFat!=null?w.visceralFat:'-') + '  ' + (w.score!=null?w.score:'-') + (w.waistCm!=null?'  '+L('wf_waist')+' '+w.waistCm:'') + (w.leanKg!=null?'  '+L('wf_lean')+' '+w.leanKg:'') + (Array.isArray(w.custom)?w.custom.map(function(c){ return '  '+c.name+' '+c.value; }).join(''):''));
      });
    } else { lines.push(L('ai_noRecords')); }
    lines.push('');
    lines.push(L('ai_shotHeader'));
    if (mem.injections.length){
      mem.injections.slice().reverse().forEach(function(r){
        lines.push(r.date + '  ' + (r.medication?medLabel(r.medication)+' ':'') + fmtDose(r.doseMg) + 'mg  ' + siteLabel(r.site));
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
    if (name==='diet') renderDiet();
    if (name==='ledger') renderLedger();
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
    document.getElementById('navLabelDiet').textContent = L('nav_diet');
    document.getElementById('navLabelLedger').textContent = L('nav_ledger');
    document.getElementById('navLabelSettings').textContent = L('nav_settings');
  }

  function updateDayBadge(){
    var streak = mem.weights.length ? Math.max(1, daysBetween(mem.weights[0].date, todayISO)) : 1;
    document.getElementById('dayBadge').textContent = L('dayBadge', {n:streak});
  }

  // Keep the page at 1:1 — iOS Safari ignores user-scalable=no, so block pinch here too (double-tap zoom is off via touch-action in the CSS).
  ['gesturestart','gesturechange','gestureend'].forEach(function(t){ document.addEventListener(t, function(e){ e.preventDefault(); }, {passive:false}); });
  document.addEventListener('touchmove', function(e){ if (e.touches && e.touches.length > 1) e.preventDefault(); }, {passive:false});

  initPersistence().then(function(){
    LANG = (mem.profile && mem.profile.lang) || 'zh';
    updateNavLabels();
    updateDayBadge();
    switchView('home');
  });
})();
