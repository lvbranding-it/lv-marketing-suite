import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Zap,
  FolderOpen,
  History,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  ClipboardList,
  Mail,
  Camera,
  PlaySquare,
  ExternalLink,
  LayoutGrid,
  Crown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import LVLogo from "@/components/LVLogo";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/skills", label: "Skills", icon: Zap },
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/contacts",  label: "Contacts",  icon: Users },
  { to: "/intake",    label: "Intake",     icon: ClipboardList },
  { to: "/campaigns",      label: "Campaigns",      icon: Mail },
  { to: "/photo-sessions", label: "Photo Sessions", icon: Camera },
  { to: "/history",        label: "History",        icon: History },
];

interface SidebarContentProps {
  collapsed?: boolean;
}

function SidebarContent({ collapsed = false }: SidebarContentProps) {
  const { user, signOut } = useAuth();
  const { org } = useOrg();
  const navigate = useNavigate();

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className={cn("flex items-center gap-3 p-4", collapsed && "justify-center")}>
        <LVLogo size={32} className="shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">LV Branding</p>
            <p className="text-xs text-sidebar-foreground/60 leading-tight">Marketing Suite</p>
          </div>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Org name */}
      {!collapsed && org && (
        <div className="px-4 py-2">
          <p className="text-xs text-sidebar-foreground/50 truncate">{org.name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) =>
          collapsed ? (
            <TooltipProvider key={to} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-center w-full p-2 rounded-md transition-colors",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      )
                    }
                  >
                    <Icon size={18} />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          )
        )}
        {/* External apps */}
        <div className="pt-2 mt-1 border-t border-sidebar-border/40 space-y-0.5">
          {collapsed ? (
            <>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://reviewflow.lvbranding.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full p-2 rounded-md transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    >
                      <PlaySquare size={18} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right">ReviewFlow</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://suite55.lvbranding.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full p-2 rounded-md transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    >
                      <LayoutGrid size={18} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right">Suite 55</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://boss.lvbranding.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full p-2 rounded-md transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    >
                      <Crown size={18} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right">LV Branding's Boss</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://sync.lvbranding.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full p-2 rounded-md transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                    >
                      <RefreshCw size={18} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="right">SYNC</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          ) : (
            <>
              <a
                href="https://reviewflow.lvbranding.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <PlaySquare size={16} />
                ReviewFlow
                <ExternalLink size={11} className="ml-auto opacity-50" />
              </a>
              <a
                href="https://suite55.lvbranding.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <LayoutGrid size={16} />
                Suite 55
                <ExternalLink size={11} className="ml-auto opacity-50" />
              </a>
              <a
                href="https://boss.lvbranding.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <Crown size={16} />
                LV Branding's Boss
                <ExternalLink size={11} className="ml-auto opacity-50" />
              </a>
              <a
                href="https://sync.lvbranding.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <RefreshCw size={16} />
                SYNC
                <ExternalLink size={11} className="ml-auto opacity-50" />
              </a>
            </>
          )}
        </div>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className={cn("p-3 space-y-1", collapsed && "flex flex-col items-center")}>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors",
              collapsed && "justify-center",
              isActive
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
            )
          }
        >
          <Settings size={16} />
          {!collapsed && "Settings"}
        </NavLink>

        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2",
            collapsed && "flex-col gap-1"
          )}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="text-xs text-sidebar-foreground/70 truncate flex-1 min-w-0">
                {user?.email}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={handleSignOut}
              >
                <LogOut size={14} />
              </Button>
            </>
          )}
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={handleSignOut}
            >
              <LogOut size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col relative shrink-0 border-r border-sidebar-border transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <SidebarContent collapsed={collapsed} />
        {/* Collapse toggle — always anchored to the sidebar's right edge */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full z-20 bg-sidebar border border-l-0 border-sidebar-border rounded-r-md p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Mobile sidebar */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden fixed top-3 left-3 z-50 bg-background shadow-md p-2"
          >
            <Menu size={20} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
