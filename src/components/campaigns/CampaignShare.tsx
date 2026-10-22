import { Copy, ExternalLink, Link2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCampaignSharing, type EmailCampaign } from '@/hooks/useCampaigns';
import { useToast } from '@/hooks/use-toast';

export default function CampaignShare({campaign}: {campaign: EmailCampaign}) {
  const sharing = useCampaignSharing();
  const {toast} = useToast();
  const url = campaign.share_token ? `${window.location.origin}/campaign/${campaign.share_token}` : '';
  const toggle = async (enabled: boolean) => {
    try {
      await sharing.mutateAsync({id:campaign.id, enabled});
      toast({description:enabled ? 'Public email link created.' : 'Public email link disabled.'});
    } catch { toast({variant:'destructive',description:'Unable to update sharing. Please try again.'}); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast({description:'Link copied. Ready to share on social media.'}); }
    catch { toast({variant:'destructive',description:'Select and copy the link below.'}); }
  };
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-labelledby="campaign-share-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="campaign-share-title" className="text-sm font-semibold flex items-center gap-2"><Link2 size={15}/> Share this email</h2>
        <p className="text-xs text-muted-foreground mt-1">{url ? 'Anyone with this link can view the email. Recipient details stay private.' : 'Create a public web version to share on social media.'}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => toggle(!url)} disabled={sharing.isPending}>
        {sharing.isPending && <Loader2 size={13} className="mr-2 animate-spin"/>}
        {url ? 'Disable link' : 'Create share link'}
      </Button>
    </div>
    {url && <div className="flex flex-wrap gap-2">
      <Input aria-label="Public email link" value={url} readOnly onFocus={e=>e.target.select()} className="min-w-0 flex-1 basis-48"/>
      <Button variant="outline" size="sm" onClick={copy} className="gap-1.5"><Copy size={13}/>Copy link</Button>
      <Button variant="outline" size="sm" asChild><a href={url} target="_blank" rel="noopener noreferrer" className="gap-1.5"><ExternalLink size={13}/>View email</a></Button>
    </div>}
  </section>;
}
