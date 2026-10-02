import { useState, type ReactNode } from "react";
import {
  Bookmark, ChevronLeft, ChevronRight, Clapperboard, Globe2, Heart, ImageIcon, Link2,
  MessageCircle, MoreHorizontal, Play, Send, Share2, ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { INSTAGRAM_IMAGE, type MediaSize } from "@/lib/socialMedia";
import type { SocialAccount } from "@/hooks/useSocialPublisher";

export interface PreviewMedia {
  key: string;
  url: string;
  kind: "image" | "video";
  name: string;
  size?: MediaSize;
}

interface SocialPostPreviewProps {
  account: SocialAccount;
  format: string;
  caption: string;
  linkUrl?: string;
  media: PreviewMedia[];
  /** "Just now", or the scheduled time. */
  when: string;
}

/**
 * How a post will look in the Facebook or Instagram feed, drawn from the
 * composer's own media and captions. The layouts follow each app's feed
 * closely but not exactly: Meta also compresses media and may crop it.
 */
export default function SocialPostPreview(props: SocialPostPreviewProps) {
  return props.account.platform === "instagram" ? <InstagramPreview {...props} /> : <FacebookPreview {...props} />;
}

// The feeds show photos between 4:5 and 1.91:1 and crop anything beyond.
const feedRatio = (size?: MediaSize) => {
  if (!size?.width || !size.height) return 1;
  return Math.min(INSTAGRAM_IMAGE.maxRatio, Math.max(INSTAGRAM_IMAGE.minRatio, size.width / size.height));
};

/** Hashtags, mentions and links in the platform's link color. */
function RichCaption({ text, linkClass }: { text: string; linkClass: string }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+|@[\w.]+|https?:\/\/\S+)/u);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <span key={index} className={linkClass}>{part}</span> : <span key={index}>{part}</span>,
      )}
    </>
  );
}

