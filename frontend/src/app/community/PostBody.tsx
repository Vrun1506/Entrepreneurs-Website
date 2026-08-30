import { segmentPostBody } from "@/lib/validation/posts";

// ════════════════════════════════════════════════════════════════════
// Foundry · Rendering a post body
//
// THE ONE RULE: a post body is plain text. There is no markdown renderer
// here and no dangerouslySetInnerHTML, and there must never be one — the
// realistic way this becomes an XSS hole is somebody adding a formatting
// library later because bold text would be nice.
//
// Links are the single exception, and they are built from parsed segments
// rather than from a string replace. Three things make them safe:
//
//   * Only http and https survive segmentPostBody, which is what stops
//     javascript: and data: URLs.
//   * rel="nofollow ugc" keeps our domain from vouching for whatever a
//     member links to, which matters because this site has real SEO goals.
//     noopener/noreferrer stop the opened page reaching back through
//     window.opener.
//   * THE HOSTNAME IS SHOWN. A link whose text claims one destination and
//     whose href goes elsewhere is the entire mechanic of a phishing post,
//     and a fake Imperial login page is the realistic version of that
//     attack here. Displaying the real host next to the link means the
//     claim and the destination cannot disagree silently.
// ════════════════════════════════════════════════════════════════════

export default function PostBody({ body }: { body: string }) {
  return (
    <p className="text-[0.9rem] text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
      {segmentPostBody(body).map((segment, i) =>
        segment.kind === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-text-primary underline decoration-border-strong underline-offset-2 hover:decoration-accent break-all"
          >
            {segment.href}
            <span className="ml-1 whitespace-nowrap text-[0.7rem] text-text-muted">
              ({segment.host})
            </span>
          </a>
        ),
      )}
    </p>
  );
}
