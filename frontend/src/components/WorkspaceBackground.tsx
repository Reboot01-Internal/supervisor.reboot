import './WorkspaceBackground.css';

/** Decorative only: shared by every page using the workspace layout. */
export default function WorkspaceBackground() {
 return <div className="workspace-background" aria-hidden="true">
  <div className="workspace-background-glow"/>
  {['</>', '[ ]', '{ }', ';', '/', '</>'].map((symbol,index)=><span key={index} className={`workspace-background-symbol symbol-position-${index}`}>{symbol}</span>)}
 </div>;
}
