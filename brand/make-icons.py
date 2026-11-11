#!/usr/bin/env python3
"""Makes every Deadline Tracker icon from the glass-cube 3D scene.

Run from the project folder (needs Node + Playwright's Chromium, and Python with Pillow + numpy):
    python3 brand/make-icons.py            # renders the scenes, then writes all sizes
    python3 brand/make-icons.py --reuse    # skips rendering and only re-makes the sizes from brand/*.png

What it writes
    brand/deadline-tracker-master.png   1024 x 1024, the source image (keep it; every other size comes from a render)
    brand/render-small.png              close-up render used for the small sizes
    brand/render-maskable.png           zoomed-out render for Android's shaped icons
    icons/icon-96/144/192/256/512.png   app icons (manifest, Windows, Android)
    icons/icon-192-maskable.png, icon-512-maskable.png   Android adaptive icons (cube inside the 80% safe circle)
    icons/apple-touch-icon.png          180 x 180 for iPhone and iPad home screens
    icons/favicon-16x16.png, favicon-32x32.png, favicon.ico (16/32/48, project root)   browser tab
    icons/logo-mark.webp                96 x 96, built into the page by build.js as the in-app logo

The scene is rendered by brand/render-icon.js (a WebGL ray tracer in brand/icon-scene.html, run in headless Chromium).
"""
import os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND, ICONS = os.path.join(ROOT, "brand"), os.path.join(ROOT, "icons")
MASTER = os.path.join(BRAND, "deadline-tracker-master.png")
SMALL = os.path.join(BRAND, "render-small.png")
MASK = os.path.join(BRAND, "render-maskable.png")


def render(preset, size, spp, out, extra="{}"):
    subprocess.run(["node", os.path.join(BRAND, "render-icon.js"), preset, str(size), str(spp), out, extra], check=True, cwd=ROOT)


def bloom(img, strength=0.32):
    """Soft glow around the brightest parts (the check and the light trail), like a camera lens would add."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    bright = a * np.clip((lum - 0.62) / 0.38, 0, 1)[..., None]
    src = Image.fromarray((bright * 255).astype(np.uint8))
    s = img.width / 1024
    glow = sum(w * np.asarray(src.filter(ImageFilter.GaussianBlur(r * s)), dtype=np.float32) / 255.0
               for r, w in ((6, 0.45), (18, 0.35), (44, 0.25)))
    out = 1 - (1 - a) * (1 - np.clip(glow * strength * 2.2, 0, 1))   # screen blend: never clips to flat white
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def down(img, n, sharpen=0):
    """High-quality downscale; small sizes get a little sharpening so the check stays crisp."""
    im = img.convert("RGB")
    while im.width >= n * 4:   # step down in halves first (less shimmer than one big jump)
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im = im.resize((n, n), Image.LANCZOS)
    if sharpen: im = im.filter(ImageFilter.UnsharpMask(radius=0.6 if n <= 32 else 1.0, percent=sharpen, threshold=0))
    return im


def save_png(im, path):
    im.convert("RGB").save(path, "PNG", optimize=True)


def main():
    os.makedirs(ICONS, exist_ok=True)
    if "--reuse" not in sys.argv:
        tmp = os.path.join(BRAND, ".raw.png")
        render("master", 1024, 4, tmp); bloom(Image.open(tmp)).save(MASTER, "PNG", optimize=True)
        render("small", 512, 4, tmp); bloom(Image.open(tmp), 0.38).save(SMALL, "PNG", optimize=True)
        render("maskable", 1024, 3, tmp); bloom(Image.open(tmp)).save(MASK, "PNG", optimize=True)
        os.remove(tmp)
    master, small, mask = (Image.open(p).convert("RGB") for p in (MASTER, SMALL, MASK))
    for n in (512, 256, 192, 144):
        save_png(down(master, n), os.path.join(ICONS, f"icon-{n}.png"))
    save_png(down(small, 96, 40), os.path.join(ICONS, "icon-96.png"))   # Windows taskbar / Start, shortcuts: the close-up reads better
    for n in (512, 192):
        save_png(down(mask, n), os.path.join(ICONS, f"icon-{n}-maskable.png"))
    save_png(down(master, 180, 20), os.path.join(ICONS, "apple-touch-icon.png"))
    f16, f32, f48 = down(small, 16, 90), down(small, 32, 70), down(small, 48, 50)
    save_png(f16, os.path.join(ICONS, "favicon-16x16.png")); save_png(f32, os.path.join(ICONS, "favicon-32x32.png"))
    f48.save(os.path.join(ROOT, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[f16, f32])
    down(small, 96, 40).save(os.path.join(ICONS, "logo-mark.webp"), "WEBP", quality=88, method=6)
    print("icons written to", ICONS, "and favicon.ico")


if __name__ == "__main__":
    main()
