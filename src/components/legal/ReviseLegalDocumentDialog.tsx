import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LegalDocumentView from "@/components/legal/LegalDocumentView";
import { useLegalActions, type LegalDocument } from "@/hooks/useLegalSigns";
import { listNames } from "@/lib/legal/status";
import { useToast } from "@/hooks/use-toast";

interface Props {
  doc: LegalDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReviseLegalDocumentDialog({ doc, open, onOpenChange }: Props) {
  const { revise } = useLegalActions();
  const { toast } = useToast();
  const [title, setTitle] = useState(doc.title);
  const [blocks, setBlocks] = useState(doc.content.blocks);

  useEffect(() => {
    if (!open) return;
    setTitle(doc.title);
    setBlocks(doc.content.blocks.map((block) => ({ ...block })));
  }, [open, doc.id]);

  const changed = title.trim() !== doc.title || JSON.stringify(blocks) !== JSON.stringify(doc.content.blocks);
  const ready = changed && !!title.trim() && blocks.every((block) => !!block.text.trim());

  const emails = listNames(doc.signers.map((signer) => signer.email));
  const submit = async () => {
    if (!ready) return;
    try {
      const result = await revise.mutateAsync({ id: doc.id, title: title.trim(), content: { ...doc.content, blocks } });
      toast(result.emailed
        ? { title: "Revision sent", description: `A new signing link was emailed to ${emails}. The old ${doc.signers.length > 1 ? "links no longer work" : "link no longer works"}.` }
        : { title: "Revision saved, but an email didn't go out", description: `${result.failed?.length ? `The email to ${listNames(result.failed)} failed. ` : ""}Old links no longer work. Use Send again in LegalSigns to deliver new ones.`, variant: "destructive" });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Revision not saved", description: error instanceof Error ? error.message : "Try again in a moment.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !revise.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Revise document</DialogTitle>
          <DialogDescription>
            Edit the wording before anyone signs. Saving replaces the old {doc.signers.length > 1 ? "signing links" : "signing link"} and emails a fresh copy to {emails}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-5 overflow-y-auto py-1 lg:grid-cols-2 lg:overflow-hidden">
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="revision-title">Document name</Label>
              <Input id="revision-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
            </div>
            {blocks.map((block, index) => (
              <div key={index} className="space-y-1.5">
                <Label htmlFor={`revision-block-${index}`}>
                  {block.kind === "meta" ? block.label : `${block.kind[0].toUpperCase()}${block.kind.slice(1)} ${index + 1}`}
                </Label>
                {block.kind === "paragraph" ? (
                  <Textarea id={`revision-block-${index}`} value={block.text} rows={5} maxLength={10000}
                    onChange={(event) => setBlocks((current) => current.map((item, position) => position === index ? { ...item, text: event.target.value } : item))} />
                ) : (
                  <Input id={`revision-block-${index}`} value={block.text} maxLength={10000}
                    onChange={(event) => setBlocks((current) => current.map((item, position) => position === index ? { ...item, text: event.target.value } : item))} />
                )}
              </div>
            ))}
          </div>
          <div className="min-h-0 space-y-2 lg:overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview sent to recipient</p>
            <LegalDocumentView blocks={blocks} />
          </div>
        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={revise.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={!ready || revise.isPending}>
            {revise.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Save and resend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
