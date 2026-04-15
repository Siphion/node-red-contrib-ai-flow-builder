"use strict";

const fs = require("fs").promises;
const { OpenAI } = require("openai");

function createOpenAIClient(configNode) {
  return new OpenAI({
    apiKey: configNode.credentials && configNode.credentials.apiKey,
    baseURL: configNode.baseUrl || undefined
  });
}

async function buildOpenAIContent(text, attachments) {
  if (!attachments || !attachments.length) return text;
  const parts = [];
  if (text) parts.push({ type: "text", text });
  for (const att of attachments) {
    if (att.mimeType && att.mimeType.startsWith("image/")) {
      const buf = await fs.readFile(att.path);
      const b64 = buf.toString("base64");
      parts.push({
        type: "image_url",
        image_url: { url: `data:${att.mimeType};base64,${b64}` }
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
  return parts;
}

async function* streamOpenAI({ configNode, systemPrompt, messages }) {
  const client = createOpenAIClient(configNode);
  const oaiMessages = [];
  if (systemPrompt) oaiMessages.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    oaiMessages.push({
      role: m.role,
      content: await buildOpenAIContent(m.content || "", m.attachments || [])
    });
  }

  const stream = await client.chat.completions.create({
    model: configNode.model,
    messages: oaiMessages,
    stream: true
  });

  for await (const chunk of stream) {
    const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if (delta && delta.content) yield { type: "delta", text: delta.content };
  }
  yield { type: "done" };
}

module.exports = { streamOpenAI };
