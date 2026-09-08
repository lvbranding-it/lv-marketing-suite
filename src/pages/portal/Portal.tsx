import PortalWelcome from "./PortalWelcome";
import PortalCommissions from "./PortalCommissions";
import PortalAdvisor from "./PortalAdvisor";
import PortalTeam from "./PortalTeam";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Bell,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  ListFilter,
  Plus,
  Search,
  Users,
  MessageSquare,
  ArrowUpRight,
  LayoutGrid,
  List,
  LogOut,
} from "lucide-react";
import LVLogo from "@/components/LVLogo";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  usePortalWorkspaces,
  usePortalNotifications,
  usePortalLeads,
  usePortalStats,
  usePortalDetail,
  usePortalMembers,
  usePortalCommand,
} from "@/hooks/usePortal";
import {
  canSubmit,
  emptyLead,
  stages,
  searchTerm,
  type LeadFields,
  type PortalLead,
  type PortalWorkspace,
  type PortalNote,
} from "@/lib/portal/types";
import { previewLeads } from "@/lib/portal/preview";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
function usePortalText() {
  const { t, language } = useLanguage();
  return { p: (key: string) => t(`portal.${key}`), language };
}
function StageBadge({ stage }: { stage: string }) {
  const { p } = usePortalText();
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        stage === "draft"
          ? "bg-muted text-muted-foreground"
          : stage === "won"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-primary/5 text-primary border-primary/15",
      )}
    >
      {p(stage)}
    </span>
  );
}

export default function Portal({ preview = false }: { preview?: boolean }) {
  const query = usePortalWorkspaces(preview);
  const [params] = useSearchParams();
  const { p } = usePortalText();
  const workspaces = preview
    ? [
        {
          org_id: "preview",
          name: "LV Branding",
          role: "ambassador",
        } as PortalWorkspace,
      ]
    : (query.data ?? []);
  const selected = params.get("org")
    ? workspaces.find((w) => w.org_id === params.get("org"))
    : workspaces[0];
  if (!preview && (query.isLoading || query.isError || !selected))
    return (
      <main className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border bg-card p-8 space-y-4">
          <LVLogo size={40} />
          <h1 className="text-2xl font-semibold">
            {query.isLoading
              ? p("loading")
              : query.isError
                ? p("unavailable")
                : p("noAccess")}
          </h1>
          <p className="text-muted-foreground">
            {query.isError
              ? p("unavailableBody")
              : !query.isLoading
                ? p("noAccessBody")
                : ""}
          </p>
          <Button onClick={() => query.refetch()}>{p("retry")}</Button>
        </div>
      </main>
    );
  return (
    <PortalWorkspaceView
      key={selected!.org_id}
      workspace={selected!}
      workspaces={workspaces}
      preview={preview}
    />
  );
}

