import { useState } from "react";
import { Plus } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import SessionCard from "@/components/photo-sessions/SessionCard";
import CreateSessionDialog from "@/components/photo-sessions/CreateSessionDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { usePhotoSessions, useSessionPhotos } from "@/hooks/usePhotoSessions";
import type { PhotoSession } from "@/integrations/supabase/types";

function SessionCardWithPhotos({ session }: { session: PhotoSession }) {
  const { data: photos = [] } = useSessionPhotos(session.id);
  return <SessionCard session={session} photos={photos} />;
}

type StatusFilter = "all" | "active" | "archived";

export default function PhotoSessions() {
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { data: sessions = [], isLoading } = usePhotoSessions();

  const filtered =
    statusFilter === "all"
      ? sessions
      : sessions.filter((s) => s.status === statusFilter);

  return (
    <AppShell>
      <Header
        title="Photo Sessions"
        subtitle={`${sessions.length} session${sessions.length !== 1 ? "s" : ""}`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            New Session
          </Button>
        }
      />

      <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-4xl mb-3">📸</p>
            <p className="text-muted-foreground text-sm mb-4">
              {statusFilter === "all"
                ? "No photo sessions yet."
                : `No ${statusFilter} sessions.`}
            </p>
            {statusFilter === "all" && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={14} className="mr-1.5" />
                Create First Session
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {filtered.map((session) => (
              <SessionCardWithPhotos key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </AppShell>
  );
}
