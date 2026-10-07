export type TextRun = { start:number; end:number; textColor?:string; font?:number; bold?:boolean; italic?:boolean };
export type TextStyle = Pick<TextRun,'textColor'|'font'|'bold'|'italic'>;
export function textSegments(text:string,runs:TextRun[]=[]){
 const boundaries=[...new Set([0,text.length,...runs.flatMap(r=>[Math.max(0,Math.min(text.length,r.start)),Math.max(0,Math.min(text.length,r.end))])])].sort((a,b)=>a-b);
 return boundaries.slice(0,-1).map((start,i)=>{const end=boundaries[i+1];const style:TextStyle={};for(const r of runs)if(r.start<=start&&r.end>=end){for(const k of ['textColor','font','bold','italic'] as const)if(r[k]!==undefined)Object.assign(style,{[k]:r[k]});}return{start,end,text:text.slice(start,end),...style};});
}
export function applyTextStyle(text:string,runs:TextRun[],start:number,end:number,style:TextStyle):TextRun[]{
 const points=[...new Set([0,text.length,start,end,...runs.flatMap(r=>[r.start,r.end])])].filter(n=>n>=0&&n<=text.length).sort((a,b)=>a-b);
 const output:TextRun[]=[];
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];const current:TextStyle={};for(const r of runs)if(r.start<=a&&r.end>=b){for(const k of ['textColor','font','bold','italic'] as const)if(r[k]!==undefined)Object.assign(current,{[k]:r[k]});}if(a>=start&&b<=end)Object.assign(current,style);if(Object.keys(current).length)output.push({start:a,end:b,...current});}
 return output;
}
export function adjustTextRuns(before:string,after:string,runs:TextRun[]):TextRun[]{
 let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
 let oldEnd=before.length,newEnd=after.length;while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
 const delta=newEnd-oldEnd;
 return runs.map(r=>({...r,start:r.start<=start?r.start:r.start>=oldEnd?r.start+delta:start,end:r.end<=start?r.end:r.end>=oldEnd?r.end+delta:newEnd})).filter(r=>r.end>r.start);
}
