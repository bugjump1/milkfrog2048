/*
 * 2048 核心游戏逻辑（无 DOM 依赖，可独立测试）。
 * 每次操作返回一组事件 { moves, merges, spawns, gained, moved, won, over }，
 * 由渲染层据此更新画面。
 */
(function () {
  'use strict';

  var VECTORS = {
    up:    { dr: -1, dc: 0 },
    down:  { dr: 1,  dc: 0 },
    left:  { dr: 0,  dc: -1 },
    right: { dr: 0,  dc: 1 },
  };

  function create(size) {
    size = size || 4;
    var nextId = 1;
    var grid;   // grid[r][c] = 方块 id 或 null
    var tiles;  // Map<id, {id, value, row, col}>
    var score;
    var won;
    var over;

    function reset() {
      grid = [];
      for (var r = 0; r < size; r++) {
        grid.push(new Array(size).fill(null));
      }
      tiles = new Map();
      score = 0;
      won = false;
      over = false;
    }

    function spawnTile(ev) {
      var empty = [];
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (grid[r][c] === null) empty.push([r, c]);
        }
      }
      if (!empty.length) return;
      var cell = empty[Math.floor(Math.random() * empty.length)];
      var tile = {
        id: nextId++,
        value: Math.random() < 0.9 ? 2 : 4,
        row: cell[0],
        col: cell[1],
      };
      tiles.set(tile.id, tile);
      grid[tile.row][tile.col] = tile.id;
      ev.spawns.push({ id: tile.id, value: tile.value, row: tile.row, col: tile.col });
    }

    function hasMoves() {
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          if (grid[r][c] === null) return true;
          var v = tiles.get(grid[r][c]).value;
          if (r + 1 < size && grid[r + 1][c] !== null && tiles.get(grid[r + 1][c]).value === v) return true;
          if (c + 1 < size && grid[r][c + 1] !== null && tiles.get(grid[r][c + 1]).value === v) return true;
        }
      }
      return false;
    }

    function move(dir) {
      if (over) return null;
      var vec = VECTORS[dir];
      if (!vec) return null;

      var ev = { moves: [], merges: [], spawns: [], gained: 0, moved: false, won: false, over: false };
      // 本回合内由合并产生的方块不能再参与合并
      var merged = new Set();

      // 从移动目标一侧开始遍历，保证先处理最靠前的方块
      var rows = [], cols = [];
      for (var i = 0; i < size; i++) { rows.push(i); cols.push(i); }
      if (vec.dr === 1) rows.reverse();
      if (vec.dc === 1) cols.reverse();

      for (var ri = 0; ri < size; ri++) {
        for (var ci = 0; ci < size; ci++) {
          var r = rows[ri], c = cols[ci];
          var id = grid[r][c];
          if (id === null) continue;
          var tile = tiles.get(id);

          // 沿方向滑到最远的空格
          var nr = r, nc = c;
          while (true) {
            var tr = nr + vec.dr, tc = nc + vec.dc;
            if (tr < 0 || tr >= size || tc < 0 || tc >= size || grid[tr][tc] !== null) break;
            nr = tr; nc = tc;
          }

          // 检查再往前一格能否合并
          var mr = nr + vec.dr, mc = nc + vec.dc;
          var targetId = (mr >= 0 && mr < size && mc >= 0 && mc < size) ? grid[mr][mc] : null;

          if (targetId !== null && !merged.has(targetId) && tiles.get(targetId).value === tile.value) {
            var newValue = tile.value * 2;
            grid[r][c] = null;
            grid[mr][mc] = tile.id;
            tile.row = mr;
            tile.col = mc;
            tile.value = newValue;
            merged.add(tile.id);
            tiles.delete(targetId);
            ev.merges.push({ keptId: tile.id, removedId: targetId, value: newValue, row: mr, col: mc });
            ev.gained += newValue;
            ev.moved = true;
            if (newValue === 2048 && !won) {
              won = true;
              ev.won = true;
            }
          } else if (nr !== r || nc !== c) {
            grid[r][c] = null;
            grid[nr][nc] = id;
            tile.row = nr;
            tile.col = nc;
            ev.moves.push({ id: id, row: nr, col: nc });
            ev.moved = true;
          }
        }
      }

      if (ev.moved) {
        score += ev.gained;
        spawnTile(ev);
        if (!hasMoves()) {
          over = true;
          ev.over = true;
        }
      }
      return ev;
    }

    function newGame() {
      reset();
      var ev = { moves: [], merges: [], spawns: [], gained: 0, moved: false, won: false, over: false };
      spawnTile(ev);
      spawnTile(ev);
      return ev;
    }

    return {
      size: size,
      newGame: newGame,
      move: move,
      get score() { return score; },
      get won() { return won; },
      get over() { return over; },
    };
  }

  window.Game2048 = { create: create };
})();
