# node-red-contrib-ai-flow-builder

> AI chat sidebar for **Node-RED** — chat with **OpenAI** or **Anthropic** right inside the editor. The assistant sees your flow(s), reads installed palette modules, accepts images/files, and can **apply code changes directly to your canvas** — the active tab or any other tab.

> Version: **0.1.2**

---

## Highlights

- 💬 Right-sidebar chat with streaming responses (SSE).
- 🤖 **OpenAI** and **Anthropic** — pick any model available from your account (free-text field with live suggestions + a direct link to each provider's official model list).
- 🔒 API keys live in a Node-RED **config node** (encrypted `flows_cred.json`). They never reach the browser.
- 📎 Multipart upload of images, PDFs, JSON/text — with an in-chat viewer (lightbox + text pane + PDF embed).
- 🧠 Flow context auto-attached: active tab JSON + selectable *additional* tabs through a compact multi-select + full catalog of every registered node type (grouped by module, core nodes flagged) so the AI only suggests things you actually have installed.
- 🛡️ Built-in **sanitizer** strips `credentials`, `password`, `token`, `secret`, `apiKey`, `auth`, and every `${env.*}` reference **before** anything leaves your machine.
- ✏️ **Copy & Apply** buttons per code block. Apply targets the active tab, any other tab, a specific node, a subflow, or a brand-new tab. Preview before apply. Undo via editor `Ctrl+Z`.
- 🗂️ Conversations persisted under `<userDir>/ai-flow-builder/` — new / reopen / delete. Delete also removes the attachments folder.

---

## Install

From the Node-RED palette:

> Manage palette → Install → `node-red-contrib-ai-flow-builder`

The palette manager loads the new nodes immediately — no restart required. Reload the editor (Ctrl+Shift+R) and the **AI Chat** tab appears in the right sidebar.

Manual install (requires a Node-RED restart):

```bash
cd ~/.node-red
npm install node-red-contrib-ai-flow-builder
node-red-restart        # or however you run your instance
```

## Configure providers

1. Open the **AI Chat** sidebar. Next to the provider dropdown you have two buttons:
   - **+** — create a new provider
   - **⚙** — edit the currently selected one
2. In the dialog: pick **OpenAI** or **Anthropic**, choose/type a **model** (free-text field, autocomplete suggestions + a link to the official model list of the provider), paste your **API key**, optionally a custom **Base URL** (for proxies or OpenAI-compatible endpoints).
3. Click **Add** in the dialog, then **Deploy** (top-right) to persist. *The key is stored encrypted in `flows_cred.json` server-side.*
4. Repeat **+** to add as many providers as you like — multiple OpenAI keys, mix OpenAI + Anthropic, different models. Switch between them from the dropdown at any time, even mid-conversation.

> Conversations are **provider-agnostic**: the chosen provider is a per-message attribute, not a per-chat setting. You can start with GPT-X, continue with Claude, switch back — the whole history stays.

## Usage

### Sidebar anatomy

- **Toolbar** (top): **+** (new chat) · conversations dropdown · **🗑** (delete current chat) · provider dropdown · **+** (add provider) · **⚙** (edit selected provider).
- **Messages** area — scrollable, user messages right-aligned, assistant left-aligned, code blocks with Copy / Preview / Apply buttons.
- **Context row** (just above the textarea): **📁 active tab** chip (click to add more tabs to the context via a compact multi-select) · **📎** (attach files) · previews of pending attachments.
- **Textarea** — full width, Ctrl/⌘+Enter to send.
- **Send button** — full-width under the textarea.

### Day-to-day flow

1. **New chat** — click **+** (leftmost button). Conversations are listed in the dropdown — reopen any time, click **🗑** to delete (removes attachments too).
2. **Pick a provider** from the dropdown. Click **+** / **⚙** next to it to add/edit providers without leaving the sidebar.
3. **Tab context** — the active canvas tab is always sent. Click the compact chip (`📁 active tab`) to open a multi-select and add *other* tabs to the context for this message (e.g. "look at Flow 2 and Flow 3").
4. **Attach files** — click **📎**. Supported: images (vision), PDFs (Anthropic has native support), text / JSON / YAML / CSV / logs. Click on a chip in the message to open the viewer (lightbox / text pane / PDF embed). Attachments persist with the conversation.
5. **Send** — Ctrl/⌘+Enter or the paper-plane button. Responses stream in real time.

### What the AI sees

Every message sends, as system context, a sanitized snapshot of:

- the active tab + any extra tabs you ticked in the multi-select,
- the full catalog of registered node types, grouped by module, with the core modules flagged — so the AI knows exactly what's usable in this installation (and what isn't).

