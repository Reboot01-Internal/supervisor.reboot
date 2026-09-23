const projects = ["go-reloaded", "ascii-art", "ascii-art-web", "groupie-tracker", "lem-in", "forum", "make-your-game", "real-time-forum", "graphql", "social-network", "mini-framework", "bomberman-dom", "smart-road", "filler", "rt", "localhost", "multiplayer-fps", "0-shell"].sort((a, b) => b.length - a.length);
const titles: Record<string, string> = { graphql: "GraphQL", rt: "Ray Tracer", "bomberman-dom": "Bomberman", "0-shell": "0-shell", "ascii-art": "ASCII Art", "ascii-art-web": "ASCII Art Web", "multiplayer-fps": "Multiplayer FPS" };
export function projectForBoard(name: string) {
  const slug = projects.find((project) => new RegExp(`(?:^|-)${project}(?:-\\d+)?$`, "i").test(name.trim()));
  return slug ? { slug, title: titles[slug] || slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") } : null;
}
