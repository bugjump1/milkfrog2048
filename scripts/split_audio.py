# -*- coding: utf-8 -*-
"""按停顿切分音频。

用法：
  python scripts/split_audio.py analyze   # 只打印包络与停顿段
  python scripts/split_audio.py split     # 在最长停顿的中点切成两段 mp3
"""
import os
import sys
import numpy as np
import av

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'raw', 'audio', '干巴得.mp3')
OUT_DIR = os.path.dirname(SRC)
STEM = '干巴得'
SILENCE_RATIO = 0.06   # RMS 低于峰值的 6% 视为静音
MIN_PAUSE_S = 0.12     # 停顿最短时长（秒）
FRAME_SEC = 0.01       # 包络窗口 10ms


def decode_mono(path):
    inp = av.open(path)
    chunks = []
    sr = None
    for frame in inp.decode(audio=0):
        arr = frame.to_ndarray()
        if arr.dtype.kind == 'i':
            arr = arr.astype(np.float32) / 32768.0
        elif arr.dtype.kind == 'u':
            arr = (arr.astype(np.float32) - 128.0) / 128.0
        if arr.ndim == 1:
            arr = arr[None, :]
        chunks.append(arr)
        sr = frame.sample_rate
    inp.close()
    if not chunks:
        raise SystemExit('没有解码到音频数据')
    pcm = np.concatenate(chunks, axis=1)
    return pcm.mean(axis=0).astype(np.float32), sr


def envelope(mono, sr):
    win = max(1, int(sr * FRAME_SEC))
    n = len(mono) // win
    env = np.sqrt((mono[:n * win].reshape(n, win) ** 2).mean(axis=1))
    return env, win


def find_pauses(env, win, sr):
    peak = float(env.max())
    sil = env < peak * SILENCE_RATIO
    min_frames = int(MIN_PAUSE_S / FRAME_SEC)
    pauses = []
    i, n = 0, len(sil)
    while i < n:
        if sil[i]:
            j = i
            while j < n and sil[j]:
                j += 1
            if j - i >= min_frames:
                pauses.append((i * FRAME_SEC, j * FRAME_SEC))
            i = j
        else:
            i += 1
    return pauses


def write_mp3(path, pcm, sr):
    out = av.open(path, 'w')
    st = out.add_stream('libmp3lame', rate=sr, layout='mono')
    frame_size = st.codec_context.frame_size or 1152
    total = len(pcm)
    i = 0
    while i < total:
        chunk = pcm[i:i + frame_size]
        if len(chunk) < frame_size:
            chunk = np.pad(chunk, (0, frame_size - len(chunk)))
        f = av.AudioFrame.from_ndarray(chunk.reshape(1, -1).astype(np.float32),
                                       format='fltp', layout='mono')
        f.sample_rate = sr
        for packet in st.encode(f):
            out.mux(packet)
        i += frame_size
    for packet in st.encode():
        out.mux(packet)
    out.close()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'analyze'
    if len(sys.argv) > 2:
        global SILENCE_RATIO, MIN_PAUSE_S
        SILENCE_RATIO = float(sys.argv[2])
        MIN_PAUSE_S = float(sys.argv[3])
    mono, sr = decode_mono(SRC)
    dur = len(mono) / sr
    print('文件: %s' % os.path.abspath(SRC))
    print('大小: %d 字节 | 时长: %.2f 秒 | 采样率: %d Hz' % (os.path.getsize(SRC), dur, sr))

    env, win = envelope(mono, sr)
    peak = float(env.max())
    print('\nRMS 包络（每 50ms 一格，# 越多越响）:')
    for i in range(0, len(env), 5):
        seg = float(env[i:i + 5].max())
        print('%6.2fs |%-40s|' % (i * FRAME_SEC, '#' * int(40 * seg / (peak + 1e-9))))

    pauses = find_pauses(env, win, sr)
    print('\n停顿段: %s' % (['%.2f-%.2fs' % p for p in pauses] or '无'))

    if mode != 'split':
        return
    if not pauses:
        raise SystemExit('未检测到停顿，无法切分')
    a, b = max(pauses, key=lambda p: p[1] - p[0])
    mid = (a + b) / 2
    print('切分点: %.2f 秒（最长停顿的中点）' % mid)
    idx = int(mid * sr)
    for k, part in enumerate([mono[:idx], mono[idx:]], 1):
        dst = os.path.join(OUT_DIR, '%s-%d.mp3' % (STEM, k))
        write_mp3(dst, part, sr)
        print('已写入 %s（%.2f 秒, %d 字节）' % (dst, len(part) / sr, os.path.getsize(dst)))


if __name__ == '__main__':
    main()
