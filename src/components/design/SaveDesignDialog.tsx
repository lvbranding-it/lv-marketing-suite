import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SaveDesignDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
  defaultTitle: string;
  saving: boolean;
}

export default function SaveDesignDialog({
  open,
  onClose,
  onSave,
  defaultTitle,
  saving,
}: SaveDesignDialogProps) {
  const [title, setTitle] = useState(defaultTitle);

  const handleSave = async () => {
    await onSave(title);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Design</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="design-title" className="text-sm">Title</Label>
            <Input
              id="design-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this design a name..."
              className="h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
