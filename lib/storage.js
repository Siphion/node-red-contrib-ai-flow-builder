const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");

class Storage {
  constructor(userDir) {
    this.rootDir = path.join(userDir, "ai-flow-builder");
    this.convDir = path.join(this.rootDir, "conversations");
    this.attDir = path.join(this.rootDir, "attachments");
    fsSync.mkdirSync(this.convDir, { recursive: true });
    fsSync.mkdirSync(this.attDir, { recursive: true });
  }

  _convPath(id) {
    if (!/^[a-f0-9-]+$/i.test(id)) throw new Error("invalid conversation id");
    return path.join(this.convDir, `${id}.json`);
  }

  _attDir(id) {
    if (!/^[a-f0-9-]+$/i.test(id)) throw new Error("invalid conversation id");
    return path.join(this.attDir, id);
  }

  async _writeAtomic(filePath, data) {
    const tmp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  }

  async listConversations() {
    const entries = await fs.readdir(this.convDir).catch(() => []);
    const out = [];
    for (const f of entries) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(this.convDir, f), "utf8");
        const c = JSON.parse(raw);
        out.push({
          id: c.id,
          title: c.title || "Untitled",
          updatedAt: c.updatedAt || 0,
          messageCount: (c.messages || []).length
        });
      } catch (_) {}
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  async createConversation({ title } = {}) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const conv = {
      id,
      title: title || "New chat",
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    await this._writeAtomic(this._convPath(id), JSON.stringify(conv, null, 2));
    return conv;
  }

  async getConversation(id) {
    const raw = await fs.readFile(this._convPath(id), "utf8");
    return JSON.parse(raw);
  }

  async saveConversation(conv) {
    conv.updatedAt = Date.now();
    await this._writeAtomic(this._convPath(conv.id), JSON.stringify(conv, null, 2));
    return conv;
  }

  async appendMessage(id, message) {
    const conv = await this.getConversation(id);
    conv.messages.push({ ...message, ts: Date.now() });
    if (conv.messages.length === 1 && message.role === "user" && !conv.titleSet) {
      conv.title = (message.content || "").slice(0, 60).trim() || conv.title;
      conv.titleSet = true;
    }
    return this.saveConversation(conv);
  }

  async deleteConversation(id) {
    await fs.unlink(this._convPath(id)).catch(() => {});
    await fs.rm(this._attDir(id), { recursive: true, force: true }).catch(() => {});
  }

  async saveAttachment(conversationId, { buffer, originalName, mimeType }) {
    const dir = this._attDir(conversationId);
    await fs.mkdir(dir, { recursive: true });
    const fileId = crypto.randomUUID();
    const safeExt = path.extname(originalName || "").slice(0, 12).replace(/[^.a-z0-9]/gi, "");
    const storedName = `${fileId}${safeExt}`;
    await fs.writeFile(path.join(dir, storedName), buffer);
    return {
      id: fileId,
      storedName,
      originalName: originalName || storedName,
      mimeType: mimeType || "application/octet-stream",
      size: buffer.length
    };
  }

  async readAttachment(conversationId, storedName) {
    if (storedName.includes("/") || storedName.includes("..")) throw new Error("invalid attachment name");
    return fs.readFile(path.join(this._attDir(conversationId), storedName));
  }

  attachmentPath(conversationId, storedName) {
    if (storedName.includes("/") || storedName.includes("..")) throw new Error("invalid attachment name");
    return path.join(this._attDir(conversationId), storedName);
  }
}

module.exports = { Storage };
