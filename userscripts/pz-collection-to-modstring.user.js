// ==UserScript==
// @name         PZ Workshop Collection → Mod String Converter
// @namespace    pzmodmanager
// @version      1.0.0
// @description  Convert a Steam Workshop collection into Project Zomboid WorkshopItems=/Mods= strings. Lets you pick which Mod ID to use when a workshop item declares more than one.
// @author       pzmodmanager
// @match        https://steamcommunity.com/sharedfiles/filedetails/*
// @match        https://steamcommunity.com/workshop/filedetails/*
// @grant        GM_xmlhttpRequest
// @connect      api.steampowered.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const COLLECTION_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/";
  const DETAILS_URL = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
  const DETAILS_CHUNK_SIZE = 50;

  const WORKSHOP_ID_PATTERN = "Workshop ?ID: (\\d*)";
  const MOD_ID_PATTERN = "Mod ?ID: (\\d*\\w*\\d*\\w*\\d*\\.*\\d*)";

  // ---- Steam Web API helpers -------------------------------------------------

  function gmPost(url, pairs) {
    const body = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url,
        data: body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        onload: (res) => {
          try {
            resolve(JSON.parse(res.responseText));
          } catch (e) {
            reject(new Error(`Failed to parse response from ${url}: ${e.message}`));
          }
        },
        onerror: () => reject(new Error(`Request failed: ${url}`)),
        ontimeout: () => reject(new Error(`Request timed out: ${url}`)),
      });
    });
  }

  async function getCollectionChildren(collectionId) {
    const json = await gmPost(COLLECTION_URL, [
      ["collectioncount", "1"],
      ["publishedfileids[0]", collectionId],
    ]);
    const detail = json?.response?.collectiondetails?.[0];
    if (!detail || detail.result !== 1 || !Array.isArray(detail.children)) {
      throw new Error("This page is not a Steam Workshop collection, or it has no items.");
    }
    return detail.children
      .slice()
      .sort((a, b) => (a.sortorder ?? 0) - (b.sortorder ?? 0))
      .map((c) => c.publishedfileid);
  }

  async function getPublishedFileDetails(ids, onProgress) {
    const out = [];
    for (let i = 0; i < ids.length; i += DETAILS_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + DETAILS_CHUNK_SIZE);
      const pairs = [["itemcount", String(chunk.length)]];
      chunk.forEach((id, idx) => pairs.push([`publishedfileids[${idx}]`, id]));
      const json = await gmPost(DETAILS_URL, pairs);
      out.push(...(json?.response?.publishedfiledetails || []));
      onProgress?.(Math.min(i + chunk.length, ids.length), ids.length);
    }
    return out;
  }

  // ---- Parsing (same extraction logic as the original snippet, applied to file_description) --

  function extractMatches(text, pattern) {
    return (text.match(new RegExp(pattern, "gmi")) || []).map((s) => s.split(": ")[1]?.trim()).filter(Boolean);
  }

  async function fetchAndParseCollection(onProgress) {
    const collectionId = new URLSearchParams(location.search).get("id");
    if (!collectionId) throw new Error("Could not find a collection ID in the URL.");

    const childIds = await getCollectionChildren(collectionId);
    const details = await getPublishedFileDetails(childIds, onProgress);
    const detailsById = new Map(details.map((d) => [d.publishedfileid, d]));

    return childIds.map((id) => {
      const detail = detailsById.get(id);
      const desc = detail?.file_description || "";
      const ids = extractMatches(desc, WORKSHOP_ID_PATTERN);
      const names = extractMatches(desc, MOD_ID_PATTERN);
      return {
        publishedfileid: id,
        title: detail?.title || `Unknown item ${id}`,
        previewUrl: detail?.preview_url || "",
        ok: detail?.result === 1,
        ids,
        names,
        selected: 0,
      };
    });
  }

  // ---- Output assembly --------------------------------------------------------

  function buildOutput(mods) {
    const workshopItems = mods.flatMap((m) => m.ids);
    const modNames = mods.map((m) => m.names[m.selected]).filter(Boolean);
    const modList = mods
      .map((m, i) => `${i + 1}. WorkshopID:[${m.ids[0] || "?"}] ModIDs[${m.names.join(", ") || "?"}]`)
      .join(", ");
    return {
      workshopItems: `WorkshopItems=${workshopItems.join(";")}`,
      mods: `Mods=${modNames.join(";")}`,
      modList: `ModList=${modList}`,
    };
  }

  // ---- UI ------------------------------------------------------------------

  const css = `
    #pzmm-launcher {
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #66c0f4; color: #1b2838; font-weight: 700;
      border: none; border-radius: 4px; padding: 10px 16px;
      font-family: "Motiva Sans", Arial, sans-serif; font-size: 14px;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.5);
    }
    #pzmm-launcher:hover { background: #7ed0ff; }
    #pzmm-panel {
      position: fixed; top: 5%; left: 50%; transform: translateX(-50%);
      width: min(760px, 92vw); max-height: 90vh; overflow: hidden;
      background: #1b2838; color: #c6d4df; border: 1px solid #316282;
      border-radius: 6px; z-index: 1000000; display: flex; flex-direction: column;
      font-family: "Motiva Sans", Arial, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.7);
    }
    #pzmm-panel * { box-sizing: border-box; }
    #pzmm-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; background: #171a21; border-bottom: 1px solid #316282;
    }
    #pzmm-header h2 { margin: 0; font-size: 16px; color: #fff; font-weight: 600; }
    #pzmm-close { background: none; border: none; color: #8f98a0; font-size: 20px; cursor: pointer; line-height: 1; }
    #pzmm-close:hover { color: #fff; }
    #pzmm-status { padding: 10px 16px; font-size: 13px; color: #8f98a0; }
    #pzmm-list { overflow-y: auto; padding: 8px 16px; flex: 1; }
    .pzmm-row { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #2a3f5a; }
    .pzmm-row img { width: 64px; height: 64px; object-fit: cover; border-radius: 3px; flex-shrink: 0; background: #0e141b; }
    .pzmm-row-body { flex: 1; min-width: 0; }
    .pzmm-title { color: #fff; font-size: 14px; text-decoration: none; }
    .pzmm-title:hover { color: #66c0f4; }
    .pzmm-meta { font-size: 12px; color: #8f98a0; margin-top: 2px; }
    .pzmm-warn { color: #e05252; font-size: 12px; margin-top: 2px; }
    .pzmm-ids { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px 14px; }
    .pzmm-id-option { display: flex; align-items: center; gap: 5px; font-size: 12px; }
    .pzmm-id-option label { cursor: pointer; }
    #pzmm-footer { border-top: 1px solid #316282; padding: 12px 16px; background: #171a21; }
    .pzmm-out { display: flex; gap: 6px; margin-bottom: 8px; }
    .pzmm-out textarea {
      flex: 1; resize: none; height: 34px; background: #0e141b; color: #c6d4df;
      border: 1px solid #316282; border-radius: 3px; padding: 6px 8px; font-size: 12px;
      font-family: Consolas, monospace;
    }
    .pzmm-out button {
      background: #2a475e; color: #c6d4df; border: 1px solid #316282; border-radius: 3px;
      padding: 0 12px; cursor: pointer; font-size: 12px;
    }
    .pzmm-out button:hover { background: #366d95; color: #fff; }
  `;

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 1200);
    });
  }

  function renderOutputRow(label, value) {
    const row = document.createElement("div");
    row.className = "pzmm-out";
    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    textarea.value = value;
    const btn = document.createElement("button");
    btn.textContent = `Copy ${label}`;
    btn.addEventListener("click", () => copyToClipboard(textarea.value, btn));
    row.appendChild(textarea);
    row.appendChild(btn);
    return row;
  }

  function renderModRow(mod, onChange) {
    const row = document.createElement("div");
    row.className = "pzmm-row";

    const img = document.createElement("img");
    img.src = mod.previewUrl;
    img.alt = "";
    row.appendChild(img);

    const body = document.createElement("div");
    body.className = "pzmm-row-body";

    const link = document.createElement("a");
    link.href = `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "pzmm-title";
    link.textContent = mod.title;
    body.appendChild(link);

    const meta = document.createElement("div");
    meta.className = "pzmm-meta";
    meta.textContent = `Workshop ID${mod.ids.length > 1 ? "s" : ""}: ${mod.ids.join(", ") || "—"}`;
    body.appendChild(meta);

    if (!mod.ok) {
      const warn = document.createElement("div");
      warn.className = "pzmm-warn";
      warn.textContent = "Could not load details for this item.";
      body.appendChild(warn);
    } else if (mod.names.length === 0) {
      const warn = document.createElement("div");
      warn.className = "pzmm-warn";
      warn.textContent = "No Mod ID declared in this item's description.";
      body.appendChild(warn);
    } else if (mod.names.length === 1) {
      const meta2 = document.createElement("div");
      meta2.className = "pzmm-meta";
      meta2.textContent = `Mod ID: ${mod.names[0]}`;
      body.appendChild(meta2);
    } else {
      const idsWrap = document.createElement("div");
      idsWrap.className = "pzmm-ids";
      mod.names.forEach((name, idx) => {
        const optId = `pzmm-${mod.publishedfileid}-${idx}`;
        const wrap = document.createElement("div");
        wrap.className = "pzmm-id-option";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.id = optId;
        radio.name = `pzmm-mod-${mod.publishedfileid}`;
        radio.checked = idx === mod.selected;
        radio.addEventListener("change", () => {
          mod.selected = idx;
          onChange();
        });
        const label = document.createElement("label");
        label.htmlFor = optId;
        label.textContent = name;
        wrap.appendChild(radio);
        wrap.appendChild(label);
        idsWrap.appendChild(wrap);
      });
      body.appendChild(idsWrap);
    }

    row.appendChild(body);
    return row;
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "pzmm-panel";

    const header = document.createElement("div");
    header.id = "pzmm-header";
    const h2 = document.createElement("h2");
    h2.textContent = "PZ Workshop → Mod Converter";
    const closeBtn = document.createElement("button");
    closeBtn.id = "pzmm-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => panel.remove());
    header.appendChild(h2);
    header.appendChild(closeBtn);

    const status = document.createElement("div");
    status.id = "pzmm-status";
    status.textContent = "Loading collection…";

    const list = document.createElement("div");
    list.id = "pzmm-list";

    const footer = document.createElement("div");
    footer.id = "pzmm-footer";

    panel.appendChild(header);
    panel.appendChild(status);
    panel.appendChild(list);
    panel.appendChild(footer);
    document.body.appendChild(panel);

    return { panel, status, list, footer };
  }

  function renderFooter(footer, mods) {
    footer.innerHTML = "";
    const out = buildOutput(mods);
    footer.appendChild(renderOutputRow("WorkshopItems", out.workshopItems));
    footer.appendChild(renderOutputRow("Mods", out.mods));
    footer.appendChild(renderOutputRow("ModList", out.modList));
  }

  async function openPanel() {
    const existing = document.getElementById("pzmm-panel");
    if (existing) existing.remove();

    const { status, list, footer } = buildPanel();

    try {
      const mods = await fetchAndParseCollection((done, total) => {
        status.textContent = `Fetching mod details… ${done}/${total}`;
      });

      if (mods.length === 0) {
        status.textContent = "No items found in this collection.";
        return;
      }

      status.textContent = `${mods.length} item${mods.length === 1 ? "" : "s"} loaded.`;

      const rerender = () => renderFooter(footer, mods);
      mods.forEach((mod) => list.appendChild(renderModRow(mod, rerender)));
      renderFooter(footer, mods);
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    }
  }

  function addLauncher() {
    if (document.getElementById("pzmm-launcher")) return;
    const btn = document.createElement("button");
    btn.id = "pzmm-launcher";
    btn.textContent = "PZ Mod Converter";
    btn.addEventListener("click", openPanel);
    document.body.appendChild(btn);
  }

  injectStyle();
  addLauncher();
})();
