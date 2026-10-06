import { useEffect, useRef } from "react";
import { X, ArrowUpRight, Sparkles, ShieldCheck } from "lucide-react";
import LoginPage from "../pages/LoginPage";
import "./LandingLogin.css";

export default function LandingLogin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) {
      dialog?.showModal();
      dialog?.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.focus({ preventScroll: true });
    }
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  return <dialog ref={ref} className="landing-login-dialog flow-login" onCancel={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }} aria-labelledby="login-heading">
    <div className="flow-login-shell">
      <button type="button" className="flow-login-dismiss" aria-label="Close sign in" onClick={onClose}><X size={18} /></button>
      <aside className="flow-login-visual">
        <div className="flow-login-brand"><img src="/favicon-icon.png" alt="" /><span>TaskFlow<span>.</span></span><small>FOR REBOOT</small></div>
        <div className="flow-login-story"><span className="flow-login-eyebrow"><span />YOUR NEXT CHAPTER</span>
          <h2>A little spark.<br />A big <em>possibility.</em></h2><p>Your people. Your projects.<br />A space to make things happen.</p>
        </div>
        <div className="flow-login-visual-footer"><span>MADE FOR OUR COMMUNITY</span><span>01 / LET’S BEGIN <ArrowUpRight size={13} /></span></div>
      </aside>
      <section className="flow-login-form">
        <span className="flow-login-eyebrow"><span />BACK TO YOUR WORKSPACE</span>
        <h2 id="login-heading">Welcome back.<br /><em>Find your flow.</em></h2>
        <p>Your next great thing is waiting.<br />Sign in with your Reboot account to get started.</p>
        <LoginPage embedded />
        <div className="flow-login-trust"><ShieldCheck size={15} /><span>Your Reboot account. Your TaskFlow workspace.</span></div>
        <div className="flow-login-form-footer"><span></span><Sparkles size={14} /></div>
      </section>
    </div>
  </dialog>;
}
