/*
 * 交互入口：渲染、键盘/触屏/鼠标拖动输入、计分、遮罩、按钮接线。
 */
(function () {
  'use strict';

  var SLIDE_MS = 120;        // 与 css 里 .tile 的 transition 时长保持一致
  var BEST_KEY = 'milkfrog2048.best';

  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var scoreBoxEl = document.getElementById('score-box');
  var boardEl = document.getElementById('board');
  var tilesEl = document.getElementById('tiles');
  var overlayEl = document.getElementById('overlay');
  var overlayTitleEl = document.getElementById('overlay-title');
  var overlaySubEl = document.getElementById('overlay-sub');
  var btnOverlayPrimary = document.getElementById('btn-overlay-primary');
  var btnContinue = document.getElementById('btn-continue');
  var btnNew = document.getElementById('btn-new');
  var btnSound = document.getElementById('btn-sound');
  var btnTheme = document.getElementById('btn-theme');
  var btnLb = document.getElementById('btn-lb');
  var lbStatusEl = document.getElementById('lb-status');

  var game = Game2048.create(4);
  var elements = new Map();  // 方块 id -> DOM 元素
  var animating = false;
  var best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
  var maxTile = 0;         // 本局出现过的最大方块
  var runSubmitted = false; // 本局成绩是否已（开始）上报，防重复提交
  bestEl.textContent = best;

  /* ---------- 渲染 ---------- */

  function position(el, row, col) {
    el.style.setProperty('--r', row);
    el.style.setProperty('--c', col);
  }

  function tileClass(value) {
    return 'tile tile-' + (value <= 2048 ? value : 'super');
  }

  // 统一方块视觉：背景色块 + 素材图(.tile-art) + 数字(.tile-num)。
  // 经典/夜色主题下 .tile-art 不显示、数字居中；奶蛙主题显示素材、数字到左下角。
  function applyTileSkin(el, value) {
    el.className = tileClass(value);
    el._value = value;
    el.querySelector('.tile-num').textContent = value;
    var url = Skin.artFor(value);
    el.querySelector('.tile-art').style.backgroundImage =
      url ? 'url("' + encodeURI(url).replace(/"/g, '%22') + '")' : '';
  }

  function createTile(t) {
    var el = document.createElement('div');
    el.innerHTML = '<div class="tile-inner"><div class="tile-art"></div><span class="tile-num"></span></div>';
    applyTileSkin(el, t.value);
    position(el, t.row, t.col);
    tilesEl.appendChild(el);
    elements.set(t.id, el);
    return el;
  }

  // 主题切换后，按新主题重画所有在场方块
  function restyleAll() {
    elements.forEach(function (el) {
      applyTileSkin(el, el._value);
    });
  }

  function clearTiles() {
    tilesEl.innerHTML = '';
    elements.clear();
  }

  function applyEvents(ev) {
    var removedEls = [];

    ev.moves.forEach(function (m) {
      position(elements.get(m.id), m.row, m.col);
    });

    ev.merges.forEach(function (mg) {
      if (mg.value > maxTile) maxTile = mg.value;
      var kept = elements.get(mg.keptId);
      var dead = elements.get(mg.removedId);
      if (kept) position(kept, mg.row, mg.col);
      if (dead) {
        position(dead, mg.row, mg.col);
        removedEls.push(mg.removedId);
      }
      // 等滑动结束后再更新数值并播放合并弹跳
      setTimeout(function () {
        if (!kept) return;
        applyTileSkin(kept, mg.value);
        kept.classList.add('tile-merged');
        setTimeout(function () { kept.classList.remove('tile-merged'); }, 200);
      }, SLIDE_MS);
    });

    ev.spawns.forEach(function (s) {
      if (s.value > maxTile) maxTile = s.value;
      createTile(s).classList.add('tile-new');
    });

    setTimeout(function () {
      removedEls.forEach(function (id) {
        var el = elements.get(id);
        if (el) el.remove();
        elements.delete(id);
      });
    }, SLIDE_MS);
  }

  function showScoreGain(gained) {
    var span = document.createElement('span');
    span.className = 'score-gain';
    span.textContent = '+' + gained;
    scoreBoxEl.appendChild(span);
    setTimeout(function () { span.remove(); }, 700);
  }

  function updateScore() {
    scoreEl.textContent = game.score;
    if (game.score > best) {
      best = game.score;
      bestEl.textContent = best;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------- 遮罩 ---------- */

  function overlayVisible() {
    return !overlayEl.classList.contains('hidden');
  }

  function showOverlay(kind) {
    lbStatusEl.classList.add('hidden');
    if (kind === 'win') {
      overlayTitleEl.textContent = '你赢了！🎉';
      overlaySubEl.textContent = '合成了 2048，要继续挑战更大的数字吗？';
      btnOverlayPrimary.textContent = '新游戏';
      btnContinue.classList.remove('hidden');
    } else {
      overlayTitleEl.textContent = '游戏结束';
      overlaySubEl.textContent = '没有可移动的方块了，本局得分 ' + game.score + '。';
      btnOverlayPrimary.textContent = '再来一局';
      btnContinue.classList.add('hidden');
    }
    overlayEl.classList.remove('hidden');
  }

  function hideOverlay() {
    overlayEl.classList.add('hidden');
  }

  /* ---------- 流程 ---------- */

  function newGame() {
    Sound.stopAll();  // 掐断游戏结束音效等
    // 中途重开且已有一定分数的局，也上报上榜（自然结算的局在上报处已标记）
    if (!game.over && game.score >= 100) updateLbStatus(submitRun());
    runSubmitted = false;
    maxTile = 0;
    Skin.newRound();  // 每局开始轮换一次素材分配
    clearTiles();
    hideOverlay();
    lbStatusEl.classList.add('hidden');
    applyEvents(game.newGame());
    updateScore();
  }

  /* ---------- 排行榜上报 ---------- */

  function submitRun() {
    if (runSubmitted || game.score <= 0) return null;
    runSubmitted = true;
    return Leaderboard.reportRun(game.score, maxTile);
  }

  function updateLbStatus(promise) {
    if (!promise) return;
    lbStatusEl.classList.remove('hidden', 'ok', 'err');
    lbStatusEl.textContent = '正在提交成绩…';
    promise.then(function (r) {
      if (r.status === 'submitted') {
        lbStatusEl.classList.add('ok');
        lbStatusEl.textContent = r.rank ? '已上榜：第 ' + r.rank + ' 名 🎉' : '成绩已提交 ✓';
      } else if (r.status === 'local') {
        lbStatusEl.classList.add('ok');
        lbStatusEl.textContent = '已记入本机榜单';
      } else if (r.status === 'error') {
        lbStatusEl.classList.add('err');
        lbStatusEl.textContent = '成绩提交失败（' + r.message + '）';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn lb-retry';
        btn.textContent = '重试';
        btn.addEventListener('click', function () {
          runSubmitted = false;
          updateLbStatus(submitRun());
        });
        lbStatusEl.appendChild(btn);
      } else {
        lbStatusEl.classList.add('hidden');
      }
    }).catch(function () {
      lbStatusEl.classList.add('hidden');
    });
  }

  function handleInput(dir) {
    if (animating || overlayVisible()) return;
    var ev = game.move(dir);
    if (!ev || !ev.moved) return;

    animating = true;
    applyEvents(ev);
    updateScore();
    if (ev.gained > 0) showScoreGain(ev.gained);

    if (ev.merges.length) {
      var maxMerge = Math.max.apply(null, ev.merges.map(function (m) { return m.value; }));
      Sound.merge(maxMerge);
    } else {
      Sound.move();
    }

    if (ev.won) {
      setTimeout(function () { showOverlay('win'); Sound.win(); }, 350);
    } else if (ev.over) {
      setTimeout(function () {
        showOverlay('over');
        Sound.lose();
        updateLbStatus(submitRun());
      }, 350);
    }

    setTimeout(function () { animating = false; }, SLIDE_MS + 30);
  }

  /* ---------- 输入：键盘 + 指针（触屏滑动 / 鼠标拖动） ---------- */

  var KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  document.addEventListener('keydown', function (e) {
    // 输入框（如排行榜昵称）里不抢按键；排行榜弹窗打开时也不动棋盘
    var tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    if (Leaderboard.isOpen()) return;
    var dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    handleInput(dir);
  });

  // 滑动/拖动：统一走 Pointer Events（触屏与鼠标拖动同源，老浏览器降级到 touch）
  var SWIPE_MIN = 24;
  var drag = null; // { id, x, y }

  function swipeTo(dx, dy) {
    handleInput(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  function onPointerDown(e) {
    if (!e.isPrimary) return;                     // 忽略第二根手指 / 第二个鼠标键
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 只响应左键
    if (e.target.closest('button')) return;       // 遮罩上的按钮照常点击
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    // 捕获指针：按住移出棋盘、甚至在窗口外松开，也能收到 pointerup
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    drag = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    swipeTo(dx, dy);
  }

  function onPointerCancel() {
    drag = null;
  }

  if (window.PointerEvent) {
    boardEl.addEventListener('pointerdown', onPointerDown);
    boardEl.addEventListener('pointerup', onPointerUp);
    boardEl.addEventListener('pointercancel', onPointerCancel);
  } else {
    boardEl.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { drag = null; return; }
      drag = { id: null, x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    boardEl.addEventListener('touchend', function (e) {
      if (!drag) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - drag.x;
      var dy = t.clientY - drag.y;
      drag = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      swipeTo(dx, dy);
    }, { passive: true });
  }

  /* ---------- 按钮 ---------- */

  btnNew.addEventListener('click', newGame);
  btnOverlayPrimary.addEventListener('click', newGame);
  btnContinue.addEventListener('click', hideOverlay);
  btnLb.addEventListener('click', Leaderboard.open);

  btnSound.addEventListener('click', function () {
    var muted = Sound.toggle();
    btnSound.textContent = muted ? '🔇' : '🔊';
    btnSound.title = muted ? '开启音效' : '静音';
  });
  if (Sound.muted) {
    btnSound.textContent = '🔇';
    btnSound.title = '开启音效';
  }

  Themes.onChange(function () {
    Skin.setActive(Themes.current());
    restyleAll();
  });
  Themes.init(btnTheme);

  newGame();
})();
