import { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ProjectExperience, SupervisorTeam } from "../components/LandingExperience";
import { LandingFlow, FlowMarquee } from "../components/LandingFlow";
import WorkspacePlayground from "../components/WorkspacePlayground";
import LandingLogin from "../components/LandingLogin";

import "./LandingPage.css";
export default function LandingPage(){
 const location = useLocation();
 const [login,setLogin]=useState(location.pathname === "/login");
 const {authenticated,isAdmin}=useAuth();
 const [showTop,setShowTop]=useState(false);
 useEffect(()=>{
  const update=()=>setShowTop(window.scrollY>window.innerHeight);
  window.addEventListener("scroll",update,{passive:true});update();
  return ()=>window.removeEventListener("scroll",update);
 },[]);
 useEffect(()=>{
  const elements=document.querySelectorAll('.reveal-section, .supervisor-intro');
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.classList.toggle('is-visible',entry.isIntersecting)}),{threshold:0,rootMargin:'0px 0px -30px 0px'});
  elements.forEach(el=>observer.observe(el));return ()=>observer.disconnect();
 },[]);
 return <main className="tf-landing" onClick={(event)=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0) return;
  const anchor=(event.target as Element).closest('a[href^="#"]');
  const hash=anchor?.getAttribute('href');
  if(!hash) return;
  const target=document.getElementById(hash.slice(1));
  if(!target) return;
  event.preventDefault();
  target.classList.add('is-visible');
  // offsetTop is unaffected by the reveal animation's translate transform.
  let top=0;let node:HTMLElement|null=target;
  while(node){top+=node.offsetTop;node=node.offsetParent as HTMLElement|null;}
  window.history.pushState(null,'',hash);
  window.scrollTo({top:Math.max(0,top-48),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }}>
 <LandingFlow/>
 <nav className="landing-nav" aria-label="Main navigation"><a href="#top" className="landing-brand"><img src="/reboot-logo.png" alt="Reboot"/><span>TaskFlow<span className="brand-dot">.</span></span></a><div className="landing-nav-links"><a href="#explore">The workspace</a><a href="#creator">Meet the maker</a><a href="#team">Our team</a></div>{authenticated?<Link className="landing-small-cta" to={isAdmin?"/admin":"/dashboard"}>Your workspace <ArrowUpRight size={15}/></Link>:<button className="landing-small-cta" onClick={()=>setLogin(true)}>Log in <ArrowUpRight size={15}/></button>}</nav>
 <section className="landing-hero" id="top">
 <div className="hero-copy"><span className="landing-eyebrow"><span/>BUILT FOR THE REBOOT COMMUNITY</span><h1>Big ideas.<br/>Bold moves.<br/><em>Find your flow.</em></h1><p>Your people. Your projects. Your next big thing.<br/>Work through Reboot projects with support at every step.</p><button className="landing-cta" onClick={()=>authenticated?window.location.assign(isAdmin?"/admin":"/dashboard"):setLogin(true)}>Let’s get building <ArrowUpRight size={20}/></button><a className="hero-scroll" href="#explore"><ArrowDown size={14}/> Take a look around</a></div>
 <ProjectExperience/></section>
 <FlowMarquee/>
 <WorkspacePlayground/>
 <section id="creator" className="landing-creator reveal-section"><div className="creator-photo"><img src="/reem-creator.png" alt="Reem Alhalwachi, creator of TaskFlow" loading="lazy"/><span className="photo-note">the human behind TaskFlow ↗</span><span className="creator-star">{'</>'}</span></div><div className="creator-copy"><span className="landing-eyebrow">02 / MADE WITH INTENTION</span><h2>Hi, I’m Reem.<br/><em>I built this for us.</em></h2><p>TaskFlow is my contribution to the Reboot community: a place to bring our projects, people, and progress together.</p><p>From the little details to the bigger picture, I’m building a workspace that feels good to use—and keeps getting better with the people using it.</p><div className="creator-signature">Reem Alhalwachi <span>Creator of TaskFlow</span></div></div></section>
 <SupervisorTeam/>
 <section className="landing-finale reveal-section"><span className="landing-eyebrow">YOUR NEXT GREAT THING IS WAITING</span><h2>Ready. Set. <em>Flow.</em></h2><button className="landing-cta" onClick={()=>authenticated?window.location.assign(isAdmin?"/admin":"/dashboard"):setLogin(true)}>Enter your workspace <ArrowUpRight size={20}/></button><span className="finale-code" aria-hidden="true">{'{ }'}</span></section>
 <footer className="landing-footer"><span>TaskFlow. Built by Reem, for Reboot.</span><a href="#top">Back to the top ↑</a><span>© {new Date().getFullYear()} TaskFlow</span></footer>
 {showTop&&!login&&<button className="landing-return-top" aria-label="Back to top" onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}><ArrowDown size={18} style={{transform:'rotate(180deg)'}}/><span>Back to top</span></button>}
 <LandingLogin open={login} onClose={()=>setLogin(false)}/>
 </main>
}
