import { motion } from "motion/react";
import { MoonStar, SunMedium } from "lucide-react";

type ThemeToggleProps = {
  darkMode: boolean;
  onToggle: () => void;
};

export function ThemeToggle({ darkMode, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={darkMode}
      className="theme-switch group flex w-full items-center justify-between rounded-[15px] border border-slate-200 bg-white p-2.5 text-left transition"
    >
      <span className="flex items-center gap-3">
        <motion.span
          className="grid h-8 w-8 place-items-center rounded-[10px] bg-slate-100 text-slate-700"
          initial={false}
          animate={{ rotate: darkMode ? 180 : 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {darkMode ? <MoonStar size={15} /> : <SunMedium size={16} />}
        </motion.span>
        <span>
          <span className="block text-[13px] font-black text-slate-800">Appearance</span>
          <span className="mt-0.5 block text-[10px] font-bold text-slate-400">
            {darkMode ? "Dark mode" : "Light mode"}
          </span>
        </span>
      </span>

      <span className="relative h-6 w-11 rounded-full bg-slate-200 p-[3px] transition-colors group-aria-pressed:bg-[#6d5efc]">
        <motion.span
          className="block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_7px_rgba(15,23,42,0.25)]"
          initial={false}
          animate={{ x: darkMode ? 17 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}