function PortalWorkspaceView({
  workspace,
  workspaces,
  preview,
}: {
  workspace: PortalWorkspace;
  workspaces: PortalWorkspace[];
  preview: boolean;
}) {
  const { p, language } = usePortalText();
  const { user, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const [previewAdmin, setPreviewAdmin] = useState(false);
  const role = preview && previewAdmin ? "admin" : workspace.role;
  const tab = params.get("tab") ?? "dashboard",
    leadId = params.get("lead") ?? undefined,
    isNew = params.get("new") === "1";
  const [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [priority, setPriority] = useState(""),
    [sort, setSort] = useState("created_at"),
    [page, setPage] = useState(0),
    [cards, setCards] = useState(false);
  const [menuCollapsed,setMenuCollapsed]=useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const options = {
    search,
    stage,
    priority,
    sort: tab === "followups" ? "followup_at" : sort,
    page,
    due: tab === "followups",
  };
  const list = usePortalLeads(workspace.org_id, options, preview),
    stats = usePortalStats(workspace.org_id, preview),
    detail = usePortalDetail(workspace.org_id, leadId, preview);
  const notifications = usePortalNotifications(workspace.org_id, preview);
  const members = usePortalMembers(
    workspace.org_id,
    role === "admin" && !preview,
  );
  const command = usePortalCommand();
  const demo = useMemo(() => previewLeads(), []);
  const demoFiltered = demo.filter(
    (l) =>
      (!stage || l.shared_stage === stage) &&
      (!priority || l.priority === priority) &&
      (!options.due || !!l.followup_at) &&
      `${l.company} ${l.first_name} ${l.last_name} ${l.email} ${l.phone}`
        .toLowerCase()
        .includes(searchTerm(search).toLowerCase()),
  );
  const rows = preview ? demoFiltered : (list.data?.rows ?? []),
    count = preview ? demoFiltered.length : (list.data?.count ?? 0);
  const lead = preview ? demo.find((l) => l.id === leadId) : detail.data?.lead;
  const numbers = preview ? [3, 2, 1] : (stats.data ?? [0, 0, 0]);
  useEffect(() => {
    setPage(0);
  }, [search, stage, priority, sort, tab]);
  useEffect(() => {
    setError("");
    setNotice("");
  }, [leadId, isNew, tab]);
  const navigate = (changes: Record<string, string | undefined>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined) next.delete(k);
        else next.set(k, v);
      }
      return next;
    });
  const goTab = (next: string) =>
    navigate({ tab: next, lead: undefined, new: undefined });
  const perform = async (action: () => Promise<unknown>, success = "saved") => {
    if (preview) return false;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(p(success));
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        p(
          code === "40001"
            ? "conflict"
            : code === "22023"
              ? "required"
              : "error",
        ),
      );
      return false;
    } finally {
      setPending(false);
    }
  };
  const date = (v: string | null) =>
    v
      ? new Date(v).toLocaleDateString(language, {
          month: "short",
          day: "numeric",
        })
      : p("none");
  const tabs = [
    { key: "dashboard", label: "dashboard", icon: LayoutDashboard },
    { key: "advisor", label: "advisor", icon: Bot },
    ...(role !== "staff" ? [{key:"commissions",label:"commissions",icon:BriefcaseBusiness}] : []),
    {
      key: "leads",
      label: role === "admin" ? "allLeads" : "leads",
      icon: BriefcaseBusiness,
    },
    { key: "followups", label: "followups", icon: Clock3 },
    ...(role === "admin" ? [{ key: "team", label: "team", icon: Users }] : []),
  ];
  return (
    <div className={tab === "advisor" && !leadId && !isNew ? "h-dvh overflow-hidden bg-background text-foreground flex flex-col md:flex-row" : "min-h-screen bg-[#f7f7f8] text-foreground md:flex"}>
      {user&&<PortalWelcome userId={user.id} org={workspace.org_id} role={role} preview={preview}/>}
      <aside className={cn("bg-lv-charcoal text-white md:fixed md:inset-y-0 flex flex-col z-20",menuCollapsed?"md:w-16":"md:w-64")}>
        <button type="button" aria-label={p(menuCollapsed?"expandMenu":"collapseMenu")} aria-expanded={!menuCollapsed} onClick={()=>setMenuCollapsed(v=>!v)} className="hidden md:flex absolute -right-6 top-1/2 z-30 h-6 w-6 items-center justify-center rounded-r-md border border-white/15 bg-lv-charcoal text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          {menuCollapsed?<ChevronRight size={14}/>:<ChevronLeft size={14}/>}
        </button>
        <div className={cn("px-6 py-6 flex items-center gap-3",menuCollapsed&&"md:px-3 md:justify-center")}>
          <LVLogo size={36} />
          <div className={menuCollapsed?"md:hidden":undefined}>
            <p className="font-semibold tracking-wide">LV Branding</p>
            <p className="text-xs text-white/60 mt-0.5">{p("title")}</p>
          </div>
        </div>
        <div className="hidden md:block mx-5 border-t border-white/10 mb-6" />
        <nav
          aria-label={p("title")}
          className={cn("flex md:flex-col overflow-auto gap-1 px-3 pb-3",menuCollapsed&&"md:px-2")}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              aria-label={p(label)}
              title={menuCollapsed?p(label):undefined}
              onClick={() => goTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm whitespace-nowrap text-left transition-colors",
                menuCollapsed && "md:px-0 md:justify-center",
                tab === key
                  ? "bg-primary text-white"
                  : "text-white/70 hover:bg-white/10",
              )}
            >
              <Icon size={18} />
              <span className={menuCollapsed?"md:hidden":undefined}>{p(label)}</span>
              {tab === key && !menuCollapsed && (
                <ArrowRight size={14} className="hidden md:block ml-auto" />
              )}
            </button>
          ))}
        </nav>
        <div className={cn("hidden md:block mt-auto border-t border-white/10 space-y-4",menuCollapsed?"p-2":"p-6")}>
          <p className={cn("text-sm text-white/60",menuCollapsed&&"hidden")}>
            {p("profileRole")}
            <span className="block text-white mt-1">{p(role)}</span>
          </p>
          <LanguageSwitcher collapsed={menuCollapsed} />
          {!preview && (
            <button
              aria-label={p("signOut")}
              title={p("signOut")}
              onClick={() => signOut()}
              className="flex gap-2 items-center text-sm text-white/60"
            >
              <LogOut size={15} />
              {!menuCollapsed&&p("signOut")}
            </button>
          )}
          <p className={cn("text-xs text-white/40 pt-3",menuCollapsed&&"hidden")}>Strategy First. Always.</p>
        </div>
      </aside>
      <main className={cn("min-w-0 flex-1",menuCollapsed?"md:ml-16":"md:ml-64",tab==="advisor"&&"min-h-0 flex flex-col")}>
        <header hidden={tab === "advisor" && !leadId && !isNew} className={tab === "advisor" && !leadId && !isNew ? "hidden" : "flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 sm:px-9 py-4"}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>LV Branding</span>
            <span>/</span>
            <span className="text-foreground">
              {p(tabs.find((t) => t.key === tab)?.label ?? "dashboard")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={p("notifications")}
                  className="relative"
                >
                  <Bell size={18} />
                  {notifications.data?.some((n) => !n.read_at) && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 max-w-[calc(100vw-2rem)]"
              >
                <h2 className="font-semibold mb-3">{p("notifications")}</h2>
                {notifications.isError ? (
                  <p className="text-sm text-muted-foreground">{p("error")}</p>
                ) : !notifications.data?.length ? (
                  <p className="text-sm text-muted-foreground">
                    {p("noNotifications")}
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-1">
                    {notifications.data.map((n) => (
                      <button
                        key={n.id}
                        disabled={pending}
                        onClick={() =>
                          void perform(async () => {
                            await command("portal_read_notification", {
                              p_id: n.id,
                            });
                            navigate({
                              tab: "leads",
                              lead: n.lead_id,
                              new: undefined,
                            });
                          })
                        }
                        className={cn(
                          "block w-full text-left rounded p-3 hover:bg-muted text-sm",
                          !n.read_at && "bg-primary/5",
                        )}
                      >
                        <p>
                          {p(
                            n.kind === "submitted" ? "submittedEvent" : n.kind,
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {date(n.created_at)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {workspaces.length > 1 && (
              <select
                aria-label={p("workspace")}
                className={selectClass}
                value={workspace.org_id}
                onChange={(e) => setParams({ org: e.target.value })}
              >
                {workspaces.map((w) => (
                  <option key={w.org_id} value={w.org_id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <div className="md:hidden rounded-md bg-lv-charcoal p-1">
              <LanguageSwitcher />
            </div>
            {preview && (
              <select
                className={selectClass}
                aria-label={p("profileRole")}
                value={previewAdmin ? "admin" : "ambassador"}
                onChange={(e) => setPreviewAdmin(e.target.value === "admin")}
              >
                <option value="ambassador">{p("ambassador")}</option>
                <option value="admin">{p("admin")}</option>
              </select>
            )}
            {!preview && role === "admin" && (
              <Link
                to="/dashboard"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Marketing Suite <ArrowUpRight className="inline" size={14} />
              </Link>
            )}
          </div>
        </header>
        <div className={tab === "advisor" && !leadId && !isNew ? "flex-1 min-h-0 flex flex-col" : "mx-auto max-w-7xl p-5 sm:p-9 space-y-7"}>
          {preview && tab !== "advisor" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
              <p className="font-medium">{p("preview")}</p>
              <p className="mt-1 text-xs">{p("previewBody")}</p>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive"
            >
              {error}
              <Button
                variant="ghost"
                onClick={async () => {
                  await detail.refetch();
                  setReloadKey((v) => v + 1);
                }}
              >
                {p("refresh")}
              </Button>
            </div>
          )}
          {notice && (
            <p
              role="status"
              className="text-sm text-emerald-800 flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              {notice}
            </p>
          )}
          <div className={tab === "advisor" && !isNew && !leadId ? "flex-1 min-h-0" : "hidden"} hidden={tab !== "advisor" || isNew || !!leadId}>
            <PortalAdvisor org={workspace.org_id} preview={preview} active={tab === "advisor" && !isNew && !leadId} />
          </div>
          {isNew || leadId ? (
            <>
              <button
                onClick={() => navigate({ lead: undefined, new: undefined })}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
              >
                <ArrowLeft size={16} />
                {p("back")}
              </button>
              {leadId && !lead ? (
                <div className="rounded-xl bg-white border p-8">
                  {detail.isError ? p("unavailable") : p("loading")}
                </div>
              ) : (
                <LeadWorkspace
                  key={`${lead?.id ?? "new"}:${reloadKey}`}
                  lead={lead}
                  role={role}
                  notes={preview ? [] : (detail.data?.notes ?? [])}
                  activity={preview ? [] : (detail.data?.activity ?? [])}
                  internalStage={
                    preview
                      ? lead?.shared_stage === "draft"
                        ? undefined
                        : lead?.shared_stage
                      : detail.data?.internalStage
                  }
                  members={members.data ?? []}
                  date={date}
                  pending={pending}
                  preview={preview}
                  userId={user?.id}
                  onSave={(fields, editVersion) =>
                    perform(async () => {
                      const id = await command("portal_save_lead", {
                        p_org: workspace.org_id,
                        p_fields: fields,
                        p_id: lead?.id ?? null,
                        p_version: editVersion ?? null,
                      });
                      navigate({ lead: id as string, new: undefined });
                    })
                  }
                  onSubmit={() =>
                    perform(
                      () =>
                        command("portal_submit_lead", {
                          p_id: lead!.id,
                          p_version: lead!.version,
                        }),
                      "sent",
                    )
                  }
                  onNote={(body, visibility, note) =>
                    perform(() =>
                      command("portal_save_note", {
                        p_lead: lead!.id,
                        p_body: body,
                        p_visibility: visibility,
                        p_note: note?.id ?? null,
                        p_updated_at: note?.updated_at ?? null,
                      }),
                    )
                  }
                  onManage={(newStage, assignee, publish) =>
                    perform(() =>
                      command("portal_manage_lead", {
                        p_id: lead!.id,
                        p_version: lead!.version,
                        p_stage: newStage,
                        p_assignee: assignee,
                        p_publish: publish,
                      }),
                    )
                  }
                />
              )}
            </>
          ) : tab === "commissions" && role !== "staff" ? (<PortalCommissions org={workspace.org_id} admin={role === "admin"} preview={preview}/>) : tab === "advisor" ? null : tab === "team" && role === "admin" ? (
            <PortalTeam org={workspace.org_id} preview={preview} />
          ) : (
            <>
              {tab === "dashboard" ? (
                <>
                  <section className="relative overflow-hidden rounded-2xl bg-lv-charcoal text-white p-7 sm:p-9">
                    <div
                      aria-hidden="true"
                      className="absolute right-0 top-0 h-full w-2 bg-primary"
                    />
                    <p className="text-xs tracking-[0.18em] uppercase text-white/50 mb-4">
                      {p(role)} / LV Branding
                    </p>
                    <h1 className="text-2xl sm:text-3xl font-semibold max-w-2xl leading-tight">
                      {p("welcome")}
                    </h1>
                    <p className="mt-4 max-w-xl text-sm sm:text-base text-white/65 leading-relaxed">
                      {p("welcomeBody")}
                    </p>
                    <Button
                      onClick={() => goTab("advisor")}
                      className="mt-6 mr-3 gap-2"
                    >
                      <Bot size={16} />
                      {p("openAdvisor")}
                    </Button>
                    {role !== "staff" && (
                      <Button
                        onClick={() => navigate({ new: "1" })}
                        className="mt-6 gap-2"
                      >
                        <Plus size={16} />
                        {p("newLead")}
                      </Button>
                    )}
                  </section>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { label: "active", icon: BriefcaseBusiness },
                      { label: "submitted", icon: CheckCircle2 },
                      { label: "due", icon: Clock3 },
                    ].map(({ label, icon: Icon }, i) => (
                      <button
                        key={label}
                        onClick={() => goTab(i === 2 ? "followups" : "leads")}
                        className="rounded-xl border bg-white p-5 text-left flex items-start justify-between hover:border-primary/30"
                      >
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {p(label)}
                          </p>
                          <p className="mt-3 text-3xl font-semibold">
                            {stats.isLoading && !preview
                              ? "…"
                              : stats.isError
                                ? "—"
                                : numbers[i]}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "rounded-lg p-2.5",
                            i === 2
                              ? "bg-amber-50 text-amber-700"
                              : "bg-primary/5 text-primary",
                          )}
                        >
                          <Icon size={19} />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-semibold">
                      {p(
                        tab === "followups"
                          ? "followups"
                          : role === "admin"
                            ? "allLeads"
                            : "leads",
                      )}
                    </h1>
                    <p className="text-muted-foreground mt-2">
                      {p("subtitle")}
                    </p>
                  </div>
                  {role !== "staff" && (
                    <Button
                      onClick={() => navigate({ new: "1" })}
                      className="gap-2"
                    >
                      <Plus size={16} />
                      {p("newLead")}
                    </Button>
                  )}
                </div>
              )}
              <section className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold">{p("recent")}</h2>
                  <div className="flex gap-1">
                    <Button
                      variant={!cards ? "secondary" : "ghost"}
                      size="icon"
                      aria-label={p("table")}
                      aria-pressed={!cards}
                      onClick={() => setCards(false)}
                    >
                      <List size={17} />
                    </Button>
                    <Button
                      variant={cards ? "secondary" : "ghost"}
                      size="icon"
                      aria-label={p("cards")}
                      aria-pressed={cards}
                      onClick={() => setCards(true)}
                    >
                      <LayoutGrid size={17} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-56">
                    <Search
                      size={17}
                      className="absolute top-3 left-3 text-muted-foreground"
                    />
                    <Input
                      className="pl-10 bg-white"
                      aria-label={p("search")}
                      placeholder={p("search")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className={selectClass}
                    aria-label={p("stage")}
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                  >
                    <option value="">{p("allStages")}</option>
                    {stages.map((s) => (
                      <option key={s} value={s}>
                        {p(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    aria-label={p("priority")}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="">{p("allPriorities")}</option>
                    {["high", "normal", "low"].map((s) => (
                      <option key={s} value={s}>
                        {p(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    aria-label={p("sort")}
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="created_at">{p("newest")}</option>
                    <option value="updated_at">{p("updated")}</option>
                    <option value="followup_at">{p("soonest")}</option>
                  </select>
                </div>
                {!preview && list.isError ? (
                  <div role="alert" className="bg-white border rounded-xl p-8">
                    {p("error")}{" "}
                    <Button variant="outline" onClick={() => list.refetch()}>
                      {p("retry")}
                    </Button>
                  </div>
                ) : !preview && list.isLoading ? (
                  <div role="status" className="p-10 text-center">
                    {p("loading")}
                  </div>
                ) : !rows.length ? (
                  <div className="text-center rounded-xl border bg-white py-14 px-6">
                    <ListFilter
                      size={28}
                      className="text-primary/50 mx-auto mb-4"
                    />
                    <h3 className="font-medium">
                      {p(
                        search || stage || priority || tab === "followups"
                          ? "noMatches"
                          : "noLeads",
                      )}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {p("noLeadsBody")}
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      className={cn(
                        "grid gap-4",
                        cards ? "sm:grid-cols-2 xl:grid-cols-3" : "md:hidden",
                      )}
                    >
                      {rows.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => navigate({ lead: l.id })}
                          className="text-left rounded-xl border bg-white p-5 hover:border-primary/40"
                        >
                          <div className="flex justify-between gap-3">
                            <StageBadge stage={l.shared_stage} />
                            <ArrowUpRight
                              size={17}
                              className="text-muted-foreground"
                            />
                          </div>
                          <h3 className="font-semibold mt-4">
                            {l.company || "—"}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {l.first_name} {l.last_name}
                          </p>
                          <p className="text-sm mt-4 line-clamp-2">
                            {l.next_action || l.service || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-4 flex gap-2 items-center">
                            <Clock3 size={13} />
                            {date(l.followup_at)}
                          </p>
                        </button>
                      ))}
                    </div>
                    {!cards && (
                      <div className="hidden md:block overflow-x-auto rounded-xl border bg-white">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              {[
                                "company",
                                "stage",
                                "nextAction",
                                "followupAt",
                                "priority",
                                "open",
                              ].map((k) => (
                                <th
                                  scope="col"
                                  key={k}
                                  className="px-5 py-3 font-medium"
                                >
                                  {p(k)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rows.map((l) => (
                              <tr key={l.id} className="hover:bg-muted/20">
                                <td className="px-5 py-5">
                                  <button
                                    onClick={() => navigate({ lead: l.id })}
                                    className="text-left font-medium hover:text-primary"
                                  >
                                    {l.company || "—"}
                                  </button>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {l.first_name} {l.last_name}
                                  </p>
                                </td>
                                <td className="px-5 py-5">
                                  <StageBadge stage={l.shared_stage} />
                                </td>
                                <td className="px-5 py-5 max-w-52 text-muted-foreground">
                                  {l.next_action || "—"}
                                </td>
                                <td className="px-5 py-5 whitespace-nowrap">
                                  <span
                                    className={
                                      l.followup_at &&
                                      new Date(l.followup_at) < new Date()
                                        ? "text-amber-700"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {date(l.followup_at)}
                                  </span>
                                  {l.followup_at &&
                                    new Date(l.followup_at) < new Date() && (
                                      <p className="text-xs text-amber-700 mt-1">
                                        {p("overdue")}
                                      </p>
                                    )}
                                </td>
                                <td className="px-5 py-5">
                                  <span
                                    className={
                                      l.priority === "high"
                                        ? "text-primary font-medium"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {p(l.priority)}
                                  </span>
                                </td>
                                <td className="px-5 py-5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`${p("open")}: ${l.company}`}
                                    onClick={() => navigate({ lead: l.id })}
                                  >
                                    <ArrowRight size={16} />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-end items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {count
                      ? `${page * 20 + 1}–${Math.min((page + 1) * 20, count)} / ${count}`
                      : "0"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((v) => v - 1)}
                  >
                    {p("previous")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(page + 1) * 20 >= count}
                    onClick={() => setPage((v) => v + 1)}
                  >
                    {p("next")}
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function LeadWorkspace({
  lead,
  role,
  notes,
  activity,
  internalStage,
  members,
  date,
  pending,
  preview,
  userId,
  onSave,
  onSubmit,
  onNote,
  onManage,
}: {
  lead?: PortalLead;
  role: string;
  notes: PortalNote[];
  activity: { id: string; action: string; created_at: string }[];
  internalStage?: string;
  members: {
    user_id: string;
    display_name: string;
    role: string;
    active: boolean;
  }[];
  date: (v: string | null) => string;
  pending: boolean;
  preview: boolean;
  userId?: string;
  onSave: (fields: LeadFields, version?: number) => Promise<boolean>;
  onSubmit: () => Promise<boolean>;
  onNote: (
    body: string,
    visibility: string,
    note?: PortalNote,
  ) => Promise<boolean>;
  onManage: (
    stage: string,
    assignee: string | null,
    publish: boolean,
  ) => Promise<boolean>;
}) {
  const { p } = usePortalText();
  const [fields, setFields] = useState<LeadFields>(lead ?? emptyLead),
    [confirm, setConfirm] = useState(false),
    [body, setBody] = useState(""),
    [visibility, setVisibility] = useState("shared"),
    [editing, setEditing] = useState<PortalNote | undefined>();
  const [editVersion, setEditVersion] = useState(lead?.version);
  useEffect(() => {
    if (
      lead &&
      Object.keys(emptyLead).every(
        (k) => fields[k as keyof LeadFields] === lead[k as keyof LeadFields],
      )
    )
      setEditVersion(lead.version);
  }, [lead, fields]);
  const [salesStage, setSalesStage] = useState(internalStage ?? "new"),
    [assignee, setAssignee] = useState(lead?.assigned_user_id ?? ""),
    [publish, setPublish] = useState(false);
  useEffect(() => {
    setSalesStage(internalStage ?? "new");
    setAssignee(lead?.assigned_user_id ?? "");
  }, [internalStage, lead?.assigned_user_id]);
  const set = (key: keyof LeadFields, value: string | null) =>
    setFields((v) => ({ ...v, [key]: value }));
  const canManage = role === "admin" || role === "staff";
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload = Object.fromEntries(
      Object.keys(emptyLead).map((k) => [k, fields[k as keyof LeadFields]]),
    ) as LeadFields;
    if (await onSave(payload, editVersion))
      setEditVersion((v) => (v === undefined ? 1 : v + 1));
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {lead?.company || p("newLead")}
          </h1>
          {lead && (
            <p className="text-muted-foreground mt-2">
              {lead.first_name} {lead.last_name} · {lead.service}
            </p>
          )}
        </div>
        {lead && <StageBadge stage={lead.shared_stage} />}
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-6 items-start">
        <form
          onSubmit={save}
          className="rounded-xl border bg-white p-5 sm:p-7 space-y-5"
        >
          <h2 className="font-semibold text-lg">{p("contact")}</h2>
          <p className="text-sm text-muted-foreground">{p("draftHelp")}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {(
              [
                "first_name",
                "last_name",
                "company",
                "email",
                "phone",
                "website",
                "source",
                "service",
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={p(
                  (
                    {
                      first_name: "firstName",
                      last_name: "lastName",
                    } as Record<string, string>
                  )[k] ?? k,
                )}
              >
                <Input
                  type={k === "email" ? "email" : "text"}
                  value={fields[k]}
                  maxLength={
                    k === "website"
                      ? 2000
                      : k === "email"
                        ? 320
                        : k === "phone"
                          ? 80
                          : ["first_name", "last_name"].includes(k)
                            ? 120
                            : 250
                  }
                  onChange={(e) => set(k, e.target.value)}
                />
              </Field>
            ))}
            <Field label={p("language")}>
              <select
                className={selectClass}
                value={fields.language}
                onChange={(e) => set("language", e.target.value)}
              >
                {["unknown", "en", "es"].map((l) => (
                  <option key={l} value={l}>
                    {p(l)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={p("priority")}>
              <select
                className={selectClass}
                value={fields.priority}
                onChange={(e) => set("priority", e.target.value)}
              >
                {["normal", "high", "low"].map((l) => (
                  <option key={l} value={l}>
                    {p(l)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={p("summary")}>
            <Textarea
              value={fields.summary}
              maxLength={10000}
              rows={4}
              onChange={(e) => set("summary", e.target.value)}
            />
          </Field>
          <div className="border-t pt-5 grid sm:grid-cols-2 gap-4">
            <Field label={p("nextAction")}>
              <Input
                value={fields.next_action}
                maxLength={2000}
                onChange={(e) => set("next_action", e.target.value)}
              />
            </Field>
            <Field label={p("followupAt")}>
              <Input
                type="datetime-local"
                value={
                  fields.followup_at ? localDateTime(fields.followup_at) : ""
                }
                onChange={(e) =>
                  set(
                    "followup_at",
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  )
                }
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" disabled={pending || preview}>
              {p(pending ? "saving" : lead ? "saveChanges" : "saveDraft")}
            </Button>
            {lead && !lead.submitted_at && role !== "staff" && (
              <Button
                type="button"
                variant="outline"
                disabled={
                  pending ||
                  preview ||
                  !canSubmit(lead) ||
                  Object.keys(emptyLead).some(
                    (k) =>
                      fields[k as keyof LeadFields] !==
                      lead[k as keyof LeadFields],
                  )
                }
                onClick={() => setConfirm(true)}
              >
                {p("submit")}
              </Button>
            )}
          </div>
        </form>
        <div className="space-y-6">
          {lead && (
            <section className="rounded-xl border bg-white p-5 sm:p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquare size={18} className="text-primary" />
                {p("notes")}
              </h2>
              {notes.length ? (
                notes.map((n) => (
                  <article key={n.id} className="border-b pb-4 last:border-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{p(n.visibility)}</span>
                      <span>{date(n.created_at)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap mt-2 break-words">
                      {n.body}
                    </p>
                    {n.author_id === userId && (
                      <button
                        className="text-xs text-primary mt-2"
                        onClick={() => {
                          setEditing(n);
                          setBody(n.body);
                          setVisibility(n.visibility);
                        }}
                      >
                        {p("editNote")}
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{p("noNotes")}</p>
              )}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await onNote(body, visibility, editing)) {
                    setBody("");
                    setEditing(undefined);
                    setVisibility("shared");
                  }
                }}
                className="space-y-3"
              >
                {editing && (
                  <p className="text-sm text-muted-foreground">
                    {p("editingNote")}
                  </p>
                )}
                <Textarea
                  aria-label={p("notes")}
                  placeholder={p("notePlaceholder")}
                  value={body}
                  maxLength={10000}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                />
                <select
                  aria-label={p("notes")}
                  disabled={!!editing}
                  className={cn(selectClass, "w-full")}
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  {[
                    "shared",
                    "personal",
                    ...(canManage ? ["internal"] : []),
                  ].map((v) => (
                    <option key={v} value={v}>
                      {p(v)}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!body.trim() || pending || preview}
                  >
                    {p(editing ? "saveChanges" : "addNote")}
                  </Button>
                  {editing && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(undefined);
                        setBody("");
                        setVisibility("shared");
                      }}
                    >
                      {p("cancel")}
                    </Button>
                  )}
                </div>
              </form>
            </section>
          )}
          {lead?.submitted_at && canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onManage(salesStage, assignee || null, publish);
              }}
              className="rounded-xl border bg-white p-6 space-y-4"
            >
              <h2 className="font-semibold">{p("pipeline")}</h2>
              <p className="text-sm text-muted-foreground">
                {p("pipelineHelp")}
              </p>
              <Field label={p("internalStage")}>
                <select
                  className={selectClass}
                  value={salesStage}
                  onChange={(e) => setSalesStage(e.target.value)}
                >
                  {stages
                    .filter((s) => s !== "draft")
                    .map((s) => (
                      <option key={s} value={s}>
                        {p(s)}
                      </option>
                    ))}
                </select>
              </Field>
              {role === "admin" && (
                <Field label={p("assign")}>
                  <select
                    className={selectClass}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">{p("unassigned")}</option>
                    {members
                      .filter((m) => m.role === "staff" && m.active)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <label className="flex gap-2 text-sm items-start">
                <input
                  type="checkbox"
                  className="mt-1 accent-[#CB2039]"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                />
                {p("publish")}
              </label>
              <Button type="submit" disabled={pending || preview}>
                {p("updatePipeline")}
              </Button>
            </form>
          )}
          {lead && (
            <section className="rounded-xl border bg-white p-6 space-y-4">
              <h2 className="font-semibold">{p("activity")}</h2>
              {activity.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary/40 shrink-0" />
                  <div>
                    <p>
                      {p(
                        a.action === "updated"
                          ? "updatedEvent"
                          : a.action === "submitted"
                            ? "submittedEvent"
                            : a.action,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {date(a.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p("submitTitle")}</DialogTitle>
            <DialogDescription>{p("submitBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {p("cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={async () => {
                if (await onSubmit()) setConfirm(false);
              }}
            >
              {p("confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function localDateTime(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
