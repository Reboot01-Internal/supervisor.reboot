import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Moon, Sun, LogOut, ArrowUpRight, UserRound } from "lucide-react";
import "./SidebarAccount.css";

type Props = { name: string; photo: string; role: string; dark: boolean; onTheme?: () => void; onProfile: () => void; onLogout: () => void };
export default function SidebarAccount({name,photo,role,dark,onTheme,onProfile,onLogout}:Props) {
 const [open,setOpen]=useState(false);
 const [failedPhoto,setFailedPhoto]=useState("");
 const root=useRef<HTMLDivElement>(null);
 const toggle=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);toggle.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
 return <div className="sidebar-account" ref={root}>
 <button className="sa-profile" onClick={onProfile} aria-label={`Open ${name}'s profile`}><span className="sa-code" aria-hidden="true">{'</>'}</span>{photo&&failedPhoto!==photo ? <img src={photo} alt="" onError={()=>setFailedPhoto(photo)}/> : <span className="sa-fallback">{name.slice(0,2).toUpperCase()}</span>}<span className="sa-caption"><strong>{name}</strong><small>{role}</small><ArrowUpRight className="sa-profile-arrow" size={16} aria-hidden="true"/></span></button>
 <button ref={toggle} className="sa-toggle" aria-label="Account options" aria-expanded={open} onClick={()=>setOpen(!open)}><MoreHorizontal size={20}/></button>
 {open&&<div className="sa-options" aria-label="Account options"><span className="sa-options-label">YOUR ACCOUNT</span><button onClick={()=>{setOpen(false);onProfile();}}><UserRound size={16}/><span>View profile</span></button>{onTheme&&<button onClick={onTheme}>{dark?<Sun size={16}/>:<Moon size={16}/>}<span>{dark?"Light appearance":"Dark appearance"}</span></button>}<button onClick={()=>{setOpen(false);onLogout();}}><LogOut size={16}/><span>Log out</span></button></div>}
 </div>;
}
