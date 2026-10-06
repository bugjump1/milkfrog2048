# -*- coding: utf-8 -*-
"""
切素材：把 assets/raw/img 下的图片切成后续可用的 256x256 正方形。

- 表情图（奶蛙-*.png，满幅不透明）：居中裁方 -> 缩放。
- 角色拼图（角色-*.png，透明底多帧拼图）切分流程：
  1) 行投影分段；过高行带（上下两行粘连）按投影谷底递归切开
  2) 行内列投影分段；段宽明显超同行常见帧宽的（多帧粘连）按倍数均分
  3) 每个列段内部做连通域拆分——投影上重叠但彼此分离的角色各自成帧
  4) 面积小于全表中位帧面积 20% 的连通域视为碎屑丢弃

输出：assets/cut/emotes/*.png 与 assets/cut/<角色名>/NN.png
"""
import os
from collections import deque
import numpy as np
from PIL import Image

RAW = os.path.join(os.path.dirname(__file__), '..', 'assets', 'raw', 'img')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'cut')
SIZE = 256
ALPHA_T = 24          # 透明度阈值：大于视为有内容
TALL_RATIO = 1.35     # 行带高超过标准行高的 1.35 倍 -> 上下两行粘连
WIDE_RATIO = 1.6      # 段宽超过标准帧宽的 1.6 倍 -> 多帧粘连
DEBRIS_RATIO = 0.32   # 连通域面积低于最大帧面积 32% -> 碎屑（如碎蛋壳渣）丢弃


def segments(profile):
    """一维投影 -> [(start, end)] 非空段。"""
    segs = []
    s = None
    for i, v in enumerate(profile):
        if v > 0 and s is None:
            s = i
        elif v == 0 and s is not None:
            segs.append((s, i))
            s = None
    if s is not None:
        segs.append((s, len(profile)))
    return segs


def find_valley(profile):
    """在一维投影里找谷底位置（平滑后最小值处）；谷不够深返回 None。"""
    if len(profile) < 12:
        return None
    sm = np.convolve(profile, np.ones(5) / 5, mode='same')
    pad = int(len(sm) * 0.15)
    if len(sm) > 2 * pad:
        core, off = sm[pad:len(sm) - pad], pad
    else:
        core, off = sm, 0
    v = int(np.argmin(core)) + off
    if sm[v] > 0.15 * sm.max():
        return None
    return v


def split_tall(profile, lo, hi, ref_h):
    """行带过高（上下两行粘连）时按谷底递归切开。"""
    if ref_h <= 0 or hi - lo <= ref_h * TALL_RATIO:
        return [(lo, hi)]
    v = find_valley(profile[lo:hi])
    if v is None:
        return [(lo, hi)]
    mid = lo + v
    return split_tall(profile, lo, mid, ref_h) + split_tall(profile, mid, hi, ref_h)


