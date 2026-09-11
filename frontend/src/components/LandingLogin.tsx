import { useEffect, useRef } from "react";
import { X, ArrowUpRight } from "lucide-react";
import LoginPage from "../pages/LoginPage";
export default function LandingLogin({open,onClose}:{open:boolean;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(open&&!dialog?.open)dialog?.showModal();if(!open&&dialog?.open)dialog.close()},[open]);
 return <dialog ref={ref} className="landing-login-dialog" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose()}} aria-labelledby="login-heading"><div className="login-shell"><button className="login-dismiss" aria-label="Close sign in" onClick={onClose}><X size={18}/></button><aside className="login-brand-panel"><img src="/reboot-logo.png" alt="Reboot"/><span className="login-code">{'{ }'}</span><div><small>YOUR PEOPLE. YOUR PROJECTS.</small><h2>A little focus.<br/>A lot of <em>possibility.</em></h2><p>Your next chapter starts here.</p></div><span className="login-brand-footer">TaskFlow <ArrowUpRight size={16}/></span></aside><section className="login-form-panel"><small>WELCOME BACK</small><h2 id="login-heading">Find your flow.</h2><p>Use your Reboot account to enter your workspace.</p><LoginPage embedded/><div className="login-footnote">Built for the Reboot community.</div></section></div></dialog>
}
