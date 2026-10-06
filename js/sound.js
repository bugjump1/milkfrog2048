/*
 * 音效：用 Web Audio API 现场合成，不依赖任何音频文件。
 * 浏览器要求音频上下文在用户手势之后创建/恢复，这里在播放时惰性初始化。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'milkfrog2048.muted';
  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* 隐私模式下忽略 */ }

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, delay, duration, options) {
    if (muted) return;
    var c = ensureCtx();
    if (!c) return;
    options = options || {};
    var type = options.type || 'sine';
    var volume = options.volume || 0.1;
    var t0 = c.currentTime + delay;

    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /* ---------- 奶蛙主题的文件音效（assets/raw/audio，见 js/audio-manifest.js） ---------- */

  var channels = { merge: null, over: null };  // 各通道一个 <audio>，换 src 即打断上一个
  var lastMergeSrc = null;                     // 上一合并音效：相邻两次合并不重复

  // 仅奶蛙主题使用文件音效；其余主题走下面的合成音
  function fileSrc(kind) {
    var m = window.AUDIO_MANIFEST;
    if (!m || !window.Themes || Themes.current() !== 'milkfrog') return null;
    var list = m[kind];
    if (!list || !list.length) return null;
    var pool = list;
    // 合并音效避开上一次的（素材只有一个时无从避开，允许重复）
    if (kind === 'merge' && lastMergeSrc && list.length > 1) {
      pool = list.filter(function (s) { return s !== lastMergeSrc; });
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (kind === 'merge') lastMergeSrc = pick;
    return pick;
  }

  function playOnChannel(kind, src, volume) {
    var el = channels[kind];
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      channels[kind] = el;
    }
    el.pause();
    el.src = encodeURI(src);
    el.volume = volume;
    var p = el.play();
    if (p && p.catch) p.catch(function () { /* 自动播放策略拦截时静默失败 */ });
  }

  function stopAll() {
    for (var k in channels) {
      var el = channels[k];
      if (el && el.src) {
        el.pause();
        try { el.currentTime = 0; } catch (e) { /* 忽略 */ }
      }
    }
  }

  window.Sound = {
    get muted() { return muted; },
    toggle: function () {
      muted = !muted;
      try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
      if (muted) stopAll();
      else ensureCtx();
      return muted;
    },
    // 停掉所有文件音效（开局/重开时调用，如掐断游戏结束的 long 音频）
    stopAll: stopAll,
    // 调试用：观察两个文件音效通道的实时状态
    debugChannels: function () {
      var out = {};
      for (var k in channels) {
        var el = channels[k];
        out[k] = el && el.src
          ? { src: decodeURIComponent(el.src), paused: el.paused, time: el.currentTime }
          : null;
      }
      return out;
    },
    // 普通滑动：极轻的一声
    move: function () {
      tone(150, 0, 0.05, { type: 'triangle', volume: 0.035 });
    },
    // 合并：奶蛙主题随机播一个音频文件（后一次打断前一次），其余主题合成音
    merge: function (value) {
      if (muted) return;
      var src = fileSrc('merge');
      if (src) {
        playOnChannel('merge', src, 0.75);
        return;
      }
      var step = Math.min(Math.max(Math.log2(value) - 1, 1), 13);
      var f = 280 * Math.pow(2, step / 12);
      tone(f, 0, 0.09, { type: 'triangle', volume: 0.09 });
      tone(f * 1.5, 0.06, 0.13, { type: 'triangle', volume: 0.07 });
    },
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, i * 0.13, 0.28, { type: 'sine', volume: 0.1 });
      });
    },
    // 游戏结束：奶蛙主题播放 long/ 里的音频，其余主题合成音
    lose: function () {
      if (muted) return;
      var src = fileSrc('over');
      if (src) {
        playOnChannel('over', src, 0.85);
        return;
      }
      tone(320, 0, 0.22, { type: 'sine', volume: 0.08 });
      tone(219, 0.2, 0.4, { type: 'sine', volume: 0.08 });
    },
  };
})();
