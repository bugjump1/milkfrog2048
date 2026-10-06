/*
 * 奶蛙主题皮肤：每一局为 2,4,8…2048（含 >2048 的 super）共 12 个数字各分配一张素材图。
 * 规则（详见 README「奶蛙主题」一节）：
 *   1. 同一局内：相同数字永远用同一张图；不同数字不共用素材
 *   2. 每局开始重新随机轮换
 *   3. 每个素材文件夹每局最多引用 4 张（emotes 每局必须被用上，所以每个文件夹至少 1 张）
 *   4. 同一文件夹的素材不能落在相邻数字上（相邻指 2/4、4/8 这样的连续数值）
 * 实现思路：把 12 个数字看成一条链，给每个槽位选一个文件夹（染色），
 * 要求相邻槽位颜色不同且各颜色数量在 1..cap 内；再在文件夹内部随机抽图对号入座。
 */
(function () {
  'use strict';

  var THEME_ID = 'milkfrog';
  var VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 'super'];
  var MAX_PER_FOLDER = 4;
  var TRY_LIMIT = 3000;

  var folders = (window.SKIN_MANIFEST || []).filter(function (f) {
    return f && f.images && f.images.length;
  });
  var assignment = null;  // Map: 数字 -> 素材路径
  var currentTheme = null;

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 生成 folders 序列：相邻槽位不同文件夹，每个文件夹出现 1..cap 次
  function pickFolderSeq(caps) {
    var n = VALUES.length;
    for (var attempt = 0; attempt < TRY_LIMIT; attempt++) {
      var seq = [];
      var counts = folders.map(function () { return 0; });
      var ok = true;
      for (var i = 0; i < n; i++) {
        var cand = [];
        for (var f = 0; f < folders.length; f++) {
          if (i > 0 && seq[i - 1] === f) continue;   // 相邻不同文件夹
          if (counts[f] >= caps[f]) continue;        // 不超过文件夹上限
          cand.push(f);
        }
        if (!cand.length) { ok = false; break; }
        var pick = cand[Math.floor(Math.random() * cand.length)];
        seq.push(pick);
        counts[pick]++;
      }
      // 每个文件夹至少 1 张（保证 emotes 每局都被用上）
      if (ok && counts.every(function (c) { return c >= 1; })) return seq;
    }
    // 兜底：轮转铺开（文件夹数 ≥3 时天然满足上限与相邻约束）
    var fallback = [];
    for (var k = 0; k < n; k++) fallback.push(k % folders.length);
    return fallback;
  }

  function reroll() {
    assignment = null;
    if (!folders.length) return;
    var caps = folders.map(function (f) {
      return Math.min(MAX_PER_FOLDER, f.images.length);
    });
    var capacity = caps.reduce(function (a, b) { return a + b; }, 0);
    if (capacity < VALUES.length) return;  // 素材不足以全覆盖，退化为纯色块

    var seq = pickFolderSeq(caps);
    var slotsByFolder = folders.map(function () { return []; });
    for (var i = 0; i < seq.length; i++) slotsByFolder[seq[i]].push(VALUES[i]);

    assignment = new Map();
    folders.forEach(function (folder, f) {
      var slots = slotsByFolder[f];
      if (!slots.length) return;
      var imgs = shuffle(folder.images).slice(0, slots.length);
      slots.forEach(function (v, idx) {
        assignment.set(v, imgs[idx]);
      });
    });
  }

  function setActive(themeId) {
    currentTheme = themeId;
    if (themeId === THEME_ID && !assignment) reroll();
  }

  function artFor(value) {
    if (currentTheme !== THEME_ID || !assignment) return null;
    return assignment.get(value > 2048 ? 'super' : value) || null;
  }

  window.Skin = {
    THEME_ID: THEME_ID,
    setActive: setActive,
    newRound: reroll,  // 每局开始时调用，重新轮换素材
    artFor: artFor,
    assignment: function () { return assignment; },
  };
})();