def components(mask):
    """连通域 -> [(面积, (x0,y0,x1,y1))]，按面积降序。BFS 实现。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        q = deque([(y, x)])
        seen[y, x] = True
        n = 0
        minx = maxx = x
        miny = maxy = y
        while q:
            cy, cx = q.popleft()
            n += 1
            minx = min(minx, cx); maxx = max(maxx, cx)
            miny = min(miny, cy); maxy = max(maxy, cy)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        comps.append((n, (minx, miny, maxx + 1, maxy + 1)))
    comps.sort(reverse=True)
    return comps


def save_square(im, bbox, path):
    x0, y0, x1, y1 = bbox
    tile = im.crop((x0, y0, x1, y1))
    w, h = tile.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(tile, ((side - w) // 2, (side - h) // 2))
    canvas.resize((SIZE, SIZE), Image.LANCZOS).save(path)


def remove_white_bg(im):
    """白底图转透明：从四边泛洪填充「低饱和亮色」区域为透明，
    边缘带按与前景的混合比例羽化，并反推前景色去白晕。
    图内部的白色（眼睛高光等）不与边缘连通，保持不透明。"""
    arr = np.array(im.convert('RGB')).astype(np.float32)
    h, w, _ = arr.shape
    mn = arr.min(axis=2)
    mx = arr.max(axis=2)
    # 背景候选：白色/近白，或低饱和的浅色（米色、浅灰渐变底也算）
    candidate = ((mn >= 200) & (mx - mn <= 30)) | ((mn >= 120) & (mx - mn <= 48))

    bg = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if candidate[y, x] and not bg[y, x]:
                bg[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if candidate[y, x] and not bg[y, x]:
                bg[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                dq.append((ny, nx))

    alpha = np.where(bg, 0, 255).astype(np.float32)

    # 前景典型暗度（min 通道的低分位），用于估算边缘像素的不透明度
    fg_strong = ~bg & (mn < 200)
    fmin = float(np.percentile(mn[fg_strong], 15)) if fg_strong.any() else 0.0

    # 边缘带：非 bg 且 4 邻接 bg 的像素，alpha 取「非白程度」比例
    near_bg = np.zeros_like(bg)
    near_bg[1:, :] |= bg[:-1, :]
    near_bg[:-1, :] |= bg[1:, :]
    near_bg[:, 1:] |= bg[:, :-1]
    near_bg[:, :-1] |= bg[:, 1:]
    band = near_bg & ~bg
    a = np.clip((255.0 - mn) / max(255.0 - fmin, 1.0), 0.0, 1.0)
    alpha[band] = np.minimum(alpha[band], a[band] * 255.0)

    # 去色晕：边缘带像素按 fg = (p - bg*(1-a)) / a 反推真实前景色（bg 取边缘平均色）
    border_px = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    bg_mean = border_px.mean(axis=0)
    m = band & (alpha > 0)
    afm = (alpha[m] / 255.0)[:, None]
    arr[m] = (arr[m] - bg_mean * (1.0 - afm)) / np.maximum(afm, 1e-3)
    arr = np.clip(arr, 0, 255)

    rgba = np.dstack([arr.astype(np.uint8), alpha.astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def cut_emote(name):
    im = Image.open(os.path.join(RAW, name)).convert('RGBA')
    im = remove_white_bg(im)
    w, h = im.size
    side = min(w, h)
    box = ((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2)
    out_dir = os.path.join(OUT, 'emotes')
    os.makedirs(out_dir, exist_ok=True)
    save_square(im, box, os.path.join(out_dir, name))
    return 1


def cut_sheet(name):
    im = Image.open(os.path.join(RAW, name)).convert('RGBA')
    mask = np.array(im)[:, :, 3] > ALPHA_T
    role = name[:-4]
    out_dir = os.path.join(OUT, role)
    os.makedirs(out_dir, exist_ok=True)

    # ---- 行带：投影分段 + 谷底拆粘连行 ----
    row_profile = mask.sum(axis=1).astype(float)
    heights = [e - s for s, e in segments(row_profile)]
    med_h = float(np.median(heights)) if heights else 0
    sane = [h for h in heights if h >= 0.6 * med_h]
    ref_h = float(min(sane)) if sane else med_h
    rows = []
    for s, e in segments(row_profile):
        rows.extend(split_tall(row_profile, s, e, ref_h))

    # ---- 列段：行内投影分段，段宽超 1.6 倍常见帧宽的均分兜底 ----
    # 标准帧宽：优先用「段数≥2 的行」的段宽（单段长行可能是多帧粘连，不足为凭）
    rows_bands = []
    multi_widths = []
    for r0, r1 in rows:
        band = mask[r0:r1, :]
        col_segs = segments(band.sum(axis=0))
        rows_bands.append((r0, r1, col_segs))
        if len(col_segs) >= 2:
            multi_widths.extend(e - s for s, e in col_segs)
    ref_w = float(np.median(multi_widths)) if multi_widths else 0

    cells = []  # (r0, r1, c0, c1)
    for r0, r1, col_segs in rows_bands:
        for s, e in col_segs:
            w = e - s
            k = max(1, round(w / ref_w)) if ref_w > 0 else 1
            if k > 1:
                step = w / k
                cells.extend((r0, r1, round(s + i * step), round(s + (i + 1) * step))
                             for i in range(k))
            else:
                cells.append((r0, r1, s, e))

    # ---- 连通域优先拆帧；真连体（面积/宽度远超典型帧）才按 bbox 均分 ----
    # 每段的典型面积基准：所有「段内最大连通域面积」的中位数
    seg_comps = []   # [(r0, r1, c0, c1, comps)]
    for r0, r1, c0, c1 in cells:
        comps = [c for c in components(mask[r0:r1, c0:c1]) if c[0] >= 500]
        seg_comps.append((r0, r1, c0, c1, comps))
    seg_maxes = [max((c[0] for c in comps), default=0) for *_, comps in seg_comps]
    typical = float(np.median([m for m in seg_maxes if m > 0])) if any(seg_maxes) else 0
    area_max = max((m for m in seg_maxes if m > 0), default=0)

    idx = 0
    for r0, r1, c0, c1, comps in seg_comps:
        if not comps:
            continue
        biggest = comps[0]
        # 真连体：面积超典型帧 1.8 倍且宽度超标准帧宽 1.6 倍 -> 按 bbox 横向均分
        bw = biggest[1][2] - biggest[1][0]
        k = max(1, round(bw / ref_w)) if ref_w > 0 else 1
        if biggest[0] > 1.8 * typical and k > 1:
            bx0, by0, bx1, by1 = biggest[1]
            step = (bx1 - bx0) / k
            for i in range(k):
                sub = mask[r0 + by0:r0 + by1, c0 + round(bx0 + i * step):c0 + round(bx0 + (i + 1) * step)]
                subs = [c for c in components(sub) if c[0] >= 500]
                if not subs:
                    continue
                area, (sx0, sy0, sx1, sy1) = subs[0]  # 每份只取最大连通域
                if area < DEBRIS_RATIO * area_max:
                    continue
                idx += 1
                save_square(im, (c0 + round(bx0 + i * step) + sx0, r0 + by0 + sy0,
                                 c0 + round(bx0 + i * step) + sx1, r0 + by0 + sy1),
                            os.path.join(out_dir, '%02d.png' % idx))
        else:
            for area, (bx0, by0, bx1, by1) in comps:
                if area < DEBRIS_RATIO * area_max:
                    continue
                idx += 1
                save_square(im, (c0 + bx0, r0 + by0, c0 + bx1, r0 + by1),
                            os.path.join(out_dir, '%02d.png' % idx))
    return idx


def main():
    total = 0
    for name in sorted(os.listdir(RAW)):
        if not name.endswith('.png'):
            continue
        n = cut_emote(name) if name.startswith('奶蛙') else cut_sheet(name)
        print('%-24s -> %2d 张' % (name, n))
        total += n
    print('共', total, '张，输出目录', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
