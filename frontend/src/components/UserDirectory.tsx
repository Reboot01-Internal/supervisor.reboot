import type { ReactNode } from "react";
import { ArrowUpRight, GraduationCap, Mail, Phone, Search, ShieldCheck, Users } from "lucide-react";
import UserAvatar from "./UserAvatar";
import "./UserDirectory.css";

export function DirectorySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
 return <label className="directory-search"><Search size={18}/><input aria-label="Search users" placeholder="Search users by name, email or username…" value={value} onChange={e=>onChange(e.target.value)}/></label>;
}
export function DirectoryCounter({ label, value }: { label: string; value: number | string }) {
 const Icon=label==="Supervisors"?ShieldCheck:label==="Talents"?GraduationCap:Users;
 return <div className="directory-counter"><span className="directory-counter-icon"><Icon size={18}/></span><span><strong>{value}</strong><small>{label}</small></span></div>;
}
export function DirectoryCard({ name, username, avatar, contact, contactType="email", badges, onOpen, selection, actions }: {
 name: string; username: string; avatar: string; contact: string; contactType?: "phone"|"email"; badges: ReactNode; onOpen: () => void;
 actions?: ReactNode;
 selection?: { selected: boolean; disabled: boolean; onToggle: () => void };
}) {
 const activate=()=>{if(selection){if(!selection.disabled)selection.onToggle()}else onOpen()};
 const ContactIcon=contactType==="phone"?Phone:Mail;
 return <article role="button" tabIndex={0} aria-label={selection?`Select ${name}`:`Open ${name}'s profile`} aria-pressed={selection?.selected} onClick={activate} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();activate()}}} className={`directory-user-card users-row-card border cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6d5efc]/15 ${selection?.selected?"users-delete-selected":""}`}>
 <div className="flex items-start gap-3">
 {selection&&<label className="mt-1 inline-flex h-5 w-5 flex-none cursor-pointer items-center justify-center" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}><input type="checkbox" aria-label={`Select ${name}`} checked={selection.selected} disabled={selection.disabled} onChange={selection.onToggle}/></label>}
 <UserAvatar src={avatar} alt={name} fallback={name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase()||"?"} sizeClass="h-14 w-14" previewable/>
 <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-black text-slate-900" title={name}>{name}</div><div className="directory-phone"><ContactIcon size={12}/><span className="truncate" title={contact}>{contact}</span></div><div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badges}</div></div>
 {actions}
 </div><div className="directory-card-footer"><span>{username?`@${username.replace(/^@/,"")}`:"—"}</span><span>{selection?(selection.selected?"Selected":"Select user"):"View profile"}<ArrowUpRight size={15}/></span></div>
 </article>;
}
