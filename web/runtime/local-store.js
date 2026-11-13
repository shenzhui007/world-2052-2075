// Browser-only persistence. A transaction must commit before any UI claims success.
window.publicStore = (() => {
  let db;
  const ready = new Promise((resolve, reject) => {
    const request = indexedDB.open("2052-public-personal", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("records", { keyPath: "id" });
    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => db.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("请关闭其他旧版网页后重试。"));
  });
  async function run(mode, action) {
    await ready;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("records", mode);
      let value;
      const request = action(transaction.objectStore("records"));
      request.onsuccess = () => {
        value = request.result;
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error || request.error || Error("浏览器存储失败"));
    });
  }
  return {
    get: (id) => run("readonly", (s) => s.get(id)),
    all: () => run("readonly", (s) => s.getAll()),
    put: (value) => run("readwrite", (s) => s.put(value)),
    remove: (id) => run("readwrite", (s) => s.delete(id)),
    async commitCurrent(value, revision) {
      await ready;
      return new Promise((resolve, reject) => {
        const tx = db.transaction("records", "readwrite"),
          store = tx.objectStore("records");
        let conflict = false;
        const read = store.get("current");
        read.onsuccess = () => {
          if ((read.result?.revision || 0) !== revision) {
            conflict = true;
            tx.abort();
          } else store.put(value);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () =>
          reject(
            Error(
              conflict
                ? "其他页面已保存预测，请另开页面核对；当前草稿仍保留。"
                : "本地保存失败，可能空间不足或浏览器禁用了存储。",
            ),
          );
      });
    },
  };
})();
