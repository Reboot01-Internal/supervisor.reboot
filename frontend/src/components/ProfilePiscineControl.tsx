import {useEffect,useState} from 'react';
import {GraduationCap,CalendarDays,Check} from 'lucide-react';
import {apiFetch} from '../lib/api';
import './ProfilePiscineControl.css';
const currentMonth=()=>new Date(Date.now()+10800000).toISOString().slice(0,7);
type Mark={in_piscine:boolean;marked_by?:string};
export default function ProfilePiscineControl({userId}:{userId:number}){
 const [month,setMonth]=useState(currentMonth),[result,setResult]=useState<{key:string;mark:Mark}|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const key=`${userId}:${month}`,loading=result?.key!==key;
 useEffect(()=>{let alive=true;setError('');apiFetch(`/admin/reports/piscine?user_id=${userId}&month=${month}`).then(mark=>{if(alive)setResult({key,mark});}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Could not load piscine status');});return()=>{alive=false;};},[userId,month,key,retry]);
 async function update(active:boolean){setSaving(true);setError('');try{await apiFetch('/admin/reports/piscine',{method:'POST',body:JSON.stringify({user_id:userId,month,in_piscine:active})});const mark=await apiFetch(`/admin/reports/piscine?user_id=${userId}&month=${month}`);setResult({key,mark});}catch(e){setError(e instanceof Error?e.message:'Could not save piscine status');}finally{setSaving(false);}}
 const active=!loading&&!!result?.mark.in_piscine;
 return <section className="profile-piscine-control" aria-label="Monthly piscine status" data-active={active}>
  <div className="pp-identity"><span className="pp-icon"><GraduationCap size={20}/></span><div><strong>Piscine status</strong><p>{active?'Excluded from this month’s meeting targets and movement counts.':'Mark participation to pause this month’s meeting targets and movement counts.'}</p>{active&&<small>Marked by {result?.mark.marked_by||'Staff'}</small>}</div></div>
  <div className="profile-piscine-actions"><label className="pp-month"><CalendarDays size={15}/><input aria-label="Piscine report month" type="month" max={currentMonth()} value={month} disabled={saving} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)&&e.target.value<=currentMonth())setMonth(e.target.value);}}/></label>
   <button type="button" role="switch" aria-label="In a piscine" aria-checked={active} aria-busy={saving} className="pp-switch" disabled={loading||saving} onClick={()=>void update(!active)}><span>{saving?'Saving…':loading&&!error?'Loading…':'In a piscine'}</span><span className="pp-track" aria-hidden="true"><span className="pp-thumb">{active&&<Check size={10} strokeWidth={3}/>}</span></span></button>
  </div>
  {error&&<p className="pp-error" role="alert">{error} <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}
 </section>;
}
