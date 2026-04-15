"use strict";

const fs = require("fs").promises;
const Anthropic = require("@anthropic-ai/sdk").default || require("@anthropic-ai/sdk");

function createClient(configNode) {
  return new Anthropic({
    apiKey: configNode.credentials && configNode.credentials.apiKey,
    baseURL: configNode.baseUrl || undefined
  });
}

async function buildContent(text, attachments) {
  if (!attachments || !attachments.length) return text ? [{ type: "text", text }] : [];
  const parts = [];
  for (const att of attachments) {
    if (att.mimeType && att.mimeType.startsWith("image/")) {
      const buf = await fs.readFile(att.path);
      parts.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: buf.toString("base64") }
      });
    } else if (att.mimeType === "application/pdf") {
      const buf = await fs.readFile(att.path);
      parts.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") }
      });
    } else if (att.mimeType && (att.mimeType.startsWith("text/") || att.mimeType === "application/json")) {
      const buf = await fs.readFile(att.path, "utf8");
      parts.push({
        type: "text",
        text: `--- Attachment: ${att.originalName} (${att.mimeType}) ---\n${buf.slice(0, 200000)}\n--- end ---`
      });
    } else {
      parts.push({
        type: "text",
        text: `(binary attachment ${att.originalName} of type ${att.mimeType} — ${att.size} bytes — not embedded)`
      });
    }
  }
  if (text) parts.push({ type: "text", text });
  return parts;
}

async function* streamAnthropic({ configNode, systemPrompt, messages }) {
  const client = createClient(configNode);
  const anthropicMessages = [];
  for (const m of messages) {
    anthropicMessages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: await buildContent(m.content || "", m.attachments || [])
    });
  }

  const stream = await client.messages.stream({
    model: configNode.model,
    max_tokens: 4096,
    system: systemPrompt || undefined,
    messages: anthropicMessages
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta && event.delta.type === "text_delta") {
      yield { type: "delta", text: event.delta.text };
    }
  }
  yield { type: "done" };
}

module.exports = { streamAnthropic };
