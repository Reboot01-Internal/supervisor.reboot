import "./GiteaProfileLink.css";
type Props = { username?: string };

export default function GiteaProfileLink({ username }: Props) {
  const login = (username || "").trim().replace(/^@/, "");
  if (!login) return null;

  return (
    <a
      href={`https://learn.reboot01.com/git/${encodeURIComponent(login)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open @${login} on Gitea`}
      aria-label={`Open @${login}'s Gitea profile in a new tab`}
      className="gitea-profile-link"
    >
      <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M7 9H25V21C25 25 21 28 16 28S7 25 7 21V9Z" fill="#609926" />
        <path d="M7 12H5C1 12 1 21 7 21" stroke="#609926" strokeWidth="3" />
        <path d="M13 3V6M19 2V6" stroke="#609926" strokeWidth="2" strokeLinecap="round" />
        <path d="m16 11 7 7-7 7-7-7 7-7Z" fill="white" />
        <path d="M14 16V20M14 17H18V20" stroke="#609926" strokeWidth="1.4" />
        <circle cx="14" cy="15" r="1.4" fill="#609926" /><circle cx="14" cy="21" r="1.4" fill="#609926" /><circle cx="18" cy="21" r="1.4" fill="#609926" />
      </svg>
      <span>Gitea profile</span>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M7 9l6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  );
}
