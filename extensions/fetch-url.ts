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
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { url, format = "auto" } = params;

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

        // Truncate if too long (max 50KB for LLM context)
        const maxLength = 50000;
        let truncated = false;
        if (content.length > maxLength) {
          content = content.slice(0, maxLength) + "\n\n... [content truncated, too long]";
          truncated = true;
        }

        return {
          content: [{ type: "text", text: `${getStatusEmoji(response.status)} ${url}${truncated ? " ✂️" : ""}` }],
          details: {
            url,
            statusCode: response.status,
            format: displayFormat,
            contentType,
            length: content.length,
            truncated,
            fullContent: content, // Full content always available for processing
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
