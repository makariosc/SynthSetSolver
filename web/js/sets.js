// Set finding over classified cards.
//
// Each card carries attribute *indices* (0..2) for number, color, shape,
// shading. Three cards form a set when, for every attribute, they are all the
// same or all different; with values in {0,1,2} that is exactly
// (a + b + c) % 3 === 0.

export const ATTR_KEYS = ["number", "color", "shape", "shading"];

export function isSet(a, b, c) {
  return ATTR_KEYS.every((k) => (a.idx[k] + b.idx[k] + c.idx[k]) % 3 === 0);
}

/**
 * All sets among `cards` (objects with `idx` and `id`), as arrays of 3 ids.
 * Each set also reports `uncertain` if any of its cards is uncertain.
 */
export function findSets(cards) {
  const sets = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      for (let k = j + 1; k < cards.length; k++)
        if (isSet(cards[i], cards[j], cards[k]))
          sets.push({
            ids: [cards[i].id, cards[j].id, cards[k].id],
            uncertain: cards[i].uncertain || cards[j].uncertain || cards[k].uncertain,
          });
  return sets;
}

/** The card that would complete a set with a and b (attribute indices). */
export function completeSet(a, b) {
  const idx = {};
  for (const k of ATTR_KEYS) idx[k] = (6 - a.idx[k] - b.idx[k]) % 3;
  return idx;
}

/**
 * All ultrasets among `cards`: four cards split into two pairs that both need
 * the same third card (which needn't be on the table) to make a set. As
 * { ids: [a, b, c, d], pairs: [[a, b], [c, d]], ghost: idx of the shared third
 * card, uncertain }. A group of four can only pair up one way, so each
 * ultraset appears once.
 */
export function findUltrasets(cards) {
  const byGhost = new Map();  // completing card as a base-3 number -> pairs needing it
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const ghost = completeSet(cards[i], cards[j]);
      const key = ATTR_KEYS.reduce((n, k) => n * 3 + ghost[k], 0);
      if (!byGhost.has(key)) byGhost.set(key, { ghost, pairs: [] });
      byGhost.get(key).pairs.push([cards[i], cards[j]]);
    }
  const out = [];
  for (const { ghost, pairs } of byGhost.values())
    for (let p = 0; p < pairs.length; p++)
      for (let q = p + 1; q < pairs.length; q++) {
        // pairs completing to the same card never share a card (a+b = a+c means b = c)
        const four = [...pairs[p], ...pairs[q]];
        out.push({
          ids: four.map((c) => c.id),
          pairs: [pairs[p].map((c) => c.id), pairs[q].map((c) => c.id)],
          ghost,
          uncertain: four.some((c) => c.uncertain),
        });
      }
  return out;
}
