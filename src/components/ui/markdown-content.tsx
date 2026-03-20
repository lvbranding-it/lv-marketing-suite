import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  children: string;
  className?: string;
  size?: "sm" | "base";
}

export function MarkdownContent({ children, className, size = "sm" }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        // Base prose setup
        "prose dark:prose-invert max-w-none",
        size === "sm" ? "prose-sm" : "prose-base",

        // Headings — clear hierarchy, not too large
        "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:first:mt-0",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:first:mt-0",
        "[&_h2]:border-b [&_h2]:border-border/50 [&_h2]:pb-1",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:first:mt-0",

        // Paragraphs
        "[&_p]:leading-relaxed [&_p]:text-foreground/90 [&_p]:my-2",

        // Lists — tighter spacing
        "[&_ul]:my-2 [&_ul]:pl-5 [&_ul>li]:my-0.5 [&_ul>li]:marker:text-primary",
        "[&_ol]:my-2 [&_ol]:pl-5 [&_ol>li]:my-0.5",

        // Bold/italic
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:text-foreground/80",

        // Inline code — dark text on soft background, clearly visible
        "[&_code:not(pre_code)]:bg-slate-100 [&_code:not(pre_code)]:text-slate-800",
        "[&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:rounded",
        "[&_code:not(pre_code)]:text-[0.82em] [&_code:not(pre_code)]:font-mono",
        "[&_code:not(pre_code)]:border [&_code:not(pre_code)]:border-slate-200",

        // Code blocks — dark background, always-light text for guaranteed contrast
        "[&_pre]:bg-slate-900 [&_pre]:border [&_pre]:border-slate-700 [&_pre]:rounded-lg",
        "[&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-3",
        "[&_pre]:text-slate-100",
        "[&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0",
        "[&_pre_code]:text-slate-100 [&_pre_code]:text-xs [&_pre_code]:font-mono",

        // Blockquotes
        "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/50",
        "[&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_blockquote]:my-3 [&_blockquote]:not-italic",

        // Tables
        "[&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:text-sm",
        "[&_th]:text-left [&_th]:font-semibold [&_th]:p-2 [&_th]:border-b-2 [&_th]:border-border",
        "[&_td]:p-2 [&_td]:border-b [&_td]:border-border/50",
        "[&_tr:last-child_td]:border-0",
        "[&_tbody_tr:hover]:bg-muted/40",

        // Horizontal rule
        "[&_hr]:border-border [&_hr]:my-4",

        // Links
        "[&_a]:text-primary [&_a]:underline [&_a:hover]:text-primary/80",

        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
