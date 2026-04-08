import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("fetch-url extension loaded", "info");
  });

  pi.registerTool({
    name: "fetch_url",
    label: "Fetch URL",
    description: "Fetch content from a URL. Supports HTTP/HTTPS, returns text content. Use for reading web pages, API responses, documentation, etc.",
    promptSnippet: "Fetch and read content from a web URL",
    promptGuidelines: [
      "Use this tool when the user provides a URL or asks to read content from a web page.",
      "Works with HTML pages, JSON APIs, plain text files, and markdown."
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch (must start with http:// or https://)" }),
      format: Type.Optional(StringEnum(["auto", "text", "json", "raw"] as const, {
        description: "Response format: auto=detect, text=strip HTML tags, json=parse JSON, raw=unchanged"
      })),
      extract: Type.Optional(StringEnum(["metadata", "links", "headings", "all", "none"] as const, {
        description: "What to extract from HTML: metadata=title+description+og-tags, links=all links, headings=h1-h6 structure, all=everything, none=only content"
      })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { url, format = "auto", extract = "all" } = params;

      // Validate URL
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          content: [{ type: "text", text: `❌ Invalid URL: must start with http:// or https://` }],
          isError: true,
        };
      }

      try {
        // Fetch with timeout and abort signal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        if (signal) {
          signal.addEventListener("abort", () => controller.abort());
        }

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "pi-coding-agent/1.0",
            "Accept": "text/html,application/json,text/plain,*/*",
          },
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `${getStatusEmoji(response.status)} ${url}` }],
            details: {
              url,
              statusCode: response.status,
              length: 0,
              truncated: false,
              fullContent: "",
            },
            isError: true,
          };
        }

        const contentType = response.headers.get("content-type") || "";
        let content: string;
        let displayFormat: string = format;

        // Auto-detect format if not specified
        if (format === "auto") {
          if (contentType.includes("application/json")) {
            displayFormat = "json";
          } else if (contentType.includes("text/html")) {
            displayFormat = "text";
          } else if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
            displayFormat = "raw";
          } else {
            displayFormat = "text";
          }
        }

        const rawText = await response.text();

        // Process based on format
        if (displayFormat === "json") {
          try {
            const json = JSON.parse(rawText);
            content = JSON.stringify(json, null, 2);
          } catch {
            content = rawText;
            displayFormat = "raw";
          }
        } else if (displayFormat === "text") {
          // Strip HTML tags
          content = stripHtmlTags(rawText);
        } else {
          content = rawText;
        }

        // Truncate if too long (max 5MB for LLM context)
        const maxLength = 5242880; // 5 * 1024 * 1024
        let truncated = false;
        if (content.length > maxLength) {
          content = content.slice(0, maxLength) + "\n\n... [content truncated, too long]";
          truncated = true;
        }

        // Extract additional data from HTML pages
        let metadata, headings, links;
        if (displayFormat === "text" || displayFormat === "raw") {
          if (extract === "metadata" || extract === "all") {
            metadata = extractMetadata(rawText);
          }
          if (extract === "headings" || extract === "all") {
            headings = extractHeadings(rawText);
          }
          if (extract === "links" || extract === "all") {
            links = extractLinks(rawText);
          }
        }

        // Build response text - minimal (status + URL only)
        let responseText = `${getStatusEmoji(response.status)} ${url}`;
        if (truncated) responseText += ` ✂️`;
        
        // All data (metadata, headings, links, content) available in details for processing
        // Nothing else shown in chat

        return {
          content: [{ type: "text", text: responseText }],
          details: {
            url,
            statusCode: response.status,
            format: displayFormat,
            contentType,
            length: content.length,
            truncated,
            metadata,
            headings,
            links,
            fullContent: content,
          },
        };

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `❌ Fetch failed: ${message}` }],
          isError: true,
        };
      }
    },
  });
}

function getStatusEmoji(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return "✅";
  if (statusCode >= 400 && statusCode < 500) return "⚠️";
  if (statusCode >= 500) return "❌";
  return "ℹ️";
}

// Extract metadata from HTML
function extractMetadata(html: string): {
  title?: string;
  description?: string;
  language?: string;
  canonical?: string;
  ogTags?: Record<string, string>;
} {
  const result: {
    title?: string;
    description?: string;
    language?: string;
    canonical?: string;
    ogTags?: Record<string, string>;
  } = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim().replace(/\s+/g, " ");
  }

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  // Language
  const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  if (langMatch) {
    result.language = langMatch[1];
  }

  // Canonical URL
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i) ||
                         html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (canonicalMatch) {
    result.canonical = canonicalMatch[1];
  }

  // Open Graph tags
  const ogTags: Record<string, string> = {};
  const ogMatches = html.matchAll(/<meta[^>]*property=["']og:([^"']*)["'][^>]*content=["']([^"']*)["'][^>]*>/gi);
  for (const match of ogMatches) {
    ogTags[match[1]] = match[2];
  }
  if (Object.keys(ogTags).length > 0) {
    result.ogTags = ogTags;
  }

  return result;
}

// Extract headings from HTML
function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const text = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    
    if (text) {
      headings.push({ level, text });
    }
  }
  
  return headings;
}

// Extract links from HTML
function extractLinks(html: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const seen = new Set<string>();
  
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1].trim();
    const text = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    
    // Skip empty URLs, javascript:, mailto:, anchors
    if (!url || url.startsWith("javascript:") || url.startsWith("mailto:") || url.startsWith("#")) {
      continue;
    }
    
    // Skip duplicates
    const key = `${url}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    
    links.push({ text, url });
  }
  
  return links;
}

// Simple HTML tag stripper
function stripHtmlTags(html: string): string {
  let text = html;
  
  // Remove script and style blocks
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  
  // Replace common block elements with newlines
  text = text.replace(/<\/?(?:div|p|br|hr|h[1-6]|li|tr|td|th|blockquote|pre|code)[^>]*>/gi, "\n");
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, "");
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n\n");
  
  return text.trim();
}
