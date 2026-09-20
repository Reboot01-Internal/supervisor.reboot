import { useAuth } from "../lib/auth";
import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useConfirm } from '../lib/useConfirm';
import './AccountStatusAction.css';
export default function AccountStatusAction({id,name,active,onChange}:{id:number;name:string;active:boolean;onChange:(active:boolean)=>void}) {
 const {isAdmin}=useAuth();
 const {confirm,dialog}=useConfirm();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function update(){
  if(!isAdmin)return;
  const next=!active;
  if(!await confirm({title:`${next?'Activate':'Deactivate'} ${name}?`,message:next?'This account can be used for new boards and assignments again.':'Their previous boards, tasks, and records will remain. They will lose account access and cannot receive new assignments until reactivated.',confirmLabel:next?'Activate':'Deactivate'}))return;
  setBusy(true);setError('');
  try{await apiFetch('/admin/users/status',{method:'POST',body:JSON.stringify({user_id:id,is_active:next})});onChange(next);}catch(e){setError(e instanceof Error?e.message:'Could not update status');}finally{setBusy(false);}
 }
 if(!isAdmin)return null;
 return <div className="account-status-control" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <button type="button" role="switch" aria-checked={active} aria-busy={busy} className="account-status-toggle" data-active={active} disabled={busy} title={active?'Deactivate account':'Activate account'} aria-label={`Account access for ${name}`} onClick={()=>void update()}>
   <span className="account-status-caption"><small>ACCOUNT</small><strong>{busy?'Saving…':active?'Active':'Inactive'}</strong></span>
   <span className="account-status-track" aria-hidden="true"><span className="account-status-thumb">{active?<Check size={10} strokeWidth={3}/>:<Minus size={10} strokeWidth={3}/>}</span></span>
  </button>
  {error&&<p role="alert">{error}</p>}{dialog}
 </div>;
}
