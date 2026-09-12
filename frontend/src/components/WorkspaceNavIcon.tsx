import { PanelsTopLeft, Columns3, Network, CalendarClock, Radio, ChartNoAxesCombined, ContactRound } from "lucide-react";

const icons = {
  Dashboard: PanelsTopLeft,
  Boards: Columns3,
  Users: Network,
  Supervisors: ContactRound,
  Meetings: CalendarClock,
  Notifications: Radio,
  Reports: ChartNoAxesCombined,
};

export default function WorkspaceNavIcon({ label, fallback }: { label: string; fallback: React.ReactNode }) {
  const Icon = icons[label as keyof typeof icons];
  return Icon ? <Icon size={18} strokeWidth={1.6} aria-hidden="true"/> : <>{fallback}</>;
}
