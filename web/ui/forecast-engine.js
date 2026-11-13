function forecastEngine(model, overrides = {}, extended = false) {
  const memo = new Map(),
    busy = new Set();
  const original = extended
    ? forecastEngine(
        model,
        Object.fromEntries(
          Object.entries(overrides).filter(([k]) => !/[!]([S-W])\d+$/.test(k)),
        ),
        false,
      )
    : null;
  function cell(sheet, addr) {
    addr = addr.replaceAll("$", "").toUpperCase();
    if (original && !/^(?:[S-W]|A[S-W])\d+$/.test(addr))
      return original.cell(sheet, addr);
    const ext = extended && /^(?:[S-W]|A[S-W])\d+$/.test(addr);
    const key = sheet + "!" + addr;
    if (memo.has(key)) return memo.get(key);
    if (busy.has(key)) throw Error("循环引用 " + key);
    const col = addr.match(/^[A-Z]+/)[0];
    const raw = Object.hasOwn(overrides, key)
      ? overrides[key]
      : ext
        ? (model.extension[sheet]?.[addr] ?? model.cells[sheet]?.[addr])
        : model.cells[sheet]?.[addr];
    if (raw == null) return 0;
    if (typeof raw === "number" && !Number.isFinite(raw))
      throw Error("历史来源缺失");
    if (typeof raw !== "string" || !raw.startsWith("=")) return raw;
    busy.add(key);
    try {
      const result = parse(raw.slice(1), sheet);
      memo.set(key, result);
      return result;
    } finally {
      busy.delete(key);
    }
  }
  function parse(expr, sheet) {
    let pos = 0;
    const tokens = [];
    const re =
      /\s*(?:("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-z_][A-Za-z0-9_]*)!)?(\$?[A-Z]+\$?\d+)|([0-9]+(?:\.[0-9]*)?(?:[Ee][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|([+\-*/^(),:%]))/gy;
    while (pos < expr.length) {
      if (!expr.slice(pos).trim()) break;
      re.lastIndex = pos;
      const m = re.exec(expr);
      if (!m) throw Error("不支持的公式 " + expr);
      tokens.push(m);
      pos = re.lastIndex;
    }
    let i = 0;
    const peek = () => tokens[i]?.[6];
    const flatten = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
    function atom() {
      const t = tokens[i++];
      if (!t) throw Error("公式不完整");
      if (t[1]) return t[1].slice(1, -1).replaceAll('""', '"');
      if (t[4]) return +t[4];
      if (t[3]) {
        const sh = t[2] ? t[2].slice(0, -1).replace(/^'|'$/g, "") : sheet,
          addr = t[3].replaceAll("$", "");
        if (peek() === ":") {
          i++;
          const end = tokens[i++]?.[3]?.replaceAll("$", "");
          if (!end) throw Error("范围错误");
          const parts = (a) => {
              const m = a.match(/([A-Z]+)(\d+)/);
              return [
                Array.from(m[1]).reduce(
                  (v, c) => v * 26 + c.charCodeAt(0) - 64,
                  0,
                ),
                +m[2],
              ];
            },
            [a, b] = parts(addr),
            [c, d] = parts(end),
            vals = [];
          for (let r = b; r <= d; r++)
            for (let n = a; n <= c; n++) {
              let k = n,
                s = "";
              while (k) {
                k--;
                s = String.fromCharCode(65 + (k % 26)) + s;
                k = Math.floor(k / 26);
              }
              vals.push(cell(sh, s + r));
            }
          return vals;
        }
        return cell(sh, addr);
      }
      if (t[5]) {
        if (peek() !== "(") throw Error("函数错误");
        i++;
        const args = [];
        if (peek() !== ")") {
          do {
            args.push(sum());
            if (peek() !== ",") break;
            i++;
          } while (true);
        }
        if (peek() !== ")") throw Error("缺少右括号");
        i++;
        const vals = args.flatMap(flatten);
        switch (t[5].toUpperCase()) {
          case "SUM":
            return vals.reduce(
              (a, v) => a + (typeof v === "number" ? v : 0),
              0,
            );
          case "AVERAGE": {
            const ns = vals.filter((v) => typeof v === "number");
            return ns.reduce((a, v) => a + v, 0) / ns.length;
          }
          case "CONCATENATE":
            return vals.join("");
          default:
            throw Error("不支持函数 " + t[5]);
        }
      }
      if (t[6] === "(") {
        const v = sum();
        if (peek() !== ")") throw Error("缺少右括号");
        i++;
        return v;
      }
      if (t[6] === "+" || t[6] === "-") return (t[6] === "-" ? -1 : 1) * atom();
      throw Error("公式错误");
    }
    function power() {
      let v = atom();
      while (peek() === "%") {
        i++;
        v /= 100;
      }
      if (peek() === "^") {
        i++;
        v = Math.pow(v, power());
      }
      return v;
    }
    function product() {
      let v = power();
      while (["*", "/"].includes(peek())) {
        const op = peek();
        i++;
        const rhs = power();
        v = op === "*" ? v * rhs : v / rhs;
      }
      return v;
    }
    function sum() {
      let v = product();
      while (["+", "-"].includes(peek())) {
        const op = peek();
        i++;
        const rhs = product();
        v = op === "+" ? v + rhs : v - rhs;
      }
      return v;
    }
    const result = sum();
    if (i !== tokens.length) throw Error("公式尾部未处理");
    if (typeof result === "number" && !Number.isFinite(result))
      throw Error("计算结果无效（请检查分母与输入）");
    return result;
  }
  return { cell };
}
