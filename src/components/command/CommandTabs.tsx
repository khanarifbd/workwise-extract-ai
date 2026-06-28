import { NavLink } from "react-router-dom";
import { LayoutDashboard, ClipboardList, Wrench, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/command",     label: "Command",    icon: LayoutDashboard },
  { to: "/command/dm",  label: "DM Tracker", icon: ClipboardList },
  { to: "/command/aa",  label: "A&A Tracker", icon: Wrench },
  { to: "/command/log", label: "Live Log",   icon: Activity },
];

export const CommandTabs = () => (
  <nav className="rounded-2xl border bg-card/90 backdrop-blur p-1.5 shadow-sm overflow-x-auto">
    <ul className="flex items-center gap-1 min-w-max">
      {TABS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === "/command"}
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

export default CommandTabs;
