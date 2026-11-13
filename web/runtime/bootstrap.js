(async () => {
  const status = document.getElementById("public-loading");
  try {
    const response = await fetch("release.json", { cache: "no-store" });
    if (!response.ok) throw Error("无法读取发布配置");
    const config = await response.json();
    window.PUBLIC_CONFIG = config;
    let current;
    try {
      current = await publicStore.get("current");
    } catch (error) {
      window.PUBLIC_STORAGE_ERROR = error.message;
    }
    let inputs = current?.inputs ?? config.inputs;
    if (current && current.release !== config.release) {
      status.replaceChildren();
      const message = document.createElement("p");
      message.textContent =
        "网站资料或模型已更新。下方保留你上次保存的结果；请选择是否采用新版。旧命名版本保持不变。";
      const frame = document.createElement("iframe");
      frame.title = "上次保存的个人预测（旧版只读）";
      frame.className = "version-frame";
      frame.style.height = "850px";
      frame.srcdoc = current.html;
      const choose = (text, value, resolve) => {
        const button = document.createElement("button");
        button.className = "action secondary";
        button.textContent = text;
        button.onclick = () => resolve(value);
        status.append(button);
      };
      inputs = await new Promise((resolve) => {
        status.append(message);
        choose("保留假设，用新版重新计算（未保存）", current.inputs, resolve);
        choose("采用新版网站默认预测（未保存）", config.inputs, resolve);
        status.append(frame);
      });
    }
    window.DATABASE_STATE = {
      inputs,
      revision: current?.revision || 0,
      basis: config.release,
    };
    window.PUBLIC_CURRENT = current;
    for (const name of config.scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = name;
        script.onload = resolve;
        script.onerror = () => reject(Error("资源加载失败：" + name));
        document.body.append(script);
      });
    }
    if (current?.release !== config.release && current) {
      forecastSavedInputs = "__previous_release__";
      forecastStorageMessage =
        "已按新版重新计算；尚未保存。旧保存仍保留到你明确保存。";
      forecastStorageStatus();
    }
    if (!current) {
      forecastStorageMessage = window.PUBLIC_STORAGE_ERROR
        ? "浏览器存储不可用；可以试算，但不能保存。"
        : "网站默认预测；点击保存后仅写入当前浏览器。";
      forecastStorageStatus();
    }
    status.remove();
  } catch (error) {
    status.textContent =
      "网页未能启动：" + error.message + "。请刷新重试；不要清除网站数据。";
  }
})();
