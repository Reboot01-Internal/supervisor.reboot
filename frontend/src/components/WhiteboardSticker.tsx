import {useId} from 'react';
import {getWhiteboardSticker,stickerSheets} from '../lib/whiteboardStickers';
export default function WhiteboardSticker({id}:{id?:string}){
 const clipId=useId().replace(/:/g,'-');
 const sticker=getWhiteboardSticker(id);if(!sticker)return null;const sheet=stickerSheets[sticker.sheet];
 return <svg className="wb-sticker-art" viewBox={`${sticker.x} ${sticker.y} ${sticker.width} ${sticker.height}`} role="img" aria-label={sticker.name}><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={sticker.x} y={sticker.y} width={sticker.width} height={sticker.height}/></clipPath></defs><g clipPath={`url(#${clipId})`}><image href={sheet.url} x="0" y="0" width={sheet.width} height={sheet.height}/></g></svg>;
}