The **sanitizer** scrubs anything that looks like a secret *value* (key names are kept so the model understands the structure). See [Security](#security) below.

### Apply-able code blocks

When the AI proposes changes, it wraps them in fenced code blocks using one of these language labels:

| Language label                    | Action when you click **Apply**                      |
|----------------------------------|------------------------------------------------------|
| ` ```json:flow:<tabId> `         | Import JSON nodes into that tab                      |
| ` ```json:flow:new `             | Create a brand-new tab and import the nodes there    |
| ` ```json:node:<nodeId> `        | Patch the specified node's fields                    |
| ` ```json:subflow:<id\|new> `    | Create/update a subflow                              |
| ` ```json:delete `               | Delete an array of node / tab IDs (cleans inbound wires automatically) |
| ` ```json:connect `              | Add wires: `[{ "from":"<src>", "port":0, "to":"<dst>" }]` (non-destructive) |
| ` ```json:disconnect `           | Remove specific wires (same shape as `connect`)      |
| any other (`json`, `text`, `js`) | Copy only — no automatic apply                       |

Every block has its own **Copy** / **Preview** / **Apply** buttons:

- **Copy** — copies the raw content to the clipboard.
- **Preview** — shows a plain-English summary of what the Apply would do (how many nodes, in which tab, which fields patched, which wires added/removed). Confirm or cancel.
- **Apply** — performs the change against the editor in memory. Added to the **undo history**, so `Ctrl+Z` / `Ctrl+Y` work as usual. Changes are **not** deployed automatically — hit the Deploy button when you're ready.

### Prompting tips

- Be explicit about scope when you want changes in a specific tab: *"add a http-in on Flow 2 and wire it to the existing JSON parser"*.
- If an apply block references a node ID that no longer exists (e.g. you deleted it), the apply will report "node not found" in a toast — harmless.
- Ask the AI to **only produce a `json:connect` block** when you just want to wire two nodes without recreating them from scratch.
- `Ctrl+Z` undoes the entire apply as a single operation.

### Example prompts

- *"Add an inject node that fires every 5s and pipe its payload to a debug node."* → `json:flow:<tabId>`.
- *"Connect the existing mqtt-in `a1b2c3` to the function node `d4e5f6`."* → `json:connect`.
- *"Disable the debug node `xy12z3` and rename it to 'legacy'."* → `json:node:xy12z3`.
- *"Remove all the http nodes from this tab."* → `json:delete`.
- *"Summarize what this flow does."* → plain markdown, no Apply buttons.

## Security

Before sending flow JSON to the provider, the sanitizer:

- removes every `ai-provider-config` node entirely,
- replaces **values** under keys matching `password`, `passwd`, `pwd`, `token`, `secret`, `apiKey`, `auth`, `authorization`, `bearer`, `privateKey`, `credentials` with `[REDACTED]` (key names are kept so the model understands the structure),
- leaves `${env.FOO}` / `${settings.BAR}` references intact — those are just names, the actual secrets live in `settings.js` / `process.env` and are never present in the flow JSON.

On **Apply**, any `[REDACTED]` value in the AI's response is dropped before the change hits the editor — so the pre-existing real secret in that field is preserved, never overwritten with the placeholder string. A notification lists which paths were kept.

Attachments are stored at `<userDir>/ai-flow-builder/attachments/<conversationId>/`. Deleting a conversation deletes its attachment folder too.

## Development

```bash
git clone https://github.com/Siphion/node-red-contrib-ai-flow-builder
cd node-red-contrib-ai-flow-builder
npm install
npm test                        # mocha unit tests (sanitizer + storage)

cd docker && docker compose up  # Node-RED 4.1 on http://localhost:1880
```

`docker/docker-compose.yml` mounts this repo as a linked module inside the Node-RED container at `/data/node_modules/node-red-contrib-ai-flow-builder`. Restart the container after editing server-side code; for browser-side code just hard-reload the editor.

### Project layout

```
nodes/                 Node-RED node definitions (config node + sidebar bootstrap)
lib/                   Backend
  providers/           OpenAI + Anthropic streaming wrappers
  storage.js           Atomic JSON storage under userDir
  sanitizer.js         Flow JSON credential/env stripper
  context-builder.js   System prompt composer
public/                Frontend
  ai-chat.js           Sidebar logic
  message-renderer.js  Markdown → HTML with Copy/Apply blocks
  apply-handlers.js    Dispatch on language labels → RED.nodes.import / patch / new tab
  ai-chat.css          Styling
test/                  Mocha unit tests
docker/                Local dev compose
```

## Troubleshooting

- **Dropdown says "no providers"** — click **+**, fill the form, hit **Add** *and* **Deploy**. Until deploy, the provider exists in the editor but the backend can't read the (encrypted) API key.
- **"Remember to Deploy"** toast — shown when you modified a provider but did not deploy yet. The backend needs a deploy to read the new credentials.
- **Apply says "node not found"** — the AI referenced an ID that no longer exists. Just ask the AI to use the current IDs (which are visible in its context).
- **Unexpected `[REDACTED]` in an apply** — means the sanitizer stripped that field on the way out, and the model echoed the placeholder back. The apply step drops those automatically so your existing secret is preserved. To unblock, fill the real value manually in the node editor, or reference it via `${env.MY_VAR}`.
- **File upload fails** — max size per attachment is 25 MB, and you must have an active conversation.

## Roadmap

- [ ] Syntax highlighting (ace) inside code blocks
- [ ] Tool-call / function-call mode (structured outputs)
- [ ] Per-conversation provider lock (to prevent accidental switches, track costs)
- [ ] Inline diff preview for existing nodes
- [ ] i18n

## License

MIT © Siphion
