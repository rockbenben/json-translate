/**
 * 过滤 JSONPath 结果:数字键名("1","2"…)会同时匹配对象属性和数组索引,
 * 此函数用启发式剔除"父键名暗示数组(content/items/list/…)"的索引匹配,
 * 保留真正的对象属性匹配。
 */

const NUMERIC_KEY_REGEX = /^\d+$/;
const SEGMENT_MATCH_REGEX = /\[[^\]]+\]/g;
const STRING_KEY_CONTEXT_REGEX = /\['[^']*'\]/;
const STRING_KEY_EXTRACT_REGEX = /\['([^']*)'\]/;
const ARRAY_LIKE_KEYS = new Set(["content", "items", "list", "array", "data"]);

export const filterObjectPropertyMatches = <T extends { path: string }>(results: T[], keyName: string): T[] => {
  if (!NUMERIC_KEY_REGEX.test(keyName)) return results;

  const targetSegmentBracket = `[${keyName}]`;
  const targetSegmentSingleQuote = `['${keyName}']`;
  const targetSegmentDoubleQuote = `["${keyName}"]`;

  return results.filter((result) => {
    const segments = result.path.match(SEGMENT_MATCH_REGEX) || [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment !== targetSegmentBracket && segment !== targetSegmentSingleQuote && segment !== targetSegmentDoubleQuote) continue;

      // Root-level numeric key → object property, keep.
      if (i === 0) return true;

      // Numeric key right after a string key whose name hints at array
      // (parent.items[0]) → almost certainly an array index, drop.
      const prevSegment = segments[i - 1];
      if (STRING_KEY_CONTEXT_REGEX.test(prevSegment)) {
        const prevKeyName = prevSegment.match(STRING_KEY_EXTRACT_REGEX)?.[1];
        if (prevKeyName) {
          const lowerPrevKey = prevKeyName.toLowerCase();
          const isArrayLikeKey = Array.from(ARRAY_LIKE_KEYS).some((arrayKey) => lowerPrevKey.includes(arrayKey));
          if (isArrayLikeKey) return false;
        }
      }
    }
    return true;
  });
};
