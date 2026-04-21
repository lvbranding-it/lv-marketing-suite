import { useEffect, useState } from "react";
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
import { useLanguage } from "@/hooks/useLanguage";

interface SaveOutputDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
  defaultTitle?: string;
  saving?: boolean;
}

export default function SaveOutputDialog({
  open,
  onClose,
  onSave,
  defaultTitle = "",
  saving = false,
}: SaveOutputDialogProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(defaultTitle);

  useEffect(() => {
    if (open) setTitle(defaultTitle);
  }, [defaultTitle, open]);

  const handleSave = async () => {
    await onSave(title);
    setTitle(defaultTitle);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("skills.saveOutput")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="output-title">{t("skills.outputTitle")}</Label>
          <Input
            id="output-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("skills.outputTitlePlaceholder")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
