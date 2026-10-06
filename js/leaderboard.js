/*
 * 排行榜：TinyWebDB 在线榜 + 本机榜单兜底。
 * 方案思路受 YHSome/BigNaiWa 项目启发，代码为本项目独立实现。
 *
 * 用法：
 *   默认「本机模式」——成绩只存这台设备的 localStorage，开箱即用；
 *   要开在线榜：在 https://appinventor.space 注册一个 TinyWebDB 账号，
 *   把 USER / SECRET 填进下面 CONFIG（PREFIX 换个值等于另开一张榜）。
 *   运行时也可以用 Leaderboard.configure({...}) 覆盖（本地联调用）。
 *
 * 榜单语义：历史最高分 Top 20（拉取最近最多 MAX_PAGES 页后客户端排序，
 *   平分时先比最大方块、再比达成时间）。只写自己的记录，不删别人的。
 */
(function () {
  'use strict';

  var CONFIG = {
    API: 'https://tinywebdb.appinventor.space/api',
    USER: '',           // ← 注册后把账号填到这里
    SECRET: '',         // ← 和 secret
    PREFIX: 'mf2048_',  // 本游戏的数据前缀，换个值 = 另开一张榜
    TOP_N: 20,
    PAGE_SIZE: 100,
    MAX_PAGES: 5,
  };

  var NAME_KEY = 'milkfrog2048.name';
  var LOCAL_KEY = 'milkfrog2048.localScores';
  var CACHE_KEY = 'milkfrog2048.lbCache';
  var NAME_RE = /^奶蛙[a-z0-9]{6}$/;  // 身份格式：奶蛙 + 6 位字母数字混排
  var FALLBACK_NAME = '匿名蛙';        // 历史数据里昵称异常时的展示兜底
  var NAME_MAX = 16;
  var SUBMIT_MIN_GAP = 3000;   // 两次提交至少间隔，防手抖连发
  var MAX_SCORE = 9999999;     // 明显离谱的分数不收
  var MAX_TILE = 131072;
  var REQUEST_TIMEOUT = 8000;

  var lastSubmitAt = 0;
  var lastTag = null;
  var els = {};

  /* ---------- 基础工具 ---------- */

  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
  }

  function cleanName(raw) {
    var s = String(raw == null ? '' : raw);
    s = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
    return s || FALLBACK_NAME;
  }

  // 身份「奶蛙xxxxxx」：首次需要时生成并写入 localStorage，
  // 之后同一浏览器一直复用；旧版自定义昵称不符合新格式，会被重新生成替换。
  function generateName() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var s = '';
    for (var i = 0; i < 6; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return '奶蛙' + s;
  }

  function getName() {
    var saved = null;
    try { saved = localStorage.getItem(NAME_KEY); } catch (e) { /* 忽略 */ }
    if (saved && NAME_RE.test(saved)) return saved;
    var name = generateName();
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 忽略 */ }
    return name;
  }

  function timeAgo(t) {
    if (!t) return '';
    var d = Date.now() - t;
    if (d < 60e3) return '刚刚';
    if (d < 3600e3) return Math.floor(d / 60e3) + '分钟前';
    if (d < 86400e3) return Math.floor(d / 3600e3) + '小时前';
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + '天前';
    return new Date(t).toLocaleDateString();
  }

  function onlineEnabled() {
    return !!(window.fetch && CONFIG.USER && CONFIG.SECRET);
  }

  /* ---------- 网络 ---------- */

  function friendly(err) {
    if (err && err.name === 'AbortError') return '请求超时';
    return err && err.message ? err.message : '网络错误';
  }

  function post(action, extra) {
    var body = new URLSearchParams();
    body.set('user', CONFIG.USER);
    body.set('secret', CONFIG.SECRET);
    body.set('action', action);
    if (extra) {
      for (var k in extra) body.set(k, extra[k]);
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT) : null;
    return fetch(CONFIG.API, { method: 'POST', body: body, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('服务返回 HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('响应不是 JSON'); }
        if (!data || typeof data !== 'object') throw new Error('响应格式异常');
        return data;
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  /* ---------- 数据 ---------- */

  function rank(list) {
    return list.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.tile !== a.tile) return b.tile - a.tile;
      return a.t - b.t; // 同分同块，先达成者靠前
    });
  }

  // 本机榜单（无论在线与否都记录，兜底可看）
  function saveLocal(score, tile, t) {
    var list = readJSON(LOCAL_KEY, []);
    list.push({ n: getName(), s: score, m: tile, t: t });
    list = rank(list.map(toEntry)).slice(0, CONFIG.TOP_N).map(function (e) {
      return { n: e.name, s: e.score, m: e.tile, t: e.t };
    });
    writeJSON(LOCAL_KEY, list);
  }

  function localTop() {
    return rank(readJSON(LOCAL_KEY, []).map(toEntry)).slice(0, CONFIG.TOP_N);
  }

  function toEntry(v) {
    return { tag: '', name: cleanName(v.n), score: Math.floor(Number(v.s) || 0), tile: Math.floor(Number(v.m) || 2), t: Number(v.t) || 0 };
  }

  function parseEntry(tag, rawValue) {
    var v = rawValue;
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (e) { return null; }
    }
    if (!v || typeof v !== 'object') return null;
    var s = Math.floor(Number(v.s) || 0);
    if (s <= 0) return null;
    return { tag: tag, name: cleanName(v.n), score: s, tile: Math.floor(Number(v.m) || 2), t: Number(v.t) || 0 };
  }

  function makeTag() {
    return CONFIG.PREFIX + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // 拉取榜单：逐页搜索本游戏前缀的数据，客户端排序取 Top N。
  // 注：返回条数不足一页即认为到底；分页起点按「页内起始序号」递增。
  function fetchTop() {
    var entries = [];
    var page = 0;
    function nextPage() {
      page++;
      if (page > CONFIG.MAX_PAGES) return Promise.resolve(entries);
      var no = (page - 1) * CONFIG.PAGE_SIZE + 1;
      return post('search', { no: no, count: CONFIG.PAGE_SIZE, tag: CONFIG.PREFIX, type: 'both' })
        .then(function (data) {
          var matched = 0;
          for (var tag in data) {
            if (!Object.prototype.hasOwnProperty.call(data, tag)) continue;
            if (tag.indexOf(CONFIG.PREFIX) !== 0) continue;
            matched++;
            var e = parseEntry(tag, data[tag]);
            if (e) entries.push(e);
          }
          if (matched < CONFIG.PAGE_SIZE) return entries;
          return nextPage();
        });
    }
    return nextPage().then(function (list) {
      var top = rank(list).slice(0, CONFIG.TOP_N);
      writeJSON(CACHE_KEY, { t: Date.now(), list: top });
      return top;
    });
  }

  function readCache() {
    var c = readJSON(CACHE_KEY, null);
    return c && Array.isArray(c.list) ? c.list : null;
  }

  /* ---------- 提交 ---------- */

  // reportRun(score, maxTile) → Promise<
  //   {status:'submitted', rank:N|null} | {status:'local'} | {status:'skipped'} | {status:'error', message}
  // >
  function reportRun(score, maxTile) {
    score = Math.floor(Number(score) || 0);
    maxTile = Math.floor(Number(maxTile) || 0);
    var now = Date.now();

    if (score <= 0 || score > MAX_SCORE || maxTile <= 1 || maxTile > MAX_TILE) {
      return Promise.resolve({ status: 'skipped' });
    }
    if (now - lastSubmitAt < SUBMIT_MIN_GAP) {
      return Promise.resolve({ status: 'skipped' });
    }
    lastSubmitAt = now;

    saveLocal(score, maxTile, now); // 本机榜单始终记录

    if (!onlineEnabled()) {
      return Promise.resolve({ status: 'local' });
    }

    lastTag = makeTag();
    var value = JSON.stringify({ n: getName(), s: score, m: maxTile, t: now });
    return post('update', { tag: lastTag, value: value })
      .then(function () {
        // 提交成功后再拉一次榜，算出自己当前的名次；拉榜失败不影响“已提交”
        return fetchTop()
          .then(function (list) {
            var rank = null;
            for (var i = 0; i < list.length; i++) {
              if (list[i].tag === lastTag) { rank = i + 1; break; }
            }
            return { status: 'submitted', rank: rank };
          })
          .catch(function () {
            return { status: 'submitted', rank: null };
          });
      })
      .catch(function (err) {
        return { status: 'error', message: friendly(err) };
      });
  }

  /* ---------- 弹窗 UI（全部 textContent 渲染，不拼 HTML） ---------- */

  function cacheEls() {
    els.modal = document.getElementById('lb-modal');
    els.backdrop = document.getElementById('lb-backdrop');
    els.mode = document.getElementById('lb-mode');
    els.close = document.getElementById('lb-close');
    els.identity = document.getElementById('lb-identity');
    els.list = document.getElementById('lb-list');
    els.foot = document.getElementById('lb-foot');
  }

  function isOpen() {
    return els.modal && !els.modal.classList.contains('hidden');
  }

  function open() {
    els.modal.classList.remove('hidden');
    els.identity.textContent = getName();
    renderList(readCache(), 'cache');
    refresh();
  }

  function close() {
    els.modal.classList.add('hidden');
  }

  function refresh() {
    if (!onlineEnabled()) {
      els.mode.textContent = '本机';
      els.mode.className = 'lb-mode local';
      els.foot.hidden = true;
      renderList(localTop(), 'local');
      return;
    }
    els.mode.textContent = '在线';
    els.mode.className = 'lb-mode online';
    els.foot.hidden = false;
    els.foot.textContent = '历史最高分 Top 20 · 每局结束自动提交 · 行内数字为本局最大方块';
    renderLoading();
    fetchTop()
      .then(function (list) { renderList(list, 'online'); })
      .catch(function (err) { renderError(friendly(err)); });
  }

  function renderLoading() {
    els.list.innerHTML = '';
    var li = document.createElement('li');
    li.className = 'lb-msg';
    li.textContent = '加载中…';
    els.list.appendChild(li);
  }

  function renderError(message) {
    els.list.innerHTML = '';
    var li = document.createElement('li');
    li.className = 'lb-msg';
    li.textContent = '加载失败：' + message;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn lb-retry';
    btn.textContent = '重试';
    btn.addEventListener('click', refresh);
    li.appendChild(btn);
    els.list.appendChild(li);
  }

  function renderList(list, mode) {
    els.list.innerHTML = '';
    if (!list || !list.length) {
      var empty = document.createElement('li');
      empty.className = 'lb-msg';
      empty.textContent = mode === 'local' ? '还没有成绩，玩一局试试！' : '暂时没有成绩';
      els.list.appendChild(empty);
      return;
    }
    list.forEach(function (e, i) {
      els.list.appendChild(buildRow(e, i, mode));
    });
  }

  function buildRow(e, i, mode) {
    var li = document.createElement('li');
    if (i < 3) li.classList.add('top' + (i + 1));
    if (mode === 'online' && lastTag && e.tag === lastTag) li.classList.add('mine');

    var rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = String(i + 1);

    var name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = e.name;

    var tile = document.createElement('span');
    tile.className = 'lb-tile';
    tile.textContent = String(e.tile);
    tile.title = '本局最大方块';

    var score = document.createElement('span');
    score.className = 'lb-score';
    score.textContent = String(e.score);

    var time = document.createElement('span');
    time.className = 'lb-time';
    time.textContent = timeAgo(e.t);

    li.appendChild(rank);
    li.appendChild(name);
    li.appendChild(tile);
    li.appendChild(score);
    li.appendChild(time);
    return li;
  }

  function init() {
    cacheEls();
    if (!els.modal) return;
    els.backdrop.addEventListener('click', close);
    els.close.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  init();

  window.Leaderboard = {
    open: open,
    close: close,
    isOpen: isOpen,
    getName: getName,
    reportRun: reportRun,
    onlineEnabled: onlineEnabled,
    // 运行时覆盖配置（本地联调/调试用），如 Leaderboard.configure({ USER:'...', SECRET:'...' })
    configure: function (patch) {
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(CONFIG, k)) CONFIG[k] = patch[k];
      }
    },
  };
})();
