(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    intro: $('introOverlay'), pause: $('pauseOverlay'), result: $('resultOverlay'), hud: $('hud'),
    score: $('score'), combo: $('combo'), health: $('health'), progress: $('progress'),
    feedback: $('feedback'), controls: $('mobileControls'), soundLabel: $('soundLabel')
  };
  const settings = { chill: { bpm: 94, beats: 56, window: .22 }, rush: { bpm: 116, beats: 64, window: .18 }, fever: { bpm: 138, beats: 72, window: .15 } };
  let difficulty = 'chill', state = 'menu', soundOn = true, audio = null, startAt = 0, lastFrame = 0;
  let notes = [], particles = [], stars = [], buildings = [], score = 0, combo = 0, bestCombo = 0, health = 100, hits = 0, attempts = 0, elapsed = 0, lastBeat = -1;
  let W = 0, H = 0, dpr = 1, feedbackTimer = 0;
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    seedScenery();
  }
  function seedScenery() {
    stars = Array.from({length:80}, () => ({x:rand(0,W),y:rand(0,H*.59),r:rand(.4,1.8),p:rand(0,6.28),s:rand(.2,1)}));
    buildings=[]; let x=-5;
    while(x<W+20){const w=rand(22,70),h=rand(H*.08,H*.27);buildings.push({x,w,h,seed:rand(0,10)});x+=w+rand(4,12)}
  }
  window.addEventListener('resize',resize); resize();

  function audioStart() {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (_) { audio = null; }
  }
  function tone(freq, when, duration, type='sine', volume=.04, endFreq=null) {
    if (!soundOn || !audio) return;
    const osc=audio.createOscillator(), gain=audio.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,when);
    if(endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),when+duration);
    gain.gain.setValueAtTime(.0001,when); gain.gain.exponentialRampToValueAtTime(volume,when+.008); gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start(when);osc.stop(when+duration+.02);
  }
  function beatSound(t, beat) {
    if (!audio || !soundOn) return;
    const now=audio.currentTime;
    if(beat%4===0) tone(115,now,.16,'sine',.085,42);
    else if(beat%4===2) tone(180,now,.09,'triangle',.028,90);
    tone(beat%2===0?950:720,now,.035,'square',.009,350);
  }
  function hitSound(lane, quality) {
    tone(lane===0?520:660,audio?audio.currentTime:0,.12,'sine',quality==='PERFECT'?.065:.04,quality==='PERFECT'?880:540);
  }

  function buildNotes() {
    const cfg=settings[difficulty], beat=60/cfg.bpm;
    notes=[];
    for(let i=0;i<cfg.beats;i++){
      // A deliberately composed-feeling pattern with occasional offbeat doubles.
      const lane=(Math.floor(i/4)+i+Math.floor(i/7))%2;
      if(i%8===3 || i%8===6) notes.push({time:(i+.5)*beat,lane:(lane+1)%2,done:false});
      notes.push({time:i*beat,lane,done:false});
      if(difficulty==='fever' && i%4===1) notes.push({time:(i+.5)*beat,lane,done:false});
    }
    notes.sort((a,b)=>a.time-b.time);
  }
  function startGame() {
    audioStart(); buildNotes(); score=0;combo=0;bestCombo=0;health=100;hits=0;attempts=0;elapsed=0;lastBeat=-1;particles=[];
    startAt=performance.now()/1000;state='playing';
    ui.intro.hidden=true;ui.pause.hidden=true;ui.result.hidden=true;ui.hud.hidden=false;ui.controls.hidden=false;
    updateHud();
  }
  function pauseGame(){if(state!=='playing')return;state='paused';ui.pause.hidden=false;ui.controls.hidden=true;}
  function resumeGame(){if(state!=='paused')return;startAt=performance.now()/1000-elapsed;state='playing';ui.pause.hidden=true;ui.controls.hidden=false;}
  function endGame(){
    if(state==='result')return;
    state='result';ui.hud.hidden=true;ui.controls.hidden=true;ui.result.hidden=false;
    $('finalScore').textContent=String(score).padStart(6,'0');$('bestCombo').textContent=bestCombo;
    const accuracy=attempts?Math.round(hits/attempts*100):0;$('accuracy').textContent=accuracy+'%';
    const rank=score>=85000?'S':score>=62000?'A':score>=38000?'B':'C';$('rank').textContent=rank;
    $('resultTitle').innerHTML=rank==='S'?'YOU ARE<br><em>THE MOMENT.</em>':rank==='A'?'THAT WAS<br><em>GLOWING.</em>':'NICE WORK.<br><em>KEEP GOING.</em>';
    $('resultEyebrow').textContent=health<=0?'THE NIGHT GOES ON':'NIGHT COMPLETE';
  }
  function updateHud(){ui.score.textContent=String(score).padStart(6,'0');ui.combo.textContent=combo;ui.health.style.width=health+'%';ui.health.style.background=health<30?'#ff8b9b':'#a6f1c4';}
  function showFeedback(text){ui.feedback.textContent=text;ui.feedback.classList.remove('pop');void ui.feedback.offsetWidth;ui.feedback.classList.add('pop');}
  function addParticles(x,y,color,count=10){for(let i=0;i<count;i++)particles.push({x,y,vx:rand(-120,120),vy:rand(-130,35),life:rand(.28,.65),max:.65,r:rand(1,3),color});}

  function hit(lane) {
    if(state!=='playing') return;
    const cfg=settings[difficulty];
    let candidate=null,delta=Infinity;
    for(const n of notes){if(n.done||n.lane!==lane)continue;const d=Math.abs(n.time-elapsed);if(d<delta){candidate=n;delta=d}}
    attempts++;
    if(candidate && delta<=cfg.window){
      candidate.done=true;hits++;
      const perfect=delta<=cfg.window*.42, quality=perfect?'PERFECT':'NICE';
      combo++;bestCombo=Math.max(combo,bestCombo);score+=(perfect?1000:650)+Math.min(combo,50)*10;
      health=clamp(health+(perfect?1.6:.8),0,100);showFeedback(quality);hitSound(lane,quality);
      addParticles(W*.19,H*(lane===0?.635:.765),lane===0?'#ff9fc9':'#b8a2ff',perfect?14:9);
    } else {combo=0;health=clamp(health-7,0,100);showFeedback('MISS');}
    updateHud();if(health<=0)endGame();
  }
  function press(key){if(key==='f'||key==='arrowleft'||key==='a')hit(0);if(key==='j'||key==='arrowright'||key==='d')hit(1);}
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();if([' ','arrowleft','arrowright'].includes(k))e.preventDefault();
    if((k===' '||k==='escape')&&state==='playing'){pauseGame();return}if((k===' '||k==='escape')&&state==='paused'){resumeGame();return}
    if(k==='f'||k==='j'||k==='arrowleft'||k==='arrowright'||k==='a'||k==='d')press(k);
  });
  document.querySelectorAll('.mobile-controls button').forEach(b=>{
    b.addEventListener('pointerdown',e=>{e.preventDefault();hit(Number(b.dataset.lane));});
  });
  $('playButton').addEventListener('click',startGame);$('againButton').addEventListener('click',startGame);$('resumeButton').addEventListener('click',resumeGame);
  $('quitButton').addEventListener('click',()=>{state='menu';ui.pause.hidden=true;ui.hud.hidden=true;ui.controls.hidden=true;ui.intro.hidden=false});
  $('homeButton').addEventListener('click',()=>{state='menu';ui.result.hidden=true;ui.intro.hidden=false});
  document.querySelectorAll('.difficulty').forEach(b=>b.addEventListener('click',()=>{difficulty=b.dataset.difficulty;document.querySelectorAll('.difficulty').forEach(x=>x.classList.toggle('active',x===b));}));
  $('soundToggle').addEventListener('click',()=>{soundOn=!soundOn;ui.soundLabel.textContent=soundOn?'SOUND ON':'SOUND OFF';if(soundOn)audioStart();});

  function roundedRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
  function drawBackground(t){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#1b1638');g.addColorStop(.52,'#302052');g.addColorStop(1,'#111027');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const moonX=W*.72,moonY=H*.22,moonR=Math.min(W,H)*.09;
    const glow=ctx.createRadialGradient(moonX,moonY,2,moonX,moonY,moonR*2.9);glow.addColorStop(0,'#f9a9d92a');glow.addColorStop(1,'#e497f000');ctx.fillStyle=glow;ctx.fillRect(moonX-moonR*3,moonY-moonR*3,moonR*6,moonR*6);
    ctx.beginPath();ctx.arc(moonX,moonY,moonR,0,Math.PI*2);ctx.fillStyle='#f9c5de';ctx.globalAlpha=.78;ctx.fill();ctx.globalAlpha=1;
    for(const s of stars){ctx.globalAlpha=.25+.55*(.5+.5*Math.sin(t*s.s+s.p));ctx.fillStyle='#fff4f5';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,6.28);ctx.fill()}ctx.globalAlpha=1;
    // distant hills
    ctx.beginPath();ctx.moveTo(0,H*.56);for(let x=0;x<=W;x+=20)ctx.lineTo(x,H*.48+Math.sin(x*.008+1)*H*.035+Math.sin(x*.019)*H*.014);ctx.lineTo(W,H*.66);ctx.lineTo(0,H*.66);ctx.closePath();ctx.fillStyle='#211a3a';ctx.fill();
    for(const b of buildings){ctx.fillStyle='#15132d';ctx.fillRect(b.x,H*.58-b.h,b.w,b.h);for(let wy=H*.6-b.h;wy<H*.58-5;wy+=12){for(let wx=b.x+6;wx<b.x+b.w-4;wx+=11){if(Math.sin(wx*1.17+wy*2+b.seed)>-.08){ctx.fillStyle=Math.sin(wx+wy)>0?'#ffb1d344':'#a88aff30';ctx.fillRect(wx,wy,3,5)}}}}
    // road glow and lanes
    const horizon=H*.56, floor=H*.92;
    ctx.beginPath();ctx.moveTo(W*.24,horizon);ctx.lineTo(W*.76,horizon);ctx.lineTo(W*1.04,floor);ctx.lineTo(-W*.04,floor);ctx.closePath();const road=ctx.createLinearGradient(0,horizon,0,floor);road.addColorStop(0,'#36234f');road.addColorStop(1,'#17152d');ctx.fillStyle=road;ctx.fill();
    for(let i=0;i<15;i++){const y=horizon+(floor-horizon)*(i/14);const scale=(y-horizon)/(floor-horizon);ctx.strokeStyle=`rgba(222,167,245,${.04+scale*.12})`;ctx.lineWidth=1+scale*1.2;ctx.beginPath();ctx.moveTo(W*.5-(W*.26+scale*W*.24),y);ctx.lineTo(W*.5+(W*.26+scale*W*.24),y);ctx.stroke()}
    ctx.strokeStyle='#ff9fce42';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W*.5,horizon);ctx.lineTo(-W*.04,floor);ctx.moveTo(W*.5,horizon);ctx.lineTo(W*1.04,floor);ctx.stroke();
    // Decorative sky streaks move with the music.
    const pulse=state==='playing'?.5+.5*Math.sin(t*settings[difficulty].bpm*Math.PI/30):.25+.1*Math.sin(t);
    ctx.globalAlpha=.12+pulse*.09;ctx.fillStyle='#ff9ac6';ctx.fillRect(0,H*.55,W,1);ctx.globalAlpha=1;
  }
  function drawLane(lane,t){
    const y=H*(lane===0?.635:.765),col=lane===0?'#ff96c6':'#b4a0ff';
    ctx.fillStyle=lane===0?'#ff94c60a':'#aa92ff0a';ctx.fillRect(0,y-H*.045,W,H*.09);
    ctx.strokeStyle=col+'65';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W*.035,y+H*.045);ctx.lineTo(W*.965,y+H*.045);ctx.stroke();
    ctx.fillStyle=col;ctx.globalAlpha=.55;ctx.fillRect(W*.18-1,y-H*.047,2,H*.094);ctx.globalAlpha=1;
    const pulse=state==='playing'?.7+.3*Math.sin(t*10):.65;
    const gl=ctx.createRadialGradient(W*.18,y,2,W*.18,y,H*.075);gl.addColorStop(0,col+'66');gl.addColorStop(1,col+'00');ctx.fillStyle=gl;ctx.globalAlpha=pulse;ctx.fillRect(W*.18-H*.08,y-H*.08,H*.16,H*.16);ctx.globalAlpha=1;
  }
  function drawNote(n,t){
    const cfg=settings[difficulty],travel=1.7,x=W*.18+(n.time-t)*W*.48/travel,y=H*(n.lane===0?.635:.765),col=n.lane===0?'#ff9cc9':'#b6a2ff';
    if(x<-40||x>W+40)return;
    const scale=clamp(.65+(x/W)*.42,.65,1.08),sz=Math.min(W,H)*.036*scale;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.shadowColor=col;ctx.shadowBlur=18;
    roundedRect(-sz/2,-sz/2,sz,sz,sz*.2,col);
    ctx.shadowBlur=0;roundedRect(-sz*.29,-sz*.29,sz*.58,sz*.58,sz*.14,'#fff9');
    ctx.restore();
    ctx.globalAlpha=.22;ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,sz*.92,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  }
  function drawAvatar(t){
    const x=W*.105,y=H*.69, bounce=state==='playing'?Math.sin(t*settings[difficulty].bpm*Math.PI/30)*H*.009:Math.sin(t*2)*H*.008;
    ctx.save();ctx.translate(x,y+bounce);
    // shadow
    ctx.fillStyle='#09081788';ctx.beginPath();ctx.ellipse(0,H*.052,H*.038,H*.012,0,0,Math.PI*2);ctx.fill();
    // jacket/body, energetic original silhouette
    ctx.fillStyle='#f3a5d0';ctx.beginPath();ctx.moveTo(-H*.023,-H*.018);ctx.quadraticCurveTo(-H*.034,H*.018,-H*.012,H*.041);ctx.lineTo(H*.015,H*.035);ctx.lineTo(H*.025,-H*.012);ctx.closePath();ctx.fill();
    ctx.fillStyle='#282043';ctx.beginPath();ctx.moveTo(-H*.012,H*.025);ctx.lineTo(0,H*.023);ctx.lineTo(-H*.006,H*.06);ctx.lineTo(-H*.021,H*.058);ctx.closePath();ctx.fill();
    ctx.fillStyle='#292044';ctx.beginPath();ctx.moveTo(H*.004,H*.024);ctx.lineTo(H*.016,H*.025);ctx.lineTo(H*.027,H*.054);ctx.lineTo(H*.011,H*.058);ctx.closePath();ctx.fill();
    // face
    ctx.fillStyle='#ffd2c9';ctx.beginPath();ctx.ellipse(0,-H*.031,H*.021,H*.023,-.15,0,Math.PI*2);ctx.fill();
    // hair swoop
    ctx.fillStyle='#533a72';ctx.beginPath();ctx.moveTo(-H*.022,-H*.031);ctx.quadraticCurveTo(-H*.019,-H*.065,H*.009,-H*.058);ctx.quadraticCurveTo(H*.03,-H*.051,H*.022,-H*.019);ctx.quadraticCurveTo(H*.008,-H*.039,-H*.003,-H*.027);ctx.lineTo(-H*.022,-H*.031);ctx.fill();
    ctx.fillStyle='#ffeef5';ctx.fillRect(H*.008,-H*.033,H*.004,H*.003);
    // trailing scarf
    ctx.fillStyle='#ff88bd';ctx.beginPath();ctx.moveTo(-H*.015,-H*.006);ctx.quadraticCurveTo(-H*.055,-H*.012,-H*.065,-H*.045+Math.sin(t*5)*H*.008);ctx.quadraticCurveTo(-H*.041,H*.002,-H*.013,H*.014);ctx.fill();
    ctx.restore();
  }
  function render(t){
    drawBackground(t);drawLane(0,t);drawLane(1,t);
    if(state==='playing'||state==='paused'){
      const now=state==='playing'?elapsed:elapsed;
      for(const n of notes)if(!n.done)drawNote(n,now);
    } else if(state==='menu'){
      // A few ambient notes drift past while the title screen waits.
      for(let i=0;i<5;i++){const x=((W*.25+i*W*.23-(t*W*.05)%W)+W)%W;const lane=i%2;drawNote({time:0,lane},t-(x-W*.18)/(W*.48/1.7));}
    }
    drawAvatar(t);
    if(state==='playing'){
      for(const p of particles){ctx.globalAlpha=clamp(p.life/.65,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill()}ctx.globalAlpha=1;
    }
  }
  function loop(ms){
    const now=ms/1000,dt=Math.min(.04,lastFrame?now-lastFrame:0);lastFrame=now;
    if(state==='playing'){
      elapsed=now-startAt;
      const cfg=settings[difficulty],beat=60/cfg.bpm,b=Math.floor(elapsed/beat);
      while(lastBeat<b){lastBeat++;beatSound(elapsed,lastBeat)}
      for(const n of notes){if(!n.done&&elapsed>n.time+cfg.window){n.done=true;attempts++;combo=0;health=clamp(health-5,0,100);updateHud();if(health<=0){endGame();break}}}
      ui.progress.style.width=clamp(elapsed/(cfg.beats*beat),0,1)*100+'%';
      particles=particles.filter(p=>p.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=230*dt;p.life-=dt}
      if(elapsed>=cfg.beats*beat+1)endGame();
    }
    render(now);requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
