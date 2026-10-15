"""Reproducible little-book icons; Python standard library only."""
from pathlib import Path
import struct
import zlib

SIZE = 512
pixels = bytearray(SIZE * SIZE * 4)


def rounded_box(x0, y0, x1, y1, radius, color):
    x0, y0, x1, y1, radius = [value * 4 for value in (x0, y0, x1, y1, radius)]
    for y in range(max(0, int(y0)), min(SIZE, int(y1))):
        for x in range(max(0, int(x0)), min(SIZE, int(x1))):
            cx = min(max(x + .5, x0 + radius), x1 - radius)
            cy = min(max(y + .5, y0 + radius), y1 - radius)
            if (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= radius ** 2:
                at = (y * SIZE + x) * 4
                pixels[at:at + 4] = bytes(color)


rounded_box(3, 3, 125, 125, 28, (234, 244, 254, 255))
rounded_box(25, 18, 104, 111, 13, (114, 158, 208, 255))
rounded_box(32, 20, 102, 101, 10, (164, 209, 250, 255))
rounded_box(33, 97, 102, 107, 4, (255, 253, 246, 255))
rounded_box(80, 19, 90, 40, 2, (255, 253, 246, 255))
rounded_box(47, 55, 53, 64, 3, (56, 100, 143, 255))
rounded_box(76, 55, 82, 64, 3, (56, 100, 143, 255))
rounded_box(37, 68, 50, 74, 3, (240, 185, 183, 255))
rounded_box(80, 68, 93, 74, 3, (240, 185, 183, 255))
rounded_box(59, 69, 71, 79, 5, (56, 100, 143, 255))
rounded_box(59, 67, 71, 73, 0, (164, 209, 250, 255))


def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)


def write_icon(size, target):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        ys = range(y * SIZE // size, (y + 1) * SIZE // size)
        for x in range(size):
            xs = range(x * SIZE // size, (x + 1) * SIZE // size)
            samples = len(ys) * len(xs)
            for channel in range(4):
                raw.append(sum(pixels[(yy * SIZE + xx) * 4 + channel] for yy in ys for xx in xs) // samples)
    header = struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)
    target.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


directory = Path(__file__).resolve().parents[1] / 'extension' / 'icons'
directory.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    write_icon(size, directory / f'icon{size}.png')
print('Generated 16, 32, 48, and 128 px icons.')
