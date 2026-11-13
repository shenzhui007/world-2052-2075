// Presentation-only localization: model data, input values and numerical results are untouched.
(function installLanguage() {
  const terminology = window.PUBLIC_TERMS || {};
  const author = window.FORECAST_ARCHIVE?.kind === "author";
  const dictionary = {
    ...(window.PUBLIC_ENGLISH || {}),
    ...(terminology.shared || {}),
    ...(terminology[author ? "author" : "updated"] || {}),
  };
  const authorChineseKeys = Object.keys(terminology.authorChinese || {}).sort(
    (a, b) => b.length - a.length,
  );
  const rawText = new WeakMap(),
    rawAttributes = new WeakMap();
  let lang = "zh",
    pairs = [],
    pattern,
    scanPending = false;
  const ownNames = new Set();
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function refreshDictionary() {
    if (typeof UI_ZH !== "undefined") {
      for (const [english, chinese] of Object.entries(UI_ZH))
        if (!Object.hasOwn(dictionary, chinese)) dictionary[chinese] = english;
    }
    const keys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    if (pairs.length !== keys.length) {
      pairs = keys;
      pattern = new RegExp(keys.map(escape).join("|"), "g");
    }
  }
  function translate(value) {
    refreshDictionary();
    const title = String(value).replace(
      /^(Graph\s+(\d+)\s*[.·]\s*)([^·\n]*)(.*)$/,
      (whole, prefix, number, label, suffix) =>
        terminology.graphTitles?.[number] && /[\u4e00-\u9fff]/.test(label)
          ? prefix +
            terminology.graphTitles[number] +
            (suffix ? " " + suffix : "")
          : whole,
    );
    return title.replace(pattern, (match) => dictionary[match]);
  }
  function translated(value, element) {
    if (lang !== "en") {
      if (!author || !authorChineseKeys.length) return value;
      const authorPattern = new RegExp(
        authorChineseKeys.map(escape).join("|"),
        "g",
      );
      return String(value).replace(
        authorPattern,
        (match) => terminology.authorChinese[match],
      );
    }
    if (element?.closest("[data-user-content]")) return value;
    if (
      element?.closest("#forecast-version-status") ||
      element?.tagName === "IFRAME"
    ) {
      const names = [...ownNames].sort((a, b) => b.length - a.length);
      if (names.length) {
        const namePattern = new RegExp(
          "(" + names.map(escape).join("|") + ")",
          "g",
        );
        return value
          .split(namePattern)
          .map((part) => (ownNames.has(part) ? part : translate(part)))
          .join("");
      }
    }
    return translate(value);
  }
  function scan() {
    scanPending = false;
    observer.disconnect();
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      const element = node.parentElement;
      if (
        !element ||
        element.closest(
          "script,style,textarea,template,[data-language-control],[data-user-content]",
        )
      )
        continue;
      const old = rawText.get(node);
      const source = old && old.output === node.data ? old.source : node.data;
      const output = translated(source, element);
      if (node.data !== output) node.data = output;
      rawText.set(node, { source, output });
    }
    for (const element of document.querySelectorAll(
      "[aria-label],[title],[placeholder]",
    )) {
      if (element.closest("[data-language-control],[data-user-content]"))
        continue;
      const record = rawAttributes.get(element) || {};
      for (const key of ["aria-label", "title", "placeholder"]) {
        if (!element.hasAttribute(key)) continue;
        const value = element.getAttribute(key),
          old = record[key];
        const source = old && old.output === value ? old.source : value;
        const output = translated(source, element);
        if (value !== output) element.setAttribute(key, output);
        record[key] = { source, output };
      }
      rawAttributes.set(element, record);
    }
    for (const button of document.querySelectorAll(
      "button[data-language-value]",
    )) {
      const selected = button.dataset.languageValue === lang;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-selected", selected);
    }
    for (const input of document.querySelectorAll("input[data-suggested-name]"))
      input.value =
        lang === "en"
          ? translate(input.dataset.suggestedName)
          : input.dataset.suggestedName;
    for (const input of document.querySelectorAll(
      "input[data-validation-source]",
    ))
      input.setCustomValidity(
        lang === "en"
          ? translate(input.dataset.validationSource)
          : input.dataset.validationSource,
      );
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        if (frame.contentWindow?.PUBLIC_LANGUAGE)
          frame.contentWindow.PUBLIC_LANGUAGE.set(lang, false);
        else if (frame.contentDocument?.querySelector("svg")) {
          const script = frame.contentDocument.createElement("script");
          script.textContent =
            "window.PUBLIC_ENGLISH=" +
            JSON.stringify(dictionary).replaceAll("<", "\\u003c") +
            ";window.PUBLIC_TERMS=" +
            JSON.stringify(terminology).replaceAll("<", "\\u003c") +
            ";(" +
            installLanguage.toString() +
            ")();";
          frame.contentDocument.body.append(script);
        }
      } catch {}
    }
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "placeholder"],
    });
  }
  function queue() {
    if (scanPending) return;
    scanPending = true;
    queueMicrotask(scan);
  }
  const observer = new MutationObserver(queue);
  function guideLanguage() {
    const chinese = document.getElementById("guide-zh"),
      english = document.getElementById("guide-en");
    if (chinese && english) {
      chinese.hidden = lang !== "zh";
      english.hidden = lang !== "en";
    }
  }
  function set(value, persist = true) {
    lang = value === "en" ? "en" : "zh";
    if (persist)
      try {
        localStorage.setItem("2052-language", lang);
      } catch {}
    guideLanguage();
    scan();
  }
  window.PUBLIC_LANGUAGE = {
    set,
    text: (value) => (lang === "en" ? translate(value) : value),
    protectName: (value) => {
      if (typeof value === "string" && value) ownNames.add(value);
    },
    get current() {
      return lang;
    },
  };
  try {
    lang = localStorage.getItem("2052-language") === "en" ? "en" : "zh";
  } catch {}
  // The top-level control also switches self-contained archived frames.
  if (window.parent !== window)
    try {
      lang = window.parent.PUBLIC_LANGUAGE?.current || lang;
    } catch {}
  if (window.parent === window) {
    const control = document.createElement("div");
    control.className = "language-switch";
    control.dataset.languageControl = "";
    control.setAttribute("role", "group");
    control.setAttribute("aria-label", "语言 / Language");
    for (const [value, label] of [
      ["zh", "中文"],
      ["en", "English"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "language-toggle";
      button.dataset.languageValue = value;
      button.textContent = label;
      button.setAttribute("lang", value === "zh" ? "zh-CN" : "en");
      button.onclick = () => set(value);
      control.append(button);
    }
    const host =
      document.querySelector("header") || document.querySelector("main");
    if (host?.tagName === "HEADER") {
      const nav = document.createElement("nav");
      const guide = host.querySelector("a");
      if (guide) nav.append(guide);
      nav.append(control);
      host.append(nav);
    } else host?.prepend(control);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === "2052-language") set(event.newValue, false);
  });
  window.addEventListener("load", () => {
    guideLanguage();
    queue();
  });
  document.addEventListener(
    "load",
    (event) => {
      if (event.target.tagName === "IFRAME") queue();
    },
    true,
  );
  guideLanguage();
  scan();
})();
