import { Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ShareLinkButtonProps {
  shareToken: string;
}

export default function ShareLinkButton({ shareToken }: ShareLinkButtonProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    const url = `${window.location.origin}/share/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ description: "Share link copied to clipboard!" });
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      <Link size={14} className="mr-1.5" />
      Copy Client Link
    </Button>
  );
}