/** The caption cut where the feed cuts it, with the app's own "more" link to open it. */
function Truncated({ text, limit, moreLabel, linkClass, prefix }: { text: string; limit: number; moreLabel: string; linkClass: string; prefix?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n");
  const long = text.length > limit || lines.length > 4;
  let shown = text;
  if (long && !open) {
    const byLines = lines.slice(0, 4).join("\n");
    const cut = byLines.length > limit ? byLines.slice(0, limit) : byLines;
    shown = cut.replace(/\s+\S*$/, "").trimEnd() || cut;
  }
  return (
    <p className="whitespace-pre-wrap break-words">
      {prefix}
      <RichCaption text={shown} linkClass={linkClass} />
      {long && !open && (
        <>
          …{" "}
          <button type="button" onClick={() => setOpen(true)} className="font-medium text-[#65676b] hover:underline">
            {moreLabel}
          </button>
        </>
      )}
    </p>
  );
}

function Avatar({ account, size }: { account: SocialAccount; size: number }) {
  return account.profile_image_url ? (
    <img src={account.profile_image_url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-[#e4e6eb] text-sm font-semibold text-[#050505]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {account.display_name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MediaFrame({ item, ratio, cover = true }: { item: PreviewMedia; ratio: number; cover?: boolean }) {
  return (
    <div className="relative w-full overflow-hidden bg-[#f0f2f5]" style={{ aspectRatio: String(ratio) }}>
      {item.kind === "video" ? (
        <>
          <video src={item.url} className={cn("h-full w-full", cover ? "object-cover" : "object-contain")} muted playsInline preload="metadata" />
          <span className="absolute inset-0 grid place-items-center" aria-hidden>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>
        </>
      ) : (
        <img src={item.url} alt={item.name} className={cn("h-full w-full", cover ? "object-cover" : "object-contain")} />
      )}
    </div>
  );
}

function MissingMedia({ label }: { label: string }) {
  return (
    <div className="grid aspect-square w-full place-items-center bg-[#f0f2f5] text-center text-xs text-[#65676b]">
      <span className="flex flex-col items-center gap-2 px-6">
        <ImageIcon className="h-6 w-6" aria-hidden />
        {label}
      </span>
    </div>
  );
}

function FacebookPreview({ account, format, caption, linkUrl, media, when }: SocialPostPreviewProps) {
  const first = media[0];
  const wantsMedia = format === "image" || format === "video";
  let domain = "";
  try {
    domain = linkUrl ? new URL(linkUrl).hostname.replace(/^www\./, "") : "";
  } catch {
    domain = "";
  }
  return (
    <article className="overflow-hidden rounded-lg border border-[#dadde1] bg-white text-[15px] leading-snug text-[#050505] shadow-sm">
      <header className="flex items-center gap-2 px-4 pt-3">
        <Avatar account={account} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{account.display_name}</p>
          <p className="flex items-center gap-1 text-[13px] text-[#65676b]">
            {when} · <Globe2 className="h-3 w-3" aria-label="Public" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-[#65676b]" aria-hidden />
      </header>
      <div className="px-4 pb-3 pt-2">
        {caption.trim() ? (
          <Truncated text={caption} limit={250} moreLabel="See more" linkClass="text-[#0064d1]" />
        ) : (
          <p className="text-[#65676b]">No caption yet</p>
        )}
      </div>
      {wantsMedia && (first ? <MediaFrame item={first} ratio={feedRatio(first.size)} /> : <MissingMedia label={`Add ${format === "video" ? "a video" : "an image"} to see it here`} />)}
      {format === "link" && (
        <div className="border-y border-[#dadde1] bg-[#f0f2f5]">
          <div className="grid aspect-[1.91/1] place-items-center text-[#65676b]">
            <Link2 className="h-7 w-7" aria-hidden />
          </div>
          <div className="space-y-0.5 border-t border-[#dadde1] px-4 py-2.5">
            <p className="text-xs uppercase text-[#65676b]">{domain || "your link"}</p>
            <p className="text-[13px] text-[#65676b]">Facebook fills in the page's own title and image when it publishes.</p>
          </div>
        </div>
      )}
      <footer className="mx-4 flex items-center justify-around border-t border-[#ced0d4] py-1 text-[15px] font-semibold text-[#65676b]">
        {[{ icon: ThumbsUp, label: "Like" }, { icon: MessageCircle, label: "Comment" }, { icon: Share2, label: "Share" }].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-2 px-3 py-1.5">
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {label}
          </span>
        ))}
      </footer>
    </article>
  );
}

function InstagramPreview({ account, format, caption, media, when }: SocialPostPreviewProps) {
  const [index, setIndex] = useState(0);
  const name = account.username || account.display_name;
  const items = format === "carousel" ? media : media.slice(0, 1);
  const current = items[Math.min(index, Math.max(items.length - 1, 0))];
  const reel = format === "reel";
  const ratio = reel ? 9 / 16 : feedRatio(items[0]?.size);

  return (
    <article className="mx-auto w-full max-w-[380px] overflow-hidden rounded-lg border border-[#dbdbdb] bg-white text-sm text-black shadow-sm">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]">
          <span className="block rounded-full bg-white p-[2px]">
            <Avatar account={account} size={28} />
          </span>
        </span>
        <p className="min-w-0 flex-1 truncate font-semibold">{name}</p>
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </header>

      {current ? (
        <div className="relative">
          <MediaFrame item={current} ratio={ratio} />
          {reel && <Clapperboard className="absolute right-3 top-3 h-5 w-5 text-white drop-shadow" aria-label="Reel" />}
          {items.length > 1 && (
            <>
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
                {index + 1}/{items.length}
              </span>
              {index > 0 && (
                <button type="button" onClick={() => setIndex(index - 1)} aria-label="Previous slide" className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {index < items.length - 1 && (
                <button type="button" onClick={() => setIndex(index + 1)} aria-label="Next slide" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow">
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <MissingMedia label={reel ? "Add a video to see the Reel here" : format === "carousel" ? "Add 2 to 10 images or videos to see the carousel" : "Add an image to see it here"} />
      )}

      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Heart className="h-6 w-6" aria-hidden />
        <MessageCircle className="h-6 w-6 -scale-x-100" aria-hidden />
        <Send className="h-6 w-6" aria-hidden />
        {items.length > 1 && (
          <span className="mx-auto flex gap-1" aria-hidden>
            {items.map((item, dot) => (
              <span key={item.key} className={cn("h-1.5 w-1.5 rounded-full", dot === index ? "bg-[#0095f6]" : "bg-[#dbdbdb]")} />
            ))}
          </span>
        )}
        <Bookmark className="ml-auto h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1 px-3 pb-3 pt-2">
        {caption.trim() ? (
          <Truncated
            text={caption}
            limit={125}
            moreLabel="more"
            linkClass="text-[#00376b]"
            prefix={<span className="mr-1 font-semibold">{name}</span>}
          />
        ) : (
          <p className="text-[#737373]">No caption yet</p>
        )}
        <p className="text-[11px] uppercase tracking-wide text-[#737373]">{when}</p>
      </div>
    </article>
  );
}
