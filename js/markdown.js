import { sanitizeLinkUrl, sanitizeLinkTarget } from "./untrusted-input.js";

// ─── Shared Markdown Renderer ──────────────────────────────────────────────
//
// The single source of truth for rendering markdown across the extension.
// Builds the output from DOM nodes (createElement / createTextNode) so it is
// XSS-safe by construction — no `innerHTML`, no string-concatenated HTML.
// Supersedes the earlier partial renderer (`renderInlineMarkdown` in
// dom-manager/section-renderer.js).
//
// Supports: headings (#..######), unordered/ordered lists, fenced code
// blocks, blockquotes (nestable), thematic breaks, paragraphs, and inline
// bold / italic / bold-italic / inline-code / markdown links, plus
// autolinking of bare http(s) URLs, `www.` hosts and email addresses.
//
// Links are sanitized through `sanitizeLinkUrl` (http/https/mailto/tel only —
// `javascript:` and friends are rejected and fall back to plain text). External
// http(s) links get `rel="noopener noreferrer"` and a target honouring the
// user's `general_linkTarget` preference.

// Regex SOURCES — a fresh `RegExp` is built per call (see `newAutolinkRe` /
// `newInlineRe`). These use the /g flag with a stateful `lastIndex`, and
// `appendInline` recurses (bold/italic), so a single shared instance would be
// clobbered by the recursion. Fresh instances keep each level independent.
const AUTOLINK_SRC =
    "(https?://[^\\s<]+[^\\s<.,;:!?)\\]}'\"]|www\\.[a-z0-9][^\\s<]*[^\\s<.,;:!?)\\]}'\"]|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})";
// Inline tokens: code span, ***bold-italic***, **bold**, *italic*, [text](url).
const INLINE_SRC =
    "(`[^`\\n]+`|\\*\\*\\*[\\s\\S]+?\\*\\*\\*|\\*\\*[\\s\\S]+?\\*\\*|\\*[^*\\n]+\\*|\\[[^\\]\\n]+\\]\\([^)\\s]+\\))";

const newAutolinkRe = () => new RegExp(AUTOLINK_SRC, "g");
const newInlineRe = () => new RegExp(INLINE_SRC, "g");

const LINK_TOKEN_RE = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/;

/**
 * Resolve the link target to use for external anchors, honouring the user's
 * `general_linkTarget` preference (kept live on `window.linkTarget`).
 */
function resolveLinkTarget(options) {
    const raw = options && options.linkTarget != null
        ? options.linkTarget
        : (typeof window !== "undefined" ? window.linkTarget : "");
    return sanitizeLinkTarget(raw) || "_self";
}

/**
 * Create an anchor for `url` labelled by `label` (a string or a callback that
 * populates the anchor's children). Returns a text node if the URL is unsafe.
 */
function createLink(label, url, options, appendLabel) {
    const safe = sanitizeLinkUrl(url);
    if (!safe) {
        // Unsafe / unsupported scheme — render the label as plain text so the
        // content is never lost, but no clickable link is produced.
        return document.createTextNode(typeof label === "string" ? label : url);
    }
    const a = document.createElement("a");
    a.href = safe;
    const isExternal = /^https?:/i.test(safe);
    if (isExternal) {
        a.target = resolveLinkTarget(options);
        a.rel = "noopener noreferrer";
    }
    if (appendLabel) appendLabel(a);
    else a.textContent = typeof label === "string" ? label : safe;
    return a;
}

/**
 * Autolink bare URLs / emails inside a plain-text run, appending text nodes and
 * anchors to `container`.
 */
function appendAutolinked(container, text, options) {
    let last = 0;
    let match;
    const re = newAutolinkRe();
    while ((match = re.exec(text)) !== null) {
        if (match.index > last) {
            container.appendChild(
                document.createTextNode(text.slice(last, match.index)),
            );
        }
        const raw = match[0];
        let url = raw;
        if (/^www\./i.test(raw)) url = "https://" + raw;
        else if (!/^https?:/i.test(raw)) url = "mailto:" + raw; // bare email
        container.appendChild(createLink(raw, url, options));
        last = re.lastIndex;
    }
    if (last < text.length) {
        container.appendChild(document.createTextNode(text.slice(last)));
    }
}

/**
 * Render inline markdown into `container`. When `opts.noLinks` is set, link
 * tokens and autolinking are skipped (used inside anchor labels to avoid
 * nested anchors).
 */
