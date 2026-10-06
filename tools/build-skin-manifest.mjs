/*
 * 扫描 assets/cut/ 下的素材文件夹，生成 js/skin-manifest.js。
 * 素材有增删后重新运行即可：node tools/build-skin-manifest.mjs
 * （GitHub Actions 部署时也会自动重建，见 .github/workflows/deploy.yml）
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cutDir = join(root, 'assets', 'cut');

const folders = readdirSync(cutDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const dir = 'assets/cut/' + d.name;
    const images = readdirSync(join(cutDir, d.name))
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort()
      .map((f) => dir + '/' + f);
    return {
      name: d.name,
      type: /emote|表情/i.test(d.name) ? 'emote' : 'role',
      images,
    };
  })
  // emotes 文件夹排最前（规则要求每局必须用上它）
  .sort((a, b) => (b.type === 'emote') - (a.type === 'emote') || a.name.localeCompare(b.name, 'zh'));

const out =
  '// 本文件由 node tools/build-skin-manifest.mjs 生成，请勿手改。\n' +
  '// 素材有增删后重新运行该脚本即可（部署时 Actions 也会自动重建）。\n' +
  'window.SKIN_MANIFEST = ' + JSON.stringify(folders, null, 2) + ';\n';

writeFileSync(join(root, 'js', 'skin-manifest.js'), out, 'utf8');
console.log(
  '生成 js/skin-manifest.js：' +
    folders.map((f) => f.name + '(' + f.images.length + '张)').join('、'),
);

/* ---- 音频清单：assets/raw/audio 顶层 = 合并音效，long/ 子文件夹 = 游戏结束音效 ---- */

const AUDIO_EXT = /\.(mp3|m4a|wav|ogg)$/i;
const audioDir = join(root, 'assets', 'raw', 'audio');
const listAudio = (dir, urlPrefix) =>
  readdirSync(dir)
    .filter((f) => AUDIO_EXT.test(f))
    .sort()
    .map((f) => urlPrefix + f);

const longDir = join(audioDir, 'long');
const audio = {
  merge: listAudio(audioDir, 'assets/raw/audio/'),
  over: readdirSync(audioDir, { withFileTypes: true }).some((d) => d.isDirectory() && d.name === 'long')
    ? listAudio(longDir, 'assets/raw/audio/long/')
    : [],
};

const audioOut =
  '// 本文件由 node tools/build-skin-manifest.mjs 生成，请勿手改。\n' +
  '// merge = 每次合并随机播放的音效；over = 游戏结束音效（仅奶蛙主题使用）。\n' +
  'window.AUDIO_MANIFEST = ' + JSON.stringify(audio, null, 2) + ';\n';

writeFileSync(join(root, 'js', 'audio-manifest.js'), audioOut, 'utf8');
console.log(
  '生成 js/audio-manifest.js：合并音效 ' +
    audio.merge.length + ' 个、结束音效 ' + audio.over.length + ' 个',
);
