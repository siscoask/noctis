(function(){
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const dome = document.getElementById('dome');
  const hint = document.getElementById('hint');
  const countEl = document.getElementById('count');
  const cycleEl = document.getElementById('cycle');
  const legendEl = document.getElementById('legend');
  const muteBtn = document.getElementById('mute');
  const intro = document.getElementById('intro');
  const beginBtn = document.getElementById('begin');

  const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORE_KEY = 'noctis_terrarium_v1';
  const SEEN_KEY = 'noctis_seen_intro';

  let W, H, DPR;
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const r = dome.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.max(1, W * DPR);
    canvas.height = Math.max(1, H * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resize);
  resize();

  const SOIL_Y_FRAC = 0.86;
  const SPECIES = [
    { name:'Lumen', color:[111,231,221], branchP:0.62, maxDepth:6, sway:0.9, freq:660 },
    { name:'Vesper',color:[180,140,240], branchP:0.5,  maxDepth:7, sway:1.3, freq:540 },
    { name:'Ember', color:[240,194,111], branchP:0.7,  maxDepth:5, sway:0.6, freq:880 },
    { name:'Coral', color:[240,140,174], branchP:0.55, maxDepth:6, sway:1.1, freq:740 },
  ];

  SPECIES.forEach(s=>{
    const row = document.createElement('div');
    row.className = 'row';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = `rgb(${s.color.join(',')})`;
    dot.style.boxShadow = `0 0 6px rgba(${s.color.join(',')},0.9)`;
    row.appendChild(dot);
    row.appendChild(document.createTextNode(s.name));
    legendEl.appendChild(row);
  });

  const fireflies = Array.from({length: 22}, () => ({
    x: Math.random(), y: Math.random()*0.75,
    r: Math.random()*1.4+0.6,
    phase: Math.random()*Math.PI*2,
    speed: REDUCE_MOTION ? 0 : Math.random()*0.15+0.05,
    hue: SPECIES[Math.floor(Math.random()*SPECIES.length)].color
  }));

  let plants = [];
  let t = 0;
  let cycle = 1;
  let hasUserPlanted = false;
  let muted = false;
  let audioCtx = null;

  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,a,b){ return Math.min(b, Math.max(a, v)); }

  function makePlant(x, opts){
    opts = opts || {};
    const species = SPECIES[opts.speciesIndex ?? Math.floor(Math.random()*SPECIES.length)];
    return {
      x, species,
      speciesIndex: SPECIES.indexOf(species),
      growth: opts.growth ?? 0,
      growSpeed: REDUCE_MOTION ? 1 : (opts.growSpeed ?? rand(0.0035, 0.007)),
      seed: opts.seed ?? Math.random()*1000,
      height: opts.height ?? rand(0.32, 0.5),
      removing: null
    };
  }

  function ensureAudio(){
    if (!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playChime(species){
    if (muted) return;
    try{
      ensureAudio();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = species.freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now+0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now+1.1);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now+1.2);
    }catch(e){ /* audio unavailable, fail silently */ }
  }

  const CAPACITY = 34;
  function addPlant(x, speciesIndex){
    const p = makePlant(x, speciesIndex != null ? {speciesIndex} : {});
    plants.push(p);
    const active = plants.filter(pl => !pl.removing);
    if (active.length > CAPACITY){
      active[0].removing = t;
    }
    countEl.textContent = plants.filter(pl=>!pl.removing).length;
    playChime(p.species);
    scheduleSave();
    return p;
  }

  function plantAt(clientX, clientY){
    const r = dome.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    if (y < SOIL_Y_FRAC - 0.12) return;
    addPlant(clamp(x, 0.04, 0.96));
    if (!hasUserPlanted){
      hasUserPlanted = true;
      hint.classList.remove('show');
    }
  }

  dome.addEventListener('pointerdown', (e) => {
    if (!intro.classList.contains('hidden')) return;
    e.preventDefault();
    plantAt(e.clientX, e.clientY);
  });

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔈';
    muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  });

  // ---- persistence ----
  let saveTimer = null;
  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 800);
  }
  function save(){
    try{
      const data = {
        cycle,
        plants: plants.filter(p=>!p.removing).map(p => ({
          x:p.x, speciesIndex:p.speciesIndex, seed:p.seed,
          height:p.height, growth:p.growth, growSpeed:p.growSpeed
        }))
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    }catch(e){ /* storage unavailable, ignore */ }
  }
  function load(){
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.plants)) return false;
      cycle = data.cycle || 1;
      cycleEl.textContent = cycle;
      plants = data.plants.map(pd => makePlant(pd.x, pd));
      countEl.textContent = plants.length;
      return plants.length > 0;
    }catch(e){ return false; }
  }
  window.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);

  // ---- intro / onboarding ----
  let seenIntro = false;
  try{ seenIntro = localStorage.getItem(SEEN_KEY) === '1'; }catch(e){}
  if (seenIntro) intro.classList.add('hidden');
  beginBtn.addEventListener('click', () => {
    intro.classList.add('hidden');
    try{ localStorage.setItem(SEEN_KEY, '1'); }catch(e){}
    if (!hasUserPlanted) setTimeout(()=>{ if(!hasUserPlanted) hint.classList.add('show'); }, 600);
  });

  const restored = load();
  if (!restored){
    addPlant(0.3);
    addPlant(0.68);
    // seeded starters don't count as "user planted" for hint purposes
  }
  if (seenIntro && !hasUserPlanted){
    setTimeout(()=>{ if(!hasUserPlanted) hint.classList.add('show'); }, 1200);
  }

  // ---- growth-front branch renderer (fixed) ----
  function drawBranch(x, y, len, angle, depth, species, growth, seed, time, alphaMul){
    const maxDepth = species.maxDepth;
    const segIndex = maxDepth - depth;
    const segGrowth = clamp(growth*maxDepth - segIndex, 0, 1);
    if (segGrowth <= 0) return;

    const sway = REDUCE_MOTION ? 0 : Math.sin(time*0.6 + seed + depth) * species.sway * (1 - depth/maxDepth) * 0.06;
    const a = angle + sway;
    const drawLen = len * segGrowth;
    const x2 = x + Math.sin(a)*drawLen;
    const y2 = y - Math.cos(a)*drawLen;

    const alpha = (0.15 + 0.55*(depth/maxDepth)) * alphaMul;
    const [r,g,b] = species.color;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = Math.max(0.6, depth*0.55);
    ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
    ctx.shadowBlur = 4 + depth*1.2;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x2,y2);
    ctx.stroke();

    if (depth <= 2){
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${0.8*alphaMul})`;
      ctx.shadowBlur = 8;
      ctx.arc(x2, y2, Math.max(0.8, depth*0.7), 0, Math.PI*2);
      ctx.fill();
    }

    if (segGrowth < 1 || depth <= 1) return;

    const branchSeed = seed*1.37 + depth;
    drawBranch(x2, y2, len*0.78, a - (0.35+((branchSeed%10)/40)), depth-1, species, growth, seed+1.1, time, alphaMul);
    if (((branchSeed*7)%10)/10 < species.branchP){
      drawBranch(x2, y2, len*0.7, a + (0.4+((branchSeed%7)/30)), depth-1, species, growth, seed+2.3, time, alphaMul);
    }
  }

  function draw(){
    t += 0.016;
    ctx.clearRect(0,0,W,H);

    const breathe = REDUCE_MOTION ? 0.06 : (Math.sin(t*0.05)+1)/2*0.02+0.05;
    ctx.fillStyle = `rgba(10,20,22,${breathe})`;
    ctx.fillRect(0,0,W,H);

    const soilY = H*SOIL_Y_FRAC;
    const soilGrad = ctx.createLinearGradient(0, soilY-10, 0, H);
    soilGrad.addColorStop(0, 'rgba(30,50,45,0.5)');
    soilGrad.addColorStop(1, 'rgba(6,10,10,0.9)');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(0, soilY-6, W, H-soilY+6);

    for (const p of plants){
      p.growth = Math.min(1, p.growth + p.growSpeed);
      const alphaMul = p.removing ? clamp(1 - (t - p.removing)/1.3, 0, 1) : 1;
      const px = p.x * W;
      const len0 = p.height * H * 0.42;
      drawBranch(px, soilY, len0, 0, p.species.maxDepth, p.species, p.growth, p.seed, t, alphaMul);
    }
    ctx.shadowBlur = 0;

    plants = plants.filter(p => !(p.removing && (t - p.removing) > 1.3));

    for (const f of fireflies){
      f.phase += f.speed*0.02;
      const fx = (f.x + Math.sin(f.phase*0.7)*0.02) * W;
      const fy = (f.y + Math.cos(f.phase*0.5)*0.015) * H;
      const flick = REDUCE_MOTION ? 0.5 : (Math.sin(t*2 + f.phase*10)+1)/2;
      const [r,g,b] = f.hue;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${0.25+flick*0.5})`;
      ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
      ctx.shadowBlur = 6;
      ctx.arc(fx, fy, f.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (!REDUCE_MOTION) requestAnimationFrame(draw);
  }

  if (REDUCE_MOTION){
    draw();
    setInterval(draw, 1000);
  } else {
    requestAnimationFrame(draw);
  }

  setInterval(() => {
    cycle += 1;
    cycleEl.textContent = cycle;
    scheduleSave();
  }, 40000);

})();
