/**
 * 过滤 JSONPath 结果:数字键名("1","2"…)会同时匹配对象属性和数组索引。
 * 调用方全部用 resultType:"all" 查询,节点自带 parent —— Array.isArray(parent)
 * 即可【精确】区分数组索引与对象属性,无需启发式。旧版按"父键名暗示数组
 * (content/items/list/data/…)"的子串启发式判断,把 {"data":{"1":"Alice"}}
 * 这类 ID-map 的真实对象属性误杀成数组索引(报 invalidPathKey),又把
 * 不在名单内的父键(rows)下的真数组索引漏过去当属性编辑。
 */

const NUMERIC_KEY_REGEX = /^\d+$/;

export const filterObjectPropertyMatches = <T extends { parent: unknown }>(results: T[], keyName: string): T[] => {
  // 末段非纯数字时对象属性与数组索引不可能混淆,原样返回。
  // 点分 key("en.prompt")取末段判断 —— JSONPath 匹配的叶节点键是末段。
  const lastSegment = keyName.split(".").pop() ?? keyName;
  if (!NUMERIC_KEY_REGEX.test(lastSegment)) return results;
  return results.filter((result) => !Array.isArray(result.parent));
};

/**
 * 按【顶层】逗号(半角/全角)拆分用户输入的多路径串。方括号内的逗号是
 * JSONPath 合法的 bracket union($.book[0,1].title / tags[0,2]),naive 的
 * split(/,|，/) 会把 union 劈成 "tags[0" + "2]" —— jsonpath-plus 静默容忍
 * 畸形片段,结果只命中一半节点还报成功。JSONTranslator nodeKeys 与
 * JSONNodeEdit 共用。
 */
export const splitTopLevelCommas = (s: string): string[] => {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === "，") && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
};

// 把映射 key("prompt"、"en.prompt"、"en[0].x"、"items[*].en")拆成有序段
// 列表:点分段 + 括号段按出现位置展开("en[0].x" → ["en","[0]","x"])。
const keySegments = (key: string): string[] =>
  key.split(".").flatMap((part) => {
    if (!part) return [];
    const brackets: string[] = [];
    const bare = part.replace(/\[[^\]]*\]/g, (m) => {
      brackets.push(m);
      return "";
    });
    return bare ? [bare, ...brackets] : brackets;
  });

const stripTrailingSegments = (path: string, count: number): string => {
  let out = path;
  for (let i = 0; i < count; i++) {
    out = out.replace(/\[[^[\]]*\]$/, "");
  }
  return out;
};

/**
 * 结构化配对的祖先路径函数对(json-value-transformer / JSONTranslator
 * keyMapping 的 input/output 同记录配对)。
 *
 * 剥多少段?只剥两个 key【公共前缀之后】的差异后缀段:
 *   - 只剥一段(最初实现)会让 "en.prompt"→"ar.prompt" 得到 $[0]['en'] vs
 *     $[0]['ar'],永不相等 → 配对数 0,transformer 预设整体空转;
 *   - 按 key 全段数剥(上一版修复)会把 "items[*].en"→"items[*].ar" 的
 *     通配段也剥掉 —— [*] 匹配出的下标【就是记录身份】,全剥后所有记录
 *     坍缩到 $,Map 只剩最后一个节点,静默跨记录错配。
 * 公共前缀(含通配段)保留、差异后缀剥除,两类输入都正确。
 */
export const pairingAncestors = (inputKey: string, outputKey: string): { input: (path: string) => string; output: (path: string) => string } => {
  const inSegs = keySegments(inputKey);
  const outSegs = keySegments(outputKey);
  let common = 0;
  while (common < inSegs.length && common < outSegs.length && inSegs[common] === outSegs[common]) common++;
  const inStrip = inSegs.length - common;
  const outStrip = outSegs.length - common;
  return {
    input: (path: string) => stripTrailingSegments(path, inStrip),
    output: (path: string) => stripTrailingSegments(path, outStrip),
  };
};
