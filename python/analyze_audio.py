"""Prints a loudness envelope (values 0..1) of an audio file, used by js/animation.js
to sync animations with the sound.   Needs: ffmpeg and numpy.
Usage: python python/analyze_audio.py assets/audio/capture.mp3 [window_ms]"""
import subprocess, sys, numpy as np

path = sys.argv[1]
win_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 50
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.int16).astype(float)
w = 8 * win_ms
n = len(x) // w
env = np.array([np.sqrt(np.mean(x[i * w:(i + 1) * w] ** 2)) for i in range(n)])
env /= env.max()
print(f'duration {len(x) / 8000:.3f}s, {n} values ({win_ms} ms each)')
print(','.join(f'{v:.2f}' for v in env))
