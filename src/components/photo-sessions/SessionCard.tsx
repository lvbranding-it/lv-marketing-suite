import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Camera, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PhotoSession, SessionPhoto } from "@/integrations/supabase/types";

interface SessionCardProps {
  session: PhotoSession;
  photos: SessionPhoto[];
}

export default function SessionCard({ session, photos }: SessionCardProps) {
  const navigate = useNavigate();
  const selectedCount = photos.filter((p) => p.status === "selected").length;

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
      onClick={() => navigate(`/photo-sessions/${session.id}`)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Camera size={15} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{session.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <User size={10} />
                {session.client_name}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              session.status === "active"
                ? "bg-green-50 text-green-700 border-green-200 shrink-0"
                : "bg-slate-100 text-slate-600 border-slate-200 shrink-0"
            }
          >
            {session.status === "active" ? "Active" : "Archived"}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{photos.length} photo{photos.length !== 1 ? "s" : ""} · {selectedCount} selected</span>
          <span>{formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
