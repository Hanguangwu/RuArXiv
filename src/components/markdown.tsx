import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/**
 * Paper body renderer.
 *
 * Raw HTML is never enabled (no rehype-raw) and everything is filtered through
 * a whitelist schema before KaTeX turns `$...$` placeholders into trusted
 * markup. This satisfies the "no scripts, no inline handlers, no javascript:
 * URLs" rule from the design doc.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-paper">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeSanitize, [rehypeKatex, { throwOnError: false }]]}
        components={{
          a: ({ href, children: linkChildren }) => {
            const external = !!href && /^https?:\/\//.test(href);
            if (!external) return <a href={href}>{linkChildren}</a>;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {linkChildren}
              </a>
            );
          },
          img: ({ src, alt }) =>
            typeof src === "string" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" />
            ) : null,
          table: ({ children: tableChildren }) => (
            <div className="table-scroll">
              <table>{tableChildren}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Script for paper body with explicit sanitisation upstream; kept as a small
 * wrapper so callers do not need to know the plugin order. */
export function MarkdownLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href}>{children}</Link>;
}
