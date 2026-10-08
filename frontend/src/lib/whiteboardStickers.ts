export type StickerGroup = 'Work & ideas' | 'Cute' | 'Board helpers' | 'Tech symbols' | 'Line accents';
export type WhiteboardSticker = {id:string;name:string;group:StickerGroup;sheet:'cute'|'helpers'|'work'|'accents';x:number;y:number;width:number;height:number};
export const stickerSheets = {accents:{url:'/stickers/accents-atlas.svg',width:1200,height:1600},work:{url:'/stickers/work-atlas.png',width:1024,height:1536},cute:{url:'/stickers/cute-atlas.png',width:1448,height:1086},helpers:{url:'/stickers/helpers-atlas.png',width:1278,height:1230}};
const work=[["brainstorm", "Brainstorm"], ["discussion", "Discussion"], ["focus-group", "Focus group"], ["feedback", "Feedback"], ["training", "Training"], ["mentoring", "Mentoring"], ["master-class", "Master class"], ["new-learning", "New learning"], ["audit", "Audit"], ["review", "Review"], ["recognition", "Recognition"], ["trophy", "Trophy"], ["reward", "Reward"], ["photo", "Photo"], ["lanyard", "Lanyard"], ["community", "Community"], ["catchup", "Catchup"], ["workspace", "Workspace"], ["concept-day", "Concept day"], ["third-eye", "Third eye"], ["hackathon", "Hackathon"], ["game-jam", "Game jam"], ["spin-the-wheel", "Spin the wheel"], ["challenge", "Challenge"], ["project-day", "Project day"], ["switch-project", "Switch project"], ["problem-solving", "Problem solving"], ["escalation", "Escalation"], ["decision", "Decision"], ["action-item", "Action item"], ["priority", "Priority"], ["parking-lot", "Parking lot"]];
const workBounds=[[66, 53, 163, 138], [307, 57, 168, 124], [560, 40, 148, 150], [798, 53, 162, 125], [61, 215, 185, 127], [306, 208, 172, 131], [560, 199, 162, 144], [794, 201, 173, 144], [78, 360, 154, 152], [328, 368, 133, 143], [567, 361, 132, 150], [801, 365, 157, 145], [74, 531, 155, 152], [309, 532, 165, 145], [561, 532, 145, 157], [777, 540, 202, 132], [44, 710, 213, 160], [297, 715, 200, 158], [538, 713, 201, 155], [787, 713, 195, 148], [49, 914, 201, 128], [302, 894, 183, 152], [560, 893, 149, 155], [791, 890, 178, 154], [59, 1078, 180, 136], [287, 1074, 222, 156], [562, 1070, 159, 159], [786, 1068, 181, 158], [58, 1259, 182, 170], [327, 1253, 135, 173], [569, 1264, 139, 161], [795, 1256, 159, 166]];
const cute=[['star','Star'],['cloud','Cloud'],['coffee-cat','Coffee cat'],['heart','Heart'],['flower','Flower'],['coffee','Coffee'],['plant','Plant'],['rocket','Rocket'],['idea','Idea'],['laptop','Laptop'],['checklist','Checklist'],['moon','Moon']];
const helpers=[['comment','Comment'],['question','Question'],['idea','Idea'],['important','Important'],['todo','To do'],['progress','In progress'],['done','Done'],['blocked','Blocked'],['deadline','Deadline'],['decision','Decision'],['connect','Connect'],['reminder','Reminder'],['code','Code </>'],['braces','Braces { }'],['brackets','Brackets [ ]'],['syntax','Syntax ; /']];
// Individual artwork bounds, including the die-cut borders. Grid cells overlap adjacent artwork.
const cuteBounds=[
 [40,48,298,290],[374,64,333,284],[756,43,319,306],[1106,86,309,245],
 [57,395,299,332],[404,388,302,331],[761,393,300,332],[1105,392,304,335],
 [43,744,270,301],[361,764,329,273],[771,756,291,294],[1113,758,296,287],
];
const helperBounds=[
 [54,91,238,226],[359,81,255,231],[655,63,272,257],[967,74,254,235],
 [30,424,285,134],[327,424,315,134],[652,423,285,135],[947,422,303,136],
 [51,644,258,236],[365,647,259,228],[648,674,295,175],[981,641,260,234],
 [48,979,262,179],[386,975,231,179],[693,975,195,178],[1010,973,201,181],
];
function artworkBounds(bounds:number[]){const [x,y,width,height]=bounds;return{x:x-2,y:y-2,width:width+4,height:height+4};}
export const whiteboardStickers:WhiteboardSticker[]=[
{id:"accent-emphasis-rays",name:"Emphasis rays",group:'Line accents',sheet:'accents',x:0,y:0,width:400,height:400},
{id:"accent-underline",name:"Underline",group:'Line accents',sheet:'accents',x:400,y:0,width:400,height:400},
{id:"accent-double-underline",name:"Double underline",group:'Line accents',sheet:'accents',x:800,y:0,width:400,height:400},
{id:"accent-swoosh",name:"Swoosh",group:'Line accents',sheet:'accents',x:0,y:400,width:400,height:400},
{id:"accent-wave",name:"Wave",group:'Line accents',sheet:'accents',x:400,y:400,width:400,height:400},
{id:"accent-zigzag",name:"Zigzag",group:'Line accents',sheet:'accents',x:800,y:400,width:400,height:400},
{id:"accent-curved-arrow",name:"Curved arrow",group:'Line accents',sheet:'accents',x:0,y:800,width:400,height:400},
{id:"accent-straight-arrow",name:"Straight arrow",group:'Line accents',sheet:'accents',x:400,y:800,width:400,height:400},
{id:"accent-circle-highlight",name:"Circle highlight",group:'Line accents',sheet:'accents',x:800,y:800,width:400,height:400},
{id:"accent-bracket-accent",name:"Bracket accent",group:'Line accents',sheet:'accents',x:0,y:1200,width:400,height:400},
{id:"accent-sparkle",name:"Sparkle",group:'Line accents',sheet:'accents',x:400,y:1200,width:400,height:400},
{id:"accent-burst",name:"Burst",group:'Line accents',sheet:'accents',x:800,y:1200,width:400,height:400},
 ...work.map(([id,name],n):WhiteboardSticker=>({id:`work-${id}`,name,group:'Work & ideas',sheet:'work',...artworkBounds(workBounds[n])})),
 ...cute.map(([id,name],n):WhiteboardSticker=>({id:`cute-${id}`,name,group:'Cute',sheet:'cute',...artworkBounds(cuteBounds[n])})),
 ...helpers.map(([id,name],n):WhiteboardSticker=>({id:`helper-${id}`,name,group:n>=12?'Tech symbols':'Board helpers',sheet:'helpers',...artworkBounds(helperBounds[n])})),
];
export function getWhiteboardSticker(id?:string){return whiteboardStickers.find(sticker=>sticker.id===id);}
const exportSheets=new Map<string,Promise<string>>();
export function stickerSheetData(sheet:keyof typeof stickerSheets){
 let result=exportSheets.get(sheet);if(!result){result=fetch(stickerSheets[sheet].url).then(response=>{if(!response.ok)throw new Error('Could not load stickers for export. Please try again.');return response.blob();}).then(blob=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not export stickers'));reader.readAsDataURL(blob);}));exportSheets.set(sheet,result);result.catch(()=>exportSheets.delete(sheet));}return result;
}
