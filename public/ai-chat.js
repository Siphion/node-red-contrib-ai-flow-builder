(function () {
  "use strict";

  const NRAFB = {
    root: null,
    state: {
      conversationId: null,
      providerId: null,
      extraTabIds: [],
      pendingAttachments: []
    }
  };

  NRAFB.init = function ($root) {
    NRAFB.root = $root;
    NRAFB.refreshProviders();
    NRAFB.refreshConversations();
    NRAFB.bindUi();
    NRAFB.appendSystemMessage("Welcome! Create a new chat (+) or pick an existing one.");
  };

  NRAFB.appendSystemMessage = function (text) {
    NRAFB.root.find(".nrafb-messages").append($(`<div class="nrafb-msg assistant"></div>`).text(text));
  };

  NRAFB.providerLabel = function (n) {
    if (n.name) return n.name;
    return `${n.provider || "?"}:${n.model || "?"}`;
  };

  NRAFB.listLocalProviders = function () {
    const list = [];
    RED.nodes.eachConfig(n => {
      if (n.type === "ai-provider-config") {
        list.push({ id: n.id, label: NRAFB.providerLabel(n), provider: n.provider, model: n.model });
      }
    });
    return list;
  };

  NRAFB.renderProviders = function (list, preferredId) {
    const $sel = NRAFB.root.find(".nrafb-provider");
    const previous = preferredId || NRAFB.state.providerId || $sel.val();
    $sel.empty();
    if (!list.length) {
      $sel.append(`<option value="">(no providers — click ⚙)</option>`);
      NRAFB.state.providerId = null;
      return;
    }
    list.forEach(p => $sel.append(`<option value="${p.id}">${$("<div>").text(p.label).html()}</option>`));
    const pick = list.find(p => p.id === previous) ? previous : list[0].id;
    $sel.val(pick);
    NRAFB.state.providerId = pick;
  };

  NRAFB.refreshProviders = function (preferredId) {
    // Immediate snapshot from the editor (catches nodes not yet deployed).
    NRAFB.renderProviders(NRAFB.listLocalProviders(), preferredId);
    // Then reconcile with backend (the deployed ones).
    $.getJSON("ai-flow-builder/providers").done(serverList => {
      const localList = NRAFB.listLocalProviders();
      const map = new Map();
      [...serverList, ...localList].forEach(p => map.set(p.id, p));
      NRAFB.renderProviders([...map.values()], preferredId);
    });
  };

  NRAFB.openProviderEditor = function (targetId) {
    if (!RED.editor || typeof RED.editor.editConfig !== "function") {
      alert("Your Node-RED version does not expose RED.editor.editConfig.");
      return;
    }
    const mode = targetId || "_ADD_";
    if (mode !== "_ADD_" && !NRAFB.listLocalProviders().some(p => p.id === mode)) {
      RED.notify("Select a provider first, or use + to add a new one.", "warning");
      return;
    }
    const before = new Set(NRAFB.listLocalProviders().map(p => p.id));
    RED.editor.editConfig("", "ai-provider-config", mode);

    const started = Date.now();
    const poll = setInterval(() => {
      const trayOpen = $(".red-ui-tray").length > 0;
      if (!trayOpen || Date.now() - started > 60000) {
        clearInterval(poll);
        const now = NRAFB.listLocalProviders();
        const added = now.find(p => !before.has(p.id));
        NRAFB.refreshProviders(added ? added.id : (mode !== "_ADD_" ? mode : null));
        if (RED.nodes.dirty()) {
          RED.notify("AI provider changed — click Deploy to persist it.", "warning");
        }
      }
    }, 300);
  };

  NRAFB.refreshConversations = function () {
    $.getJSON("ai-flow-builder/conversations").done(list => {
      const $sel = NRAFB.root.find(".nrafb-conversations");
      const current = NRAFB.state.conversationId;
      $sel.empty().append(`<option value="">— conversations (${list.length}) —</option>`);
      list.forEach(c => $sel.append(`<option value="${c.id}">${$("<div>").text(c.title).html()}</option>`));
      if (current) $sel.val(current);
    });
  };

  NRAFB.loadConversation = function (id) {
    if (!id) {
      NRAFB.state.conversationId = null;
      NRAFB.root.find(".nrafb-messages").empty();
      NRAFB.appendSystemMessage("No chat selected.");
      return;
    }
    $.getJSON(`ai-flow-builder/conversations/${id}`).done(conv => {
      NRAFB.state.conversationId = conv.id;
      const $m = NRAFB.root.find(".nrafb-messages").empty();
      (conv.messages || []).forEach(msg => {
        const $msg = $(`<div class="nrafb-msg ${msg.role}"></div>`);
        if (window.NRAFB_RENDER && typeof window.NRAFB_RENDER.render === "function" && msg.role === "assistant") {
          $msg.html(window.NRAFB_RENDER.render(msg.content || ""));
        } else {
          $msg.text(msg.content || "");
        }
        if ((msg.attachments || []).length) {
          const $att = $(`<div class="nrafb-attachments"></div>`);
          msg.attachments.forEach(a => $att.append(NRAFB.renderAttachmentChip(a, conv.id)));
          $msg.append($att);
        }
        $m.append($msg);
      });
    });
  };

  NRAFB.newConversation = function () {
    $.ajax({
      url: "ai-flow-builder/conversations",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ title: "New chat" })
    }).done(conv => {
      NRAFB.state.conversationId = conv.id;
      NRAFB.refreshConversations();
      NRAFB.root.find(".nrafb-messages").empty();
      NRAFB.appendSystemMessage("New chat ready.");
    });
  };

  NRAFB.deleteConversation = function () {
    const id = NRAFB.state.conversationId;
    if (!id) return;
    if (!confirm("Delete this conversation and its attachments?")) return;
    $.ajax({ url: `ai-flow-builder/conversations/${id}`, method: "DELETE" }).done(() => {
      NRAFB.state.conversationId = null;
      NRAFB.root.find(".nrafb-messages").empty();
      NRAFB.refreshConversations();
      NRAFB.appendSystemMessage("Conversation deleted.");
    });
  };

  NRAFB.bindUi = function () {
    NRAFB.root.on("click", ".nrafb-new", NRAFB.newConversation);
    NRAFB.root.on("click", ".nrafb-delete", NRAFB.deleteConversation);
    NRAFB.root.on("change", ".nrafb-conversations", function () {
      NRAFB.loadConversation($(this).val());
    });

    const $root = NRAFB.root;

    $root.on("change", ".nrafb-provider", function () {
      NRAFB.state.providerId = $(this).val();
    });

    $root.on("click", ".nrafb-provider-add", () => NRAFB.openProviderEditor("_ADD_"));
    $root.on("click", ".nrafb-provider-edit", () => NRAFB.openProviderEditor(NRAFB.state.providerId));

    $root.on("click", ".nrafb-send", NRAFB.sendMessage);
    $root.on("keydown", ".nrafb-input", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        NRAFB.sendMessage();
      }
    });

    $root.on("click", ".nrafb-attach", () => $root.find(".nrafb-file").trigger("click"));
    $root.on("change", ".nrafb-file", NRAFB.uploadFiles);

    $root.on("click", ".nrafb-tabpicker", NRAFB.openTabPicker);

    $root.on("click", ".nrafb-att-remove", function (e) {
      e.preventDefault();
      const id = $(this).data("id");
      NRAFB.state.pendingAttachments = (NRAFB.state.pendingAttachments || []).filter(a => a.id !== id);
      NRAFB.renderPendingAttachments();
    });

    $root.on("click", ".nrafb-attachment-chip", function (e) {
      if ($(e.target).hasClass("nrafb-att-remove")) return;
      const $c = $(this);
      NRAFB.openAttachmentViewer($c.data("url"), $c.data("mime"), $c.data("name"));
    });
  };

  NRAFB.uploadFiles = async function () {
    const fileInput = this;
    if (!NRAFB.state.conversationId) {
      NRAFB.appendSystemMessage("Create a new chat first before attaching files.");
      fileInput.value = "";
      return;
    }
    const fd = new FormData();
    for (const f of fileInput.files) fd.append("files", f);
    try {
      const resp = await fetch(`ai-flow-builder/conversations/${NRAFB.state.conversationId}/attachments`, {
        method: "POST",
        body: fd
      });
      const saved = await resp.json();
      NRAFB.state.pendingAttachments = (NRAFB.state.pendingAttachments || []).concat(saved);
      NRAFB.renderPendingAttachments();
    } catch (e) {
      NRAFB.appendSystemMessage(`Upload failed: ${e.message}`);
    }
    fileInput.value = "";
  };

  NRAFB.renderPendingAttachments = function () {
    let $wrap = NRAFB.root.find(".nrafb-attachments.pending");
    if (!$wrap.length) {
      $wrap = $(`<div class="nrafb-attachments pending"></div>`);
      NRAFB.root.find(".nrafb-context").append($wrap);
    }
    $wrap.empty();
    (NRAFB.state.pendingAttachments || []).forEach(a => {
      const $chip = NRAFB.renderAttachmentChip(a, NRAFB.state.conversationId);
      $chip.append(` <a href="#" class="nrafb-att-remove" data-id="${a.id}" title="remove">×</a>`);
      $wrap.append($chip);
    });
  };

  NRAFB.renderAttachmentChip = function (att, conversationId) {
    const url = `ai-flow-builder/conversations/${conversationId}/attachments/${att.storedName}`;
    const isImage = att.mimeType && att.mimeType.startsWith("image/");
    const preview = isImage
      ? `<img src="${url}" alt="${$("<div>").text(att.originalName).html()}" />`
      : `<i class="fa fa-file"></i>`;
    const $chip = $(`<span class="nrafb-attachment-chip" data-url="${url}" data-mime="${att.mimeType}" data-name="${$("<div>").text(att.originalName).html()}">${preview}<span>${$("<div>").text(att.originalName).html()}</span></span>`);
    return $chip;
  };

  NRAFB.openAttachmentViewer = function (url, mime, name) {
    const $overlay = $(`<div class="nrafb-viewer-overlay"></div>`);
    let inner = "";
    if (mime && mime.startsWith("image/")) {
      inner = `<img src="${url}" style="max-width:90vw;max-height:90vh;" />`;
    } else if (mime === "application/pdf") {
      inner = `<object data="${url}" type="application/pdf" style="width:80vw;height:85vh"></object>`;
    } else if (mime && (mime.startsWith("text/") || mime === "application/json")) {
      inner = `<pre class="nrafb-viewer-text" style="background:#1e1e1e;color:#d4d4d4;padding:12px;max-width:80vw;max-height:85vh;overflow:auto;">loading…</pre>`;
    } else {
      inner = `<a href="${url}" download="${name}" class="nrafb-btn">Download ${name}</a>`;
    }
    $overlay.append(`<div class="nrafb-viewer-body">${inner}<div style="text-align:right;margin-top:8px"><a href="${url}" download="${name}">download</a> · <button class="nrafb-btn nrafb-viewer-close">close</button></div></div>`);
    $("body").append($overlay);
    if (mime && (mime.startsWith("text/") || mime === "application/json")) {
      fetch(url).then(r => r.text()).then(txt => $overlay.find(".nrafb-viewer-text").text(txt));
    }
    $overlay.on("click", e => { if (e.target === $overlay[0] || $(e.target).hasClass("nrafb-viewer-close")) $overlay.remove(); });
  };

  NRAFB.listTabs = function () {
    const tabs = [];
    if (RED.nodes.eachWorkspace) {
      RED.nodes.eachWorkspace(ws => tabs.push({ id: ws.id, label: ws.label || ws.id }));
    }
    return tabs;
  };

  NRAFB.updateTabPickerLabel = function () {
    const n = (NRAFB.state.extraTabIds || []).length;
    const txt = n > 0 ? `active + ${n} tab${n > 1 ? "s" : ""}` : "active tab";
    NRAFB.root.find(".nrafb-tabpicker-label").text(txt);
  };

  NRAFB.openTabPicker = function (e) {
    e.stopPropagation();
    $(".nrafb-tabpicker-panel").remove();
    const $btn = $(e.currentTarget);
    const activeId = RED.workspaces && RED.workspaces.active && RED.workspaces.active();
    const tabs = NRAFB.listTabs();
    const $panel = $(`<div class="nrafb-tabpicker-panel"></div>`);
    tabs.forEach(t => {
      const isActive = t.id === activeId;
      const isSelected = isActive || NRAFB.state.extraTabIds.includes(t.id);
      const $row = $(`
        <label>
          <input type="checkbox" data-tabid="${t.id}" ${isSelected ? "checked" : ""} ${isActive ? "disabled" : ""} />
          <span>${$("<div>").text(t.label).html()}${isActive ? " <i>(active)</i>" : ""}</span>
        </label>
      `);
      $panel.append($row);
    });
    const off = $btn.offset();
    $panel.css({ top: off.top + $btn.outerHeight() + 2, left: off.left });
    $("body").append($panel);

    const closeHandler = (ev) => {
      if ($(ev.target).closest(".nrafb-tabpicker-panel").length) return;
      NRAFB.state.extraTabIds = $panel.find("input:checked:not(:disabled)").map(function () {
        return $(this).data("tabid");
      }).get();
      NRAFB.updateTabPickerLabel();
      $panel.remove();
      $(document).off("mousedown", closeHandler);
    };
    setTimeout(() => $(document).on("mousedown", closeHandler), 0);
  };

  NRAFB.collectFlowContext = function () {
    const activeTabId = RED.workspaces && RED.workspaces.active && RED.workspaces.active();
    const extraTabIds = NRAFB.state.extraTabIds || [];
    const tabIds = [activeTabId, ...extraTabIds].filter(Boolean);
    const flowJson = (RED.nodes.createCompleteNodeSet ? RED.nodes.createCompleteNodeSet() : RED.nodes.getNodes())
      .filter(n => n.type === "tab" ? tabIds.includes(n.id) : tabIds.includes(n.z));
    // Include the tab nodes themselves for context.
    const tabDefs = (RED.nodes.createCompleteNodeSet ? RED.nodes.createCompleteNodeSet() : [])
      .filter(n => n.type === "tab" && tabIds.includes(n.id));
    // Build palette context: every registered node type, grouped by module, core flagged.
    const paletteByModule = {};
    try {
      const reg = RED.nodes.registry;
      const list = (reg && reg.getNodeList && reg.getNodeList()) || [];
      list.forEach(entry => {
        if (!entry || entry.enabled === false) return;
        const mod = entry.module || "node-red";
        const version = entry.version || null;
        if (!paletteByModule[mod]) paletteByModule[mod] = { module: mod, version, core: mod === "node-red", types: [] };
        (entry.types || []).forEach(t => {
          if (!paletteByModule[mod].types.includes(t)) paletteByModule[mod].types.push(t);
        });
      });
    } catch (_) {}
    const palette = Object.values(paletteByModule).sort((a, b) => {
      if (a.core !== b.core) return a.core ? -1 : 1;
      return a.module.localeCompare(b.module);
    });
    return {
      activeTabId,
      extraTabIds,
      flowJson: [...tabDefs, ...flowJson],
      palette
    };
  };

  NRAFB.sendMessage = async function () {
    if (!NRAFB.state.conversationId) {
      NRAFB.appendSystemMessage("Create a new chat first (+ button).");
      return;
    }
    if (!NRAFB.state.providerId) {
      NRAFB.appendSystemMessage("No AI provider configured. Add an ai-provider-config node and deploy.");
      return;
    }
    const $input = NRAFB.root.find(".nrafb-input");
    const text = ($input.val() || "").trim();
    if (!text) return;
    NRAFB.root.find(".nrafb-messages").append($(`<div class="nrafb-msg user"></div>`).text(text));
    $input.val("");

    const $assistant = $(`<div class="nrafb-msg assistant streaming"></div>`);
    NRAFB.root.find(".nrafb-messages").append($assistant);

    try {
      const body = {
        content: text,
        attachments: NRAFB.state.pendingAttachments,
        flowContext: NRAFB.collectFlowContext(),
        providerId: NRAFB.state.providerId
      };
      const resp = await fetch(`ai-flow-builder/conversations/${NRAFB.state.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      NRAFB.state.pendingAttachments = [];
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop();
        for (const frame of frames) {
          const lines = frame.split("\n");
          let event = "message", data = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) event = l.slice(7);
            else if (l.startsWith("data: ")) data += l.slice(6);
          }
          try { data = JSON.parse(data); } catch (_) {}
          if (event === "delta" && data && data.text) {
            acc += data.text;
            if (window.NRAFB_RENDER && typeof window.NRAFB_RENDER.render === "function") {
              $assistant.html(window.NRAFB_RENDER.render(acc));
            } else {
              $assistant.text(acc);
            }
          } else if (event === "error") {
            $assistant.append(`<div style="color:#c33">Error: ${data && data.error}</div>`);
          }
        }
      }
      $assistant.removeClass("streaming");
      NRAFB.refreshConversations();
    } catch (e) {
      $assistant.removeClass("streaming").append(`<div style="color:#c33">Request failed: ${e.message}</div>`);
    }
  };

  window.NRAFB = NRAFB;
})();
