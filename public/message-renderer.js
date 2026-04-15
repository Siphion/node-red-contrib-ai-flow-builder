(function () {
  "use strict";

  const CODE_FENCE = /```([\w:\-]+)?\n([\s\S]*?)```/g;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function isApplyable(lang) {
    return /^json:(flow|node|subflow):[\w-]+$/.test(lang || "") ||
           /^json:(delete|connect|disconnect)$/.test(lang || "");
  }

  function renderCodeBlock(lang, code) {
    const safeLang = escapeHtml(lang || "text");
    const safeCode = escapeHtml(code);
    const applyBtn = isApplyable(lang)
      ? `<button class="nrafb-apply" data-lang="${safeLang}">Apply</button><button class="nrafb-preview" data-lang="${safeLang}">Preview</button>`
      : "";
    return (
      `<div class="nrafb-codeblock" data-lang="${safeLang}">` +
        `<div class="nrafb-codeblock-header">` +
          `<span class="nrafb-lang">${safeLang}</span>` +
          `<button class="nrafb-copy">Copy</button>` +
          applyBtn +
        `</div>` +
        `<pre><code>${safeCode}</code></pre>` +
      `</div>`
    );
  }

  function renderInline(text) {
    // Very small markdown: bold, italic, inline code, line breaks.
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, "<br>");
  }

  function render(markdown) {
    const src = String(markdown || "");
    let out = "";
    let lastIndex = 0;
    let m;
    CODE_FENCE.lastIndex = 0;
    while ((m = CODE_FENCE.exec(src)) !== null) {
      if (m.index > lastIndex) {
        out += renderInline(src.slice(lastIndex, m.index));
      }
      out += renderCodeBlock(m[1] || "", m[2]);
      lastIndex = CODE_FENCE.lastIndex;
    }
    if (lastIndex < src.length) out += renderInline(src.slice(lastIndex));
    return out;
  }

  // Event delegation for Copy / Apply / Preview buttons.
  $(document).on("click", ".nrafb-codeblock .nrafb-copy", function () {
    const code = $(this).closest(".nrafb-codeblock").find("code").text();
    navigator.clipboard.writeText(code).then(() => {
      const $btn = $(this);
      const prev = $btn.text();
      $btn.text("copied ✓");
      setTimeout(() => $btn.text(prev), 1200);
    });
  });

  $(document).on("click", ".nrafb-codeblock .nrafb-apply", function () {
    const $b = $(this).closest(".nrafb-codeblock");
    const lang = $b.data("lang");
    const code = $b.find("code").text();
    console.log("[NRAFB_RENDER] Apply click", { lang, hasHandler: !!(window.NRAFB_APPLY && window.NRAFB_APPLY.apply) });
    if (window.NRAFB_APPLY && typeof window.NRAFB_APPLY.apply === "function") {
      window.NRAFB_APPLY.apply(lang, code);
    } else {
      alert("Apply handler not loaded yet.");
    }
  });

  $(document).on("click", ".nrafb-codeblock .nrafb-preview", function () {
    const $b = $(this).closest(".nrafb-codeblock");
    const lang = $b.data("lang");
    const code = $b.find("code").text();
    if (window.NRAFB_APPLY && typeof window.NRAFB_APPLY.preview === "function") {
      window.NRAFB_APPLY.preview(lang, code);
    } else {
      alert("Preview handler not loaded yet.");
    }
  });

  window.NRAFB_RENDER = { render };
})();
