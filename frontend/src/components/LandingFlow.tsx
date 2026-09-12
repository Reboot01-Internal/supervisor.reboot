import { useEffect, useRef } from 'react';

export function LandingFlow() {
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   frame=0;
   const container=root.current;
   if(!container) return;
   const bounds=container.getBoundingClientRect();
   const distance=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
   const scroll=Math.max(0,Math.min(distance,window.scrollY));
   // Reveal by document height so long horizontal curves cannot accelerate the tip.
   const entry=Math.min(1,scroll/Math.max(1,window.innerHeight*.4));
   const exit=1-Math.min(1,(distance-scroll)/Math.max(1,window.innerHeight*.4));
   const anchor=window.innerHeight*(.6*entry+.4*exit);
   const progress=scroll<=0?0:scroll>=distance?1:Math.max(0,Math.min(1,(anchor-bounds.top)/bounds.height));
   container.style.setProperty('--flow-progress',String(progress));
   container.style.setProperty('--scene-shift',`${progress*90}px`);
   container.style.setProperty('--scene-turn',`${progress*35}deg`);
   container.style.setProperty('--scene-hue',`${230+progress*65}`);
   container.style.setProperty('--scene-travel',`${progress*320}px`);
  };
  const schedule=()=>{if(!frame) frame=requestAnimationFrame(update)};
  const observer=new ResizeObserver(schedule);
  observer.observe(document.documentElement);
  if(root.current) observer.observe(root.current);
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);update();
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule)};
 },[]);
 return <div ref={root} className="landing-flow" aria-hidden="true">
  <div className="scroll-atmosphere" aria-hidden="true"><i/><i/><span>{'{ }'}</span><span>{'</>'}</span></div>
  <svg viewBox="0 0 1000 2000" preserveAspectRatio="none"><defs><linearGradient id="landing-flow-color" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4dcac0"/><stop offset=".5" stopColor="#ad8de0"/><stop offset="1" stopColor="#37bba7"/></linearGradient></defs>
  <path className="flow-track" d="M 30 0 C 150 180, 0 300, 50 480 S 950 500, 950 750 S 20 900, 45 1150 S 960 1250, 950 1500 S 50 1770, 500 2000"/>
  <g className="flow-glow"><path className="flow-light" d="M 30 0 C 150 180, 0 300, 50 480 S 950 500, 950 750 S 20 900, 45 1150 S 960 1250, 950 1500 S 50 1770, 500 2000"/></g></svg>
  {['</>','[ ]',';','</>','{ }','/','[ ]',';'].map((symbol,i)=><span key={i} className="flow-symbol" style={{top:`${7+i*12}%`,left:i%2?'92%':'2%',animationDelay:`${-i*1.7}s`}}>{symbol}</span>)}
 </div>
}
export function FlowMarquee(){
 const content=<><span>MADE OF PROJECTS & SHARED PROGRESS</span><b>{'</>'}</b><span>BUILT TOGETHER</span><b>[ ]</b><span>A LITTLE STRUCTURE. A LOT OF POSSIBILITY.</span><b>;</b><span>FIND YOUR FLOW</span><b>{'</>'}</b></>;
 return <div className="landing-strip flow-marquee"><div className="flow-marquee-track"><div>{content}</div><div aria-hidden="true">{content}</div></div></div>
}