function appendInline(container, text, options, noLinks) {
    let last = 0;
    let match;
    const re = newInlineRe();
    while ((match = re.exec(text)) !== null) {
        if (match.index > last) {
            const plain = text.slice(last, match.index);
            if (noLinks) container.appendChild(document.createTextNode(plain));
            else appendAutolinked(container, plain, options);
        }
        const token = match[0];
        if (token.startsWith("`") && token.endsWith("`")) {
            const code = document.createElement("code");
            code.textContent = token.slice(1, -1);
            container.appendChild(code);
        } else if (token.startsWith("***") && token.endsWith("***")) {
            const strong = document.createElement("strong");
            const em = document.createElement("em");
            appendInline(em, token.slice(3, -3), options, noLinks);
            strong.appendChild(em);
            container.appendChild(strong);
        } else if (token.startsWith("**") && token.endsWith("**")) {
            const strong = document.createElement("strong");
            appendInline(strong, token.slice(2, -2), options, noLinks);
            container.appendChild(strong);
        } else if (token.startsWith("*") && token.endsWith("*")) {
            const em = document.createElement("em");
            appendInline(em, token.slice(1, -1), options, noLinks);
            container.appendChild(em);
        } else if (!noLinks && LINK_TOKEN_RE.test(token)) {
            const [, labelText, url] = token.match(LINK_TOKEN_RE);
            container.appendChild(
                createLink(labelText, url, options, (a) =>
                    appendInline(a, labelText, options, true),
                ),
            );
        } else {
            // Fallback (e.g. a link token but links disabled) — render literally.
            container.appendChild(document.createTextNode(token));
        }
        last = re.lastIndex;
    }
    if (last < text.length) {
        const tail = text.slice(last);
        if (noLinks) container.appendChild(document.createTextNode(tail));
        else appendAutolinked(container, tail, options);
    }
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```/;

/**
 * Parse the given markdown source into block-level nodes appended to `parent`.
 */
function appendBlocks(parent, src, options) {
    const lines = String(src == null ? "" : src).replace(/\r\n?/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Blank line
        if (/^\s*$/.test(line)) {
            i++;
            continue;
        }

        // Fenced code block
        if (FENCE_RE.test(line)) {
            const code = [];
            i++;
            while (i < lines.length && !FENCE_RE.test(lines[i])) {
                code.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++; // consume closing fence
            const pre = document.createElement("pre");
            const codeEl = document.createElement("code");
            codeEl.textContent = code.join("\n");
            pre.appendChild(codeEl);
            parent.appendChild(pre);
            continue;
        }

        // Heading
        let m = line.match(HEADING_RE);
        if (m) {
            const level = m[1].length;
            const h = document.createElement("h" + level);
            appendInline(h, m[2].trim(), options);
            parent.appendChild(h);
            i++;
            continue;
        }

        // Thematic break
        if (HR_RE.test(line)) {
            parent.appendChild(document.createElement("hr"));
            i++;
            continue;
        }

        // Blockquote (gather consecutive `>` lines, render recursively)
        if (QUOTE_RE.test(line)) {
            const inner = [];
            while (i < lines.length && QUOTE_RE.test(lines[i])) {
                inner.push(lines[i].match(QUOTE_RE)[1]);
                i++;
            }
            const bq = document.createElement("blockquote");
            appendBlocks(bq, inner.join("\n"), options);
            parent.appendChild(bq);
            continue;
        }

        // Unordered list
        if (UL_RE.test(line)) {
            const ul = document.createElement("ul");
            while (i < lines.length && UL_RE.test(lines[i])) {
                const li = document.createElement("li");
                appendInline(li, lines[i].match(UL_RE)[1].trim(), options);
                ul.appendChild(li);
                i++;
            }
            parent.appendChild(ul);
            continue;
        }

        // Ordered list
        if (OL_RE.test(line)) {
            const ol = document.createElement("ol");
            while (i < lines.length && OL_RE.test(lines[i])) {
                const li = document.createElement("li");
                appendInline(li, lines[i].match(OL_RE)[1].trim(), options);
                ol.appendChild(li);
                i++;
            }
            parent.appendChild(ol);
            continue;
        }

        // Paragraph: consecutive lines until a blank line or a block starter.
        const para = [];
        while (
            i < lines.length &&
            !/^\s*$/.test(lines[i]) &&
            !FENCE_RE.test(lines[i]) &&
            !HEADING_RE.test(lines[i]) &&
            !HR_RE.test(lines[i]) &&
            !QUOTE_RE.test(lines[i]) &&
            !UL_RE.test(lines[i]) &&
            !OL_RE.test(lines[i])
        ) {
            para.push(lines[i]);
            i++;
        }
        const p = document.createElement("p");
        para.forEach((pl, idx) => {
            if (idx > 0) p.appendChild(document.createElement("br"));
            appendInline(p, pl, options);
        });
        parent.appendChild(p);
    }
}

/**
 * Render markdown `src` to a DocumentFragment of safe DOM nodes.
 * @param {string} src
 * @param {{ linkTarget?: string }} [options]
 * @returns {DocumentFragment}
 */
export function renderMarkdown(src, options = {}) {
    const fragment = document.createDocumentFragment();
    appendBlocks(fragment, src, options);
    return fragment;
}

/**
 * Render markdown into `el`, replacing its current contents. Returns `el`.
 */
export function renderMarkdownInto(el, src, options = {}) {
    el.replaceChildren(renderMarkdown(src, options));
    return el;
}

/**
 * Render only inline markdown (no block elements) into `el`, replacing its
 * contents. Convenience for callers that need a single formatted line.
 */
export function renderInlineMarkdownInto(el, src, options = {}) {
    const fragment = document.createDocumentFragment();
    appendInline(fragment, String(src == null ? "" : src), options);
    el.replaceChildren(fragment);
    return el;
}
