import { CircleCheck, CirclePause, CircleHelp } from 'lucide-react';
import './AccountStatusAction.css';

export default function AccountStatusBadge({active}:{active?:boolean}) {
 const label=active===true?'Active':active===false?'Inactive':'Status unavailable';
 const Icon=active===true?CircleCheck:active===false?CirclePause:CircleHelp;
 return <span className="account-status-badge" data-active={active} aria-label={`Account status: ${label}`} title={`Account status: ${label}`}><Icon size={13} aria-hidden="true"/>{label}</span>;
}
