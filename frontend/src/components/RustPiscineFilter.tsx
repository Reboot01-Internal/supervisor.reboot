import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
export function useRustPiscineFilter(){
 const [value,setValue]=useState('all'),[statuses,setStatuses]=useState<Record<string,string>>({}),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);apiFetch('/admin/users/rust-status').then(s=>{if(alive)setStatuses(s);}).catch(()=>{if(alive)setError('Rust piscine data unavailable. Reload to retry.');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
 return {value,setValue,statuses,loading,error};
}
export default function RustPiscineFilter({filter}:{filter:ReturnType<typeof useRustPiscineFilter>}){
 return <label className="directory-filter"><span>Rust piscine</span><select aria-label="Filter by Rust piscine status" disabled={filter.loading||!!filter.error} value={filter.value} onChange={e=>filter.setValue(e.target.value)}>{filter.loading?<option>Loading…</option>:filter.error?<option>Status unavailable</option>:<><option value="all">All statuses</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="working">Working on it</option><option value="not_started">Not started (no record)</option><option value="unknown">Data unavailable</option></>}</select></label>;
}
