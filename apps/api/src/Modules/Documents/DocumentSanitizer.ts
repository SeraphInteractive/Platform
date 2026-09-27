import sanitizeHtml from "sanitize-html";

const internalLink = /^(?:\/(?![/\\])|#)[^\s]*$/u;
const externalLink = /^(?:https?:\/\/|mailto:)[^\s]+$/iu;

const options: sanitizeHtml.IOptions = {
    allowedTags: [
        "p",
        "br",
        "h2",
        "h3",
        "h4",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "s",
        "code",
        "pre",
        "blockquote",
        "ul",
        "ol",
        "li",
        "a",
        "hr",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "colgroup",
        "col"
    ],
    allowedAttributes: {
        a: ["href", "target", "rel"],
        ol: ["start"],
        th: ["colspan", "rowspan"],
        td: ["colspan", "rowspan"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: false,
    transformTags: {
        b: "strong",
        i: "em",
        a: (tagName, attributes): sanitizeHtml.Tag => {
            const href = (attributes.href ?? "").trim();
            if (internalLink.test(href)) {
                return { tagName, attribs: { href } };
            }
            if (externalLink.test(href)) {
                return { tagName, attribs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } };
            }
            return { tagName: "span", attribs: {} };
        }
    }
};

export function sanitizeDocumentHtml(html: string): string {
    return sanitizeHtml(html, options).trim();
}
