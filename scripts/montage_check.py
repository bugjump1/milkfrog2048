# -*- coding: utf-8 -*-
"""把 assets/cut 下每组小图拼成带编号的检查大图，输出到 /tmp/cutcheck/。"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

CUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'cut')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'tmp', 'cutcheck')
os.makedirs(OUT, exist_ok=True)

CELL = 200          # 缩略图尺寸
PAD = 8
LABEL_H = 26

try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
except Exception:
    FONT = ImageFont.load_default()


def montage(folder):
    files = sorted(f for f in os.listdir(folder) if f.endswith('.png'))
    cols = 8
    rows = math.ceil(len(files) / cols)
    W = cols * (CELL + PAD) + PAD
    H = rows * (CELL + LABEL_H + PAD) + PAD + 40
    sheet = Image.new('RGB', (W, H), (80, 130, 95))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 6), '%s  (%d 张)' % (os.path.basename(folder), len(files)),
           fill=(255, 230, 120), font=FONT)
    for i, f in enumerate(files):
        r, c = divmod(i, cols)
        x = PAD + c * (CELL + PAD)
        y = 40 + r * (CELL + LABEL_H + PAD)
        d.rectangle([x, y, x + CELL, y + CELL], outline=(40, 60, 45))
        im = Image.open(os.path.join(folder, f)).convert('RGBA')
        im.thumbnail((CELL, CELL))
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
        d.text((x + 2, y + CELL + 2), f[:-4], fill=(60, 60, 60), font=FONT)
    out = os.path.join(OUT, os.path.basename(folder) + '.jpg')
    sheet.save(out, quality=82)
    print(out)


for name in sorted(os.listdir(CUT)):
    p = os.path.join(CUT, name)
    if os.path.isdir(p):
        montage(p)
