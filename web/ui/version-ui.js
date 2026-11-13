// Whole-model version retention. Archive documents never fetch or write current data.
function versionTime(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts + "." + String(date.getUTCMilliseconds()).padStart(3, "0");
}
function versionLabel(version) {
  if (version.name)
    return (
      version.name +
      (version.savedAt ? " · " + versionTime(version.savedAt) : "")
    );
  return version.kind === "author"
    ? "作者预测（原始表至2050）"
    : versionTime(version.savedAt);
}
if (forecastArchiveState()) {
  // This observer reports layout only; numerical data and calculation code stay frozen.
  const notify = () => {
    if (window.parent !== window)
      window.parent.postMessage(
        {
          type: "2052-archive-height",
          height: Math.ceil(document.body.getBoundingClientRect().height) + 4,
        },
        location.origin === "null"
          ? window.parent.location.origin
          : location.origin,
      );
  };
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(notify).observe(document.body);
  window.addEventListener("load", notify);
  requestAnimationFrame(notify);
} else {
  const versionBar = document.createElement("section");
  versionBar.className = "version-bar";
  versionBar.innerHTML =
    '<label>预测版本<select id="forecast-version-select"><option value="current">当前预测（可编辑）</option></select></label><div class="version-actions"><button type="button" class="action secondary" id="forecast-version-save">保存为版本</button><button type="button" class="action secondary" id="forecast-version-return" hidden>返回当前预测</button></div><p id="forecast-version-status" role="status"></p>';
  graphGallery.before(versionBar);
  const select = versionBar.querySelector("select"),
    save = versionBar.querySelector("#forecast-version-save"),
    back = versionBar.querySelector("#forecast-version-return"),
    status = versionBar.querySelector("[role=status]");
  const viewer = document.createElement("section");
  viewer.className = "version-viewer";
  viewer.hidden = true;
  versionBar.after(viewer);
  const help = document.createElement("p");
  help.className = "version-help";
  versionBar.append(help);
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "action secondary";
  retry.hidden = true;
  versionBar.querySelector(".version-actions").append(retry);
  let localNameInput;
  if (window.PUBLIC_LOCAL) {
    const label = document.createElement("label");
    label.textContent = "个人版本名称";
    localNameInput = document.createElement("input");
    localNameInput.type = "text";
    localNameInput.maxLength = 80;
    localNameInput.placeholder = "例如：较低出生率情景";
    localNameInput.dataset.suggestedName =
      "我的预测 " + versionTime(new Date().toISOString());
    localNameInput.value =
      window.PUBLIC_LANGUAGE?.text(localNameInput.dataset.suggestedName) ||
      localNameInput.dataset.suggestedName;
    localNameInput.addEventListener("input", () => {
      delete localNameInput.dataset.suggestedName;
    });
    label.append(localNameInput);
    versionBar.querySelector(".version-actions").before(label);
  }
  const updateHelp = () => {
    help.hidden = selectedVersion !== "current";
    if (localNameInput)
      localNameInput.parentElement.hidden = selectedVersion !== "current";
    help.textContent =
      "保存为版本：留存全部地区、15图的只读快照；不替代下方的保存预测。" +
      (forecastHasUnsavedChanges() ? " 当前有未保存修改。" : "") +
      (window.PUBLIC_LOCAL ? " 仅存当前浏览器，不上传。" : "");
    save.disabled = !forecastDatabase || !listReady || forecastSaving || saving;
  };
  window.addEventListener("2052-draft-status", updateHelp);
  let versions = [],
    saving = false,
    selectedVersion = "current",
    listReady = false,
    pendingRetention = null,
    archiveLoadTimer;
  updateHelp();
  const listFailed = (error) => {
    listReady = false;
    updateHelp();
    status.textContent =
      (window.PUBLIC_LOCAL
        ? "本地版本列表读取失败；草稿仍保留，请检查浏览器存储权限后重试。"
        : "版本列表读取失败；当前草稿仍保留。请检查服务后重试。") +
      error.message;
    retry.textContent = "重试读取版本";
    retry.hidden = false;
    retry.onclick = async () => {
      retry.disabled = true;
      try {
        await refreshList();
        retry.hidden = true;
        status.textContent = "版本列表已更新。";
      } catch (e) {
        listFailed(e);
      } finally {
        retry.disabled = false;
      }
    };
  };
  let restoreVersion = "current";
  try {
    restoreVersion =
      sessionStorage.getItem("2052-selected-version") || "current";
  } catch {}
  if (restoreVersion !== "current") {
    graphGallery.hidden = true;
    viewer.hidden = false;
    viewer.textContent = "正在读取留存版本…";
  }
  function remember(value) {
    try {
      sessionStorage.setItem("2052-selected-version", value);
    } catch {}
  }
  function retainArchiveView() {
    const doc = viewer.querySelector("iframe")?.contentDocument;
    const regionSelect = doc?.querySelector("#graphs-region"),
      graphSelect = doc?.querySelector("#graphs-select");
    if (!graphSelect) return;
    const nextGraph = Number(graphSelect.value);
    if (nextGraph >= 1 && nextGraph <= 15) activeForecastGraph = nextGraph;
    // Graph10 temporarily displays global data; retain the underlying regional selection.
    if (
      regionSelect &&
      !regionSelect.disabled &&
      Object.hasOwn(names, regionSelect.value)
    )
      region = regionSelect.value;
    compare = new Set([region]);
    save2052View();
  }
  function switchVersion(identifier) {
    if (identifier !== "current" && !forecastCanNavigate()) {
      select.value = selectedVersion;
      return;
    }
    const version = versions.find((v) => v.id === identifier);
    if (identifier !== "current" && !version) {
      select.value = selectedVersion;
      return;
    }
    retainArchiveView();
    clearTimeout(archiveLoadTimer);
    selectedVersion = identifier;
    select.value = identifier;
    remember(identifier);
    const archived = identifier !== "current";
    retry.hidden = true;
    updateHelp();
    graphGallery.hidden = archived;
    viewer.hidden = !archived;
    save.hidden = archived;
    back.hidden = !archived;
    if (!archived) {
      viewer.replaceChildren();
      drawWorkbookGraphs();
      status.textContent = "";
      forecastStorageStatus();
      return;
    }
    status.textContent = "正在读取留存版本…";
    const frame = document.createElement("iframe");
    frame.className = "version-frame";
    frame.title = versionLabel(version) + " · 只读";
    const loadFailed = () => {
      if (viewer.querySelector("iframe") !== frame) return;
      clearTimeout(archiveLoadTimer);
      viewer.textContent = "留存版本未能打开。可以重试，或返回当前预测。";
      status.textContent = "版本读取失败；当前草稿仍保留。";
      retry.textContent = "重试打开版本";
      retry.hidden = false;
      retry.onclick = () => switchVersion(identifier);
    };
    frame.addEventListener("load", () => {
      if (window.PUBLIC_LOCAL && !frame.srcdoc) return;
      if (viewer.querySelector("iframe") !== frame) return;
      clearTimeout(archiveLoadTimer);
      if (!frame.contentDocument?.querySelector("#workbook-graphs svg")) {
        loadFailed();
        return;
      }
      status.textContent = "完整留存 · 至" + version.endYear + "年 · 只读";
      // Delegation survives selector replacement when the archived chart redraws.
      frame.contentDocument?.addEventListener("change", (event) => {
        if (event.target.matches("#graphs-region,#graphs-select"))
          retainArchiveView();
      });
    });
    frame.addEventListener("error", loadFailed);
    if (window.PUBLIC_LOCAL) {
      window.PUBLIC_LOCAL.openVersion(
        identifier,
        frame,
        region,
        activeForecastGraph,
      ).catch(loadFailed);
    } else
      frame.src =
        "/api/versions/" +
        encodeURIComponent(identifier) +
        "/view?region=" +
        encodeURIComponent(region) +
        "&graph=" +
        activeForecastGraph;
    viewer.replaceChildren(frame);
    archiveLoadTimer = setTimeout(loadFailed, 20000);
  }
  async function refreshList() {
    if (!forecastDatabase) {
      save.disabled = true;
      status.textContent = "版本留存需使用本地数据库服务。";
      return;
    }
    const response = await forecastRequestJSON("/api/versions");
    if (!response.ok) throw Error("无法读取预测版本");
    versions = response.data.versions;
    select.replaceChildren(
      new Option("当前预测（可编辑）", "current"),
      ...versions.map((v) => {
        const option = new Option(versionLabel(v), v.id);
        if (window.PUBLIC_LANGUAGE && !v.public)
          option.dataset.userContent = "";
        return option;
      }),
    );
    select.value = selectedVersion;
    listReady = true;
    updateHelp();
  }
  select.onchange = () => switchVersion(select.value);
  back.onclick = () => switchVersion("current");
  save.onclick = async () => {
    if (saving || forecastSaving || forecastArchiveState()) return;
    // Explicit retention includes the user's current draft, but never replaces everyday saves.
    const focused = document.activeElement;
    if (
      forecastPanel.contains(focused) &&
      focused.matches("[data-forecast-cell]")
    )
      focused.blur();
    if (!forecastCanNavigate()) return;
    const inputs = { ...forecastOverrides },
      serialized = forecastCanonical(inputs);
    const fingerprint = JSON.stringify([
      serialized,
      forecastDatabaseRevision,
      forecastDatabase.basis,
    ]);
    if (pendingRetention?.fingerprint !== fingerprint) {
      const requestId =
        window.crypto?.randomUUID?.().replaceAll("-", "") ||
        Array.from({ length: 32 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join("");
      pendingRetention = { fingerprint, requestId };
    }
    let localName;
    if (window.PUBLIC_LOCAL) {
      localName = localNameInput.value.trim();
      if (!localName || localName.length > 80) {
        status.textContent = "名称需为1—80个字符。";
        return;
      }
    }
    let createdVersion = null,
      responseStatus = 0;
    retry.hidden = true;
    saving = true;
    forecastRetentionPending = true;
    forecastStorageStatus();
    save.disabled = true;
    select.disabled = true;
    status.textContent = "正在留存整体预测…";
    try {
      const response = await forecastRequestJSON(
        "/api/versions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs,
            name: localName,
            revision: forecastDatabaseRevision,
            basis: forecastDatabase.basis,
            requestId: pendingRetention.requestId,
          }),
        },
        90000,
      );
      responseStatus = response.status;
      const result = response.data;
      if (!response.ok) throw Error(result.error || "留存失败");
      createdVersion = result.version;
      pendingRetention = null;
      await refreshList();
      status.textContent =
        "已留存：" +
        versionLabel(result.version) +
        (serialized !== forecastCanonical(forecastOverrides)
          ? "；后续修改尚未留存。"
          : forecastHasUnsavedChanges()
            ? "；日常修改尚未保存。"
            : "");
    } catch (error) {
      if (createdVersion) {
        listFailed(error);
        status.textContent =
          "版本已留存，但列表更新失败。请重试读取列表；当前草稿仍保留。";
      } else if (responseStatus === 409) {
        status.textContent =
          "留存冲突：" +
          error.message +
          " 当前草稿仍保留。请另开页面核对已保存内容；刷新本页会丢失未保存草稿。";
      } else if (responseStatus >= 400 && responseStatus < 500) {
        status.textContent =
          "留存未完成：" + error.message + " 当前草稿仍保留，请核对后再试。";
      } else {
        status.textContent =
          (window.PUBLIC_LOCAL
            ? "本地留存失败；草稿仍保留，请检查存储权限或可用空间后重试。"
            : "留存失败；当前草稿仍保留。请检查本地服务后重试。") +
          error.message;
        retry.textContent = "重试留存";
        retry.hidden = false;
        retry.onclick = () => save.click();
      }
    } finally {
      saving = false;
      forecastRetentionPending = false;
      forecastStorageStatus();
      updateHelp();
      select.disabled = false;
    }
  };
  window.addEventListener("message", (event) => {
    const frame = viewer.querySelector("iframe");
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      event.origin !== location.origin ||
      event.data?.type !== "2052-archive-height"
    )
      return;
    const height = event.data.height;
    if (Number.isFinite(height) && height >= 100 && height <= 20000)
      frame.style.height = height + "px";
  });
  if (window.PUBLIC_LOCAL) {
    const remove = document.createElement("button");
    remove.className = "action secondary";
    remove.textContent = "删除所选个人版本";
    versionBar.querySelector(".version-actions").append(remove);
    let deleteCandidate = null;
    select.addEventListener("change", () => {
      deleteCandidate = null;
      remove.textContent = "删除所选个人版本";
    });
    remove.onclick = async () => {
      const chosen = versions.find((v) => v.id === selectedVersion);
      if (!chosen || chosen.public) {
        status.textContent = "请选择自己的本地版本；公共基准不能删除。";
        return;
      }
      if (deleteCandidate !== chosen.id) {
        deleteCandidate = chosen.id;
        remove.textContent = "确认删除此版本";
        status.textContent =
          "再次点击确认删除“" +
          versionLabel(chosen) +
          "”；无法撤销。切换版本可取消。";
        return;
      }
      try {
        await window.PUBLIC_LOCAL.remove(chosen.id);
        switchVersion("current");
        await refreshList();
        deleteCandidate = null;
        remove.textContent = "删除所选个人版本";
        status.textContent = "已删除个人版本。";
      } catch (error) {
        status.textContent = "删除失败：" + error.message;
      }
    };
  }
  refreshList()
    .then(() => {
      if (restoreVersion !== "current") {
        if (versions.some((v) => v.id === restoreVersion))
          switchVersion(restoreVersion);
        else {
          switchVersion("current");
          status.textContent = "上次查看的版本不可用，已返回当前预测。";
        }
      }
    })
    .catch((error) => {
      switchVersion("current");
      listFailed(error);
      save.disabled = true;
    });
}
