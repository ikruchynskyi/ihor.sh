# The text in a street photo, read by Apple's Vision framework on this Mac (run by server/ocr.ts, in ~/AI/ocr-venv:
# pyobjc-framework-Vision, pyobjc-framework-Quartz, pillow). The photo comes on stdin; out goes JSON:
#   {"w", "h", "gps": [lat, lon] | null, "heading": degrees | null, "lines": [{"text", "conf", "box": [x1, y1, x2, y2]}]}
# with boxes in 0..1 of the upright photo. Read in overlapping 1000 px tiles: in a whole 12 MP frame small signs are
# missed (a Columbus Circle night photo: nothing read whole; "59 St - Columbus Circle", "BUSES ONLY", "phar…" in tiles).
import io, json, sys
import Vision
from Foundation import NSData
from PIL import Image, ImageOps

raw = sys.stdin.buffer.read()
src = Image.open(io.BytesIO(raw))
exif = src.getexif()
gps_ifd = exif.get_ifd(0x8825) if exif else {}

def deg(v, ref):
    d = float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
    return -d if ref in ("S", "W") else d

def finite(v):
    return v is not None and v == v and abs(v) != float("inf")

gps = None
try:
    if gps_ifd.get(2) and gps_ifd.get(4):
        g = [round(deg(gps_ifd[2], gps_ifd.get(1, "N")), 6), round(deg(gps_ifd[4], gps_ifd.get(3, "E")), 6)]
        gps = g if all(finite(v) for v in g) and g != [0, 0] else None  # a phone that hid the place writes 0/0
except Exception:
    gps = None
try:
    heading = float(gps_ifd[17]) if gps_ifd.get(17) is not None else None  # GPSImgDirection: where the camera pointed
    heading = heading if finite(heading) else None
except Exception:
    heading = None

im = ImageOps.exif_transpose(src).convert("RGB")
W, H = im.size
T, STEP = 1000, 750

def ocr(tile):
    buf = io.BytesIO()
    tile.save(buf, "JPEG", quality=92)
    data = NSData.dataWithBytes_length_(buf.getvalue(), len(buf.getvalue()))
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setUsesLanguageCorrection_(True)
    Vision.VNImageRequestHandler.alloc().initWithData_options_(data, None).performRequests_error_([req], None)
    for o in req.results() or []:
        c = o.topCandidates_(1)[0]
        b = o.boundingBox()  # 0..1, origin bottom-left
        yield c.string(), float(c.confidence()), (b.origin.x, 1 - b.origin.y - b.size.height, b.origin.x + b.size.width, 1 - b.origin.y)

def iou(a, b):
    w, h = min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0
    inter = w * h
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)

lines = []
for y in range(0, max(1, H - T + STEP), STEP):
    for x in range(0, max(1, W - T + STEP), STEP):
        tw, th = min(T, W - x), min(T, H - y)
        for text, conf, (a, b, c, d) in ocr(im.crop((x, y, x + tw, y + th))):
            box = [(x + a * tw) / W, (y + b * th) / H, (x + c * tw) / W, (y + d * th) / H]
            # the same words from two overlapping tiles: keep one, the more confident reading
            dup = next((l for l in lines if iou(l["box"], box) > 0.4), None)
            if dup:
                if conf > dup["conf"] or (conf == dup["conf"] and len(text) > len(dup["text"])):
                    dup.update(text=text, conf=round(conf, 2), box=[round(v, 4) for v in box])
            else:
                lines.append({"text": text, "conf": round(conf, 2), "box": [round(v, 4) for v in box]})

print(json.dumps({"w": W, "h": H, "gps": gps, "heading": heading, "lines": lines}))
