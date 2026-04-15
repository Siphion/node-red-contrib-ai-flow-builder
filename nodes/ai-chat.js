const path = require("path");
const express = require("express");
const multer = require("multer");
const { Storage } = require("../lib/storage");
const { streamProvider } = require("../lib/providers");
const { buildSystemPrompt } = require("../lib/context-builder");

module.exports = function (RED) {
  const publicDir = path.join(__dirname, "..", "public");
  const storage = new Storage(RED.settings.userDir || process.cwd());

  if (!RED.httpAdmin._nrafbStaticMounted) {
    RED.httpAdmin.use("/ai-flow-builder/static", express.static(publicDir));
    RED.httpAdmin._nrafbStaticMounted = true;
  }

  const readPerm = RED.auth.needsPermission("flows.read");
  const writePerm = RED.auth.needsPermission("flows.write");

  RED.httpAdmin.get("/ai-flow-builder/providers", readPerm, (req, res) => {
    const providers = [];
    RED.nodes.eachNode(n => {
      if (n.type === "ai-provider-config") {
        providers.push({ id: n.id, label: n.name || n.label || `${n.provider}:${n.model}`, provider: n.provider, model: n.model });
      }
    });
    res.json(providers);
  });

  RED.httpAdmin.get("/ai-flow-builder/conversations", readPerm, async (req, res) => {
    try { res.json(await storage.listConversations()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  RED.httpAdmin.post("/ai-flow-builder/conversations", writePerm, express.json(), async (req, res) => {
    try { res.json(await storage.createConversation({ title: req.body && req.body.title })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  RED.httpAdmin.get("/ai-flow-builder/conversations/:id", readPerm, async (req, res) => {
    try { res.json(await storage.getConversation(req.params.id)); }
    catch (e) { res.status(404).json({ error: "not found" }); }
  });

  RED.httpAdmin.delete("/ai-flow-builder/conversations/:id", writePerm, async (req, res) => {
    try { await storage.deleteConversation(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  RED.httpAdmin.post("/ai-flow-builder/conversations/:id/messages", writePerm, express.json({ limit: "25mb" }), async (req, res) => {
    const { id } = req.params;
    const { content, attachments = [], flowContext = {}, providerId } = req.body || {};

    const providerNode = RED.nodes.getNode(providerId);
    if (!providerNode || providerNode.type !== "ai-provider-config") {
      return res.status(400).json({ error: "invalid providerId" });
    }

    let conv;
    try { conv = await storage.getConversation(id); }
    catch (e) { return res.status(404).json({ error: "conversation not found" }); }

    // Resolve attachment storedName → filesystem path
    const resolvedAttachments = attachments.map(a => ({
      ...a,
      path: storage.attachmentPath(id, a.storedName)
    }));

    await storage.appendMessage(id, {
      role: "user",
      content,
      attachments: attachments.map(a => ({
        id: a.id, storedName: a.storedName, originalName: a.originalName,
        mimeType: a.mimeType, size: a.size
      }))
    });

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const history = (await storage.getConversation(id)).messages.map(m => ({
      role: m.role, content: m.content || "",
      attachments: (m.attachments || []).map(a => ({ ...a, path: storage.attachmentPath(id, a.storedName) }))
    }));
    // Ensure current message is present with resolved paths.
    history[history.length - 1].attachments = resolvedAttachments;

    const systemPrompt = buildSystemPrompt(flowContext);
    let assistantBuffer = "";

    try {
      for await (const evt of streamProvider({ configNode: providerNode, systemPrompt, messages: history })) {
        if (evt.type === "delta") {
          assistantBuffer += evt.text;
          send("delta", { text: evt.text });
        } else if (evt.type === "error") {
          send("error", { error: evt.error });
        } else if (evt.type === "done") {
          send("done", {});
        }
      }
    } catch (e) {
      send("error", { error: e.message || String(e) });
    }

    if (assistantBuffer) {
      await storage.appendMessage(id, { role: "assistant", content: assistantBuffer });
    }
    res.end();
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  RED.httpAdmin.post("/ai-flow-builder/conversations/:id/attachments", writePerm, upload.array("files", 10), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.getConversation(id); // existence check
      const out = [];
      for (const f of req.files || []) {
        const saved = await storage.saveAttachment(id, {
          buffer: f.buffer,
          originalName: f.originalname,
          mimeType: f.mimetype
        });
        out.push(saved);
      }
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  RED.httpAdmin.get("/ai-flow-builder/conversations/:id/attachments/:storedName", readPerm, async (req, res) => {
    try {
      const p = storage.attachmentPath(req.params.id, req.params.storedName);
      res.sendFile(p);
    } catch (e) { res.status(404).json({ error: "not found" }); }
  });

  RED._nrafbStorage = storage;
};
