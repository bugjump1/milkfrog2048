/*
 * 主题管线：维护主题注册表，负责把选中的主题写到 <html data-theme="...">，
 * 并记入 localStorage。新增主题请同时修改 css/style.css（变量块）和这里的 THEMES。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'milkfrog2048.theme';

  var THEMES = [
    { id: 'classic', name: '经典' },
    { id: 'dark', name: '夜色' },
    { id: 'milkfrog', name: '奶蛙' },
  ];

  var listeners = [];  // 主题切换回调（main.js 用它同步素材皮肤并重着装棋盘）
  var DEFAULT_THEME = 'milkfrog';  // 从未选择过主题时的默认外观

  function current() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 忽略 */ }
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === saved) return saved;
    }
    return DEFAULT_THEME;
  }

  function apply(id) {
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* 忽略 */ }
    for (var i = 0; i < listeners.length; i++) listeners[i](id);
  }

  function nameOf(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i].name;
    }
    return id;
  }

  function init(button) {
    var cur = current();
    apply(cur);

    function label() {
      button.title = '切换主题（当前：' + nameOf(cur) + '）';
      button.setAttribute('aria-label', button.title);
    }
    label();

    button.addEventListener('click', function () {
      var idx = THEMES.findIndex(function (t) { return t.id === cur; });
      cur = THEMES[(idx + 1) % THEMES.length].id;
      apply(cur);
      label();
    });
  }

  window.Themes = {
    init: init,
    THEMES: THEMES,
    current: current,
    onChange: function (fn) { listeners.push(fn); },
  };
})();
