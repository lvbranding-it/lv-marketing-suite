import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
/** Shared message rendering for the existing agent chat and portal advisor. */
export default function ChatMessageText({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  if (role === "user")
    return (
      <div className="bg-rose-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    );
  return (
    <div className="prose prose-sm max-w-none text-foreground break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Remote images in model output must not trigger background requests with private data.
          img: ({ alt }) => <span>{alt}</span>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
