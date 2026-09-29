import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/Lib/Utils";

const allowedElements = ["p", "br", "strong", "em", "del", "code", "a", "ul", "ol", "li", "blockquote"];

const components: Components = {
    a: ({ href, children }) => {
        const isInternal = href?.startsWith("/") === true && !href.startsWith("//");
        return isInternal ? (
            <a href={href}>{children}</a>
        ) : (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
            </a>
        );
    }
};

export function MarkdownText({ children, className }: { readonly children: string; readonly className?: string }): ReactNode {
    return (
        <div className={cn("md-text min-w-0 break-words [overflow-wrap:anywhere]", className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={allowedElements} unwrapDisallowed components={components}>
                {children}
            </ReactMarkdown>
        </div>
    );
}
