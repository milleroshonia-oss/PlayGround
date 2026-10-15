// TryBox AI — MVP logic, 100% free stack
// Free AI backend: Pollinations.ai text API (no key). Docs: https://github.com/pollinations/pollinations
// Monetization: paste Stripe Payment Links (free to create). Affiliates: paste YOUR links below.

const STRIPE_LINK = "https://buy.stripe.com/test_YOUR_LINK_HERE"; // TODO: replace
const AFFILIATE_LINKS = {
  hosting: "https://YOUR-AFFILIATE-LINK-hosting", // e.g. Hostinger / Bluehost affiliate
  ai: "https://YOUR-AFFILIATE-LINK-ai-tool",
  gig: "https://YOUR-AFFILIATE-LINK-fiverr"
};

document.querySelectorAll("[data-aff]").forEach(a=>{
  const k=a.getAttribute("data-aff");
  if(AFFILIATE_LINKS[k] && !AFFILIATE_LINKS[k].includes("YOUR-")) a.href=AFFILIATE_LINKS[k];
  else a.href="#pricing";
});

// tabs
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  t.classList.add("active");
  document.getElementById("panel-"+t.dataset.tab).classList.add("active");
});
document.getElementById("ctaTop").onclick=startTrial;

// simple paywall: 5 free runs in localStorage, then $1 trial unlock
function getRuns(){ return parseInt(localStorage.getItem("tb_runs")||"5"); }
function setRuns(n){ localStorage.setItem("tb_runs",n); document.getElementById("runsLeft").textContent=n; }
function isPro(){ return localStorage.getItem("tb_pro")==="1"; }
setRuns(getRuns());
if(isPro()) document.getElementById("memberStatus").textContent="Status: PRO trial active ✅";

function startTrial(){
  if(STRIPE_LINK.includes("YOUR_LINK")) {
    // demo mode until you paste link
    localStorage.setItem("tb_pro","1");
    document.getElementById("memberStatus").textContent="Status: PRO trial active ✅ (demo — paste Stripe link to charge real $)";
    alert("Demo mode: PRO unlocked. To charge real money, paste your free Stripe Payment Link into app.js → STRIPE_LINK.");
    setRuns(999); return;
  }
  window.open(STRIPE_LINK,"_blank");
}

function offlineFallback(kind,input){
  if(kind==="ecom") return `TITLE: ${input} – Premium Pick, Gift-Ready, Fast Ship\n\nBULLETS:\n• Premium quality, checked before shipping\n• Perfect gift for birthdays / home / self-care\n• Easy care + 30-day returns\n\nDESC: Tired of boring ${input}? This one feels premium from unboxing. Order today – stock moves fast.\n\nTAGS: ${input.split(",")[0]} gift, handmade, small business`;
  if(kind==="creator") return `5 HOOKS for "${input}":\n1. "I tried ${input} for 7 days – day 3 shocked me"\n2. "Stop doing ${input} wrong (do this instead)"\n3. "POV: you finally fixed ${input} for under $10"\n4. "3 ${input} mistakes keeping you broke"\n5. "The $0 ${input} hack nobody talks about"\n\nSCRIPT: Hook (0-3s) → payoff tease → 3 steps → CTA "follow for day 2".`;
  return `BEFORE: ${input}\nAFTER:\n• Delivered 5-star service to 80+ customers/day, 98% satisfaction, cut wait 20%\n• Trained 3 new staff, handled cash + upsells +$400/wk\nUse numbers even if estimated – hiring managers skim for impact.`;
}

function promptFor(kind,input){
  const tone=document.getElementById("tone-ecom")?.value||"Persuasive + SEO";
  if(kind==="ecom") return `Write Etsy product listing for: ${input}. Tone: ${tone}. Return TITLE (60 chars SEO), 4 bullets, 80-word description, 5 tags, CTA.`;
  if(kind==="creator") return `Write 5 viral TikTok hooks + 30-sec script outline for topic: ${input}. Punchy, under 12 words per hook.`;
  return `Rewrite resume bullet to be quantified and powerful: ${input}. Give 3 versions with metrics and action verbs.`;
}

async function generate(kind){
  const inp=document.getElementById("in-"+kind).value.trim();
  const out=document.getElementById("out-"+kind);
  if(!inp){ out.textContent="Type something first."; return; }
  let runs=getRuns();
  if(!isPro()){
    if(runs<=0){ out.textContent="Free demo used up. Click Start $1 Trial to unlock unlimited."; document.getElementById("pricing").scrollIntoView({behavior:"smooth"}); return; }
    setRuns(runs-1);
  }
  out.textContent="⏳ Generating with free AI…";
  try{
    const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),15e3);
    const res=await fetch("https://text.pollinations.ai/"+encodeURIComponent(promptFor(kind,inp)),{signal:ctrl.signal});
    clearTimeout(t);
    if(!res.ok) throw new Error("ai "+res.status);
    const txt=(await res.text()).slice(0,2500);
    out.textContent=txt || offlineFallback(kind,inp);
  }catch(e){ out.textContent="(offline mode)\n\n"+offlineFallback(kind,inp); }
}
