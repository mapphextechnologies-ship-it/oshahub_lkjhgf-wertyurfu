#!/usr/bin/env python3
"""Generate a small standalone version-3/L QR SVG for a short OshaHub URL."""
import sys
import struct
import zlib
from pathlib import Path

url = sys.argv[1]
output = Path(sys.argv[2])
raw = url.encode("utf-8")
if len(raw) > 53:
    raise SystemExit("This standalone encoder supports URLs up to 53 UTF-8 bytes.")

def append_bits(target, value, count):
    target.extend((value >> shift) & 1 for shift in range(count - 1, -1, -1))

bits = []
append_bits(bits, 0b0100, 4)  # byte mode
append_bits(bits, len(raw), 8)
for byte in raw:
    append_bits(bits, byte, 8)
bits.extend([0] * min(4, 440 - len(bits)))
while len(bits) % 8:
    bits.append(0)
data = [sum(bits[offset + bit] << (7 - bit) for bit in range(8)) for offset in range(0, len(bits), 8)]
pad_bytes = (0xEC, 0x11)
while len(data) < 55:
    data.append(pad_bytes[(len(data) - ((len(bits) + 7) // 8)) % 2])

exp = [0] * 512
log = [0] * 256
value = 1
for index in range(255):
    exp[index] = value
    log[value] = index
    value <<= 1
    if value & 0x100:
        value ^= 0x11D
for index in range(255, 512):
    exp[index] = exp[index - 255]

def multiply(a, b):
    return 0 if not a or not b else exp[log[a] + log[b]]

generator = [1]
for power in range(15):
    product = [0] * (len(generator) + 1)
    for index, coefficient in enumerate(generator):
        product[index] ^= coefficient
        product[index + 1] ^= multiply(coefficient, exp[power])
    generator = product
remainder = data + [0] * 15
for offset in range(55):
    factor = remainder[offset]
    for index, coefficient in enumerate(generator):
        remainder[offset + index] ^= multiply(coefficient, factor)
codewords = data + remainder[-15:]
stream = []
for byte in codewords:
    append_bits(stream, byte, 8)

size = 29
matrix = [[None for _ in range(size)] for _ in range(size)]
reserved = [[False for _ in range(size)] for _ in range(size)]

def function(row, col, dark):
    if 0 <= row < size and 0 <= col < size:
        matrix[row][col] = dark
        reserved[row][col] = True

def finder(top, left):
    for dy in range(-1, 8):
        for dx in range(-1, 8):
            dark = (0 <= dy <= 6 and 0 <= dx <= 6 and
                    (dy in (0, 6) or dx in (0, 6) or (2 <= dy <= 4 and 2 <= dx <= 4)))
            function(top + dy, left + dx, dark)

finder(0, 0)
finder(0, size - 7)
finder(size - 7, 0)
for index in range(8, size - 8):
    function(6, index, index % 2 == 0)
    function(index, 6, index % 2 == 0)
for dy in range(-2, 3):
    for dx in range(-2, 3):
        function(22 + dy, 22 + dx, max(abs(dy), abs(dx)) != 1)

mask = 0
format_data = (0b01 << 3) | mask  # low error correction
format_value = format_data << 10
for bit in range(14, 9, -1):
    if (format_value >> bit) & 1:
        format_value ^= 0x537 << (bit - 10)
format_bits = ((format_data << 10) | format_value) ^ 0x5412
for bit in range(15):
    dark = ((format_bits >> bit) & 1) != 0
    if bit < 6:
        function(bit, 8, dark)
    elif bit < 8:
        function(bit + 1, 8, dark)
    elif bit == 8:
        function(8, 7, dark)
    else:
        function(8, 14 - bit, dark)
    if bit < 8:
        function(8, size - bit - 1, dark)
    else:
        function(size - 15 + bit, 8, dark)
function(size - 8, 8, True)

bit_index = 0
right = size - 1
while right >= 1:
    if right == 6:
        right = 5
    upward = ((right + 1) & 2) == 0
    for vertical in range(size):
        row = size - 1 - vertical if upward else vertical
        for col in (right, right - 1):
            if reserved[row][col]:
                continue
            dark = bit_index < len(stream) and stream[bit_index] == 1
            bit_index += 1
            if (row + col) % 2 == 0:
                dark = not dark
            matrix[row][col] = dark
    right -= 2

quiet = 4
extent = size + quiet * 2
paths = []
for row in range(size):
    for col in range(size):
        if matrix[row][col]:
            paths.append(f"M{col + quiet},{row + quiet}h1v1h-1z")
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {extent} {extent}" '
       f'role="img" aria-label="QR code to OshaHub car wash app at {url}" shape-rendering="crispEdges">'
       f'<title>OshaHub car wash app · {url}</title><rect width="100%" height="100%" fill="#fff"/>'
       f'<path d="{"".join(paths)}" fill="#050606"/></svg>')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(svg, encoding="utf-8")
scale = 12
pixels = extent * scale
scanlines = []
for y in range(pixels):
    row = bytearray([0])
    module_y = y // scale - quiet
    for x in range(pixels):
        module_x = x // scale - quiet
        dark = (0 <= module_y < size and 0 <= module_x < size and matrix[module_y][module_x])
        shade = 5 if dark else 255
        row.extend((shade, shade, shade))
    scanlines.append(bytes(row))

def png_chunk(kind, payload):
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

png = (b"\x89PNG\r\n\x1a\n" +
       png_chunk(b"IHDR", struct.pack(">2I5B", pixels, pixels, 8, 2, 0, 0, 0)) +
       png_chunk(b"IDAT", zlib.compress(b"".join(scanlines), 9)) +
       png_chunk(b"IEND", b""))
output.with_suffix(".png").write_bytes(png)
print(f"Wrote {output} and {output.with_suffix('.png')} for {url}; encoded {bit_index} modules.")
