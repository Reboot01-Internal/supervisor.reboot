import './WorkspaceBackground.css';

/** Decorative only: shared by every page using the workspace layout. */
export default function WorkspaceBackground({ language }: { language?: "js" | "rust" | "go" | "custom" }) {
 return <div className="workspace-background" data-language={language} aria-hidden="true">
  <div className="workspace-background-glow"/>
  {['</>', '[ ]', '{ }', ';', '/', '</>'].map((symbol,index)=><span key={index} className={`workspace-background-symbol symbol-position-${index}`}>{symbol}</span>)}
 </div>;
}
