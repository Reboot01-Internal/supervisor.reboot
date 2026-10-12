/** A short, local paper burst; respects reduced motion and cleans up after itself. */
export function celebrateCompletion(anchor: HTMLElement | null) {
  if (!anchor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = anchor.getBoundingClientRect();
  const colors = ['#6d5efc', '#22a078', '#f5c74e', '#ef83a9', '#72bce8'];
  for (let i = 0; i < 28; i++) {
    const paper = document.createElement('span');
    const angle = Math.random() * Math.PI * 2;
    const distance = 45 + Math.random() * 90;
    Object.assign(paper.style, {
      position: 'fixed', left: `${rect.left + rect.width / 2}px`, top: `${rect.top + rect.height / 2}px`,
      width: '6px', height: '9px', borderRadius: '1px', background: colors[i % colors.length],
      pointerEvents: 'none', zIndex: '9999',
    });
    paper.setAttribute('aria-hidden', 'true');
    document.body.appendChild(paper);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 45;
    const animation = paper.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${x}px,${y}px) rotate(${i * 35}deg)`, opacity: 1, offset: .45 },
      { transform: `translate(${x * 1.2}px,${y + 110}px) rotate(${i * 60}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.15,.65,.4,1)' });
    animation.finished.then(() => paper.remove(), () => paper.remove());
  }
}
