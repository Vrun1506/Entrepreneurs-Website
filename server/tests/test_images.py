"""Tests for the image sanitisation boundary.

These are the highest-value tests in the project. Everything reaching
`sanitise` is attacker-controlled, and everything leaving it is served to
the whole membership, so each test below pins one specific attack shut.
"""

from __future__ import annotations

import io
import zipfile

import pytest
from PIL import Image

from app.images import MAX_EDGE, RejectedImage, sanitise, sniff_format


def make_image(fmt: str, size: tuple[int, int] = (200, 150), **save_kwargs: object) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 90, 60)).save(buf, format=fmt, **save_kwargs)
    return buf.getvalue()


# ─── Format allowlist ───────────────────────────────────────────────


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_accepts_the_three_supported_formats(fmt: str) -> None:
    assert sanitise(make_image(fmt)).data[:4] == b"RIFF"  # always re-encoded to WebP


def test_rejects_svg() -> None:
    """SVG is XML that can carry <script>.

    Serving one from our own origin would be a stored-XSS primitive, and it
    is the single most common mistake in image upload handling. The fix is
    not to sanitise SVG — it is not to accept it.
    """
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    with pytest.raises(RejectedImage):
        sanitise(svg)


def test_rejects_gif() -> None:
    with pytest.raises(RejectedImage):
        sanitise(make_image("GIF"))


@pytest.mark.parametrize(
    "payload",
    [b"", b"not an image at all", b"%PDF-1.7\n", b"MZ\x90\x00", b"\x00" * 64],
)
def test_rejects_non_images(payload: bytes) -> None:
    with pytest.raises(RejectedImage):
        sanitise(payload)


def test_type_comes_from_magic_bytes_not_the_name() -> None:
    """A JPEG called .png is still a JPEG.

    Nothing in this path consults the filename or the Content-Type header,
    both of which the client supplies.
    """
    assert sniff_format(make_image("JPEG")) == "JPEG"
    assert sniff_format(make_image("PNG")) == "PNG"
    assert sniff_format(make_image("WEBP")) == "WEBP"
    assert sniff_format(b"GIF89a" + b"\x00" * 32) is None


# ─── The re-encode, and what it destroys ────────────────────────────


def test_strips_exif_including_gps() -> None:
    """The reason every upload is re-encoded rather than stored as sent.

    A phone writes GPS coordinates into every photo. A member posting a
    picture taken at home must not thereby publish their address to two
    thousand people.
    """
    original = Image.new("RGB", (200, 150), (10, 20, 30))
    exif = original.getexif()
    exif[0x010F] = "Some Camera Co"  # Make

    # GPSInfo (0x8825) is a pointer to its own IFD, not a scalar tag, so it
    # has to be populated through get_ifd — which is also how a real camera
    # writes it. These are South Kensington.
    gps = exif.get_ifd(0x8825)
    gps[1] = "N"
    gps[2] = (51.0, 29.0, 57.57)
    gps[3] = "W"
    gps[4] = (0.0, 10.0, 40.41)

    buf = io.BytesIO()
    original.save(buf, format="JPEG", exif=exif)
    before = buf.getvalue()
    assert b"Some Camera Co" in before  # present before
    assert b"exif" in before.lower()

    cleaned = sanitise(before).data

    assert b"Some Camera Co" not in cleaned
    with Image.open(io.BytesIO(cleaned)) as out:
        # No EXIF chunk at all, rather than an empty one. Checked via
        # info rather than getexif(): on a WebP carrying no EXIF, Pillow
        # raises trying to seek a file object it never opened.
        assert "exif" not in out.info


def test_neutralises_a_polyglot_file() -> None:
    """A valid JPEG with an archive appended is a real smuggling technique.

    Only decoded pixels are carried forward, so trailing bytes cannot
    survive — there is no code path that copies them.
    """
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("payload.txt", "smuggled-content-marker")

    polyglot = make_image("JPEG") + archive.getvalue()
    assert b"smuggled-content-marker" in polyglot

    assert b"smuggled-content-marker" not in sanitise(polyglot).data


def test_downscales_to_the_edge_cap_and_reports_real_dimensions() -> None:
    result = sanitise(make_image("JPEG", size=(4000, 3000)))
    assert max(result.width, result.height) == MAX_EDGE
    with Image.open(io.BytesIO(result.data)) as out:
        assert (out.width, out.height) == (result.width, result.height)


def test_leaves_small_images_alone() -> None:
    result = sanitise(make_image("PNG", size=(320, 240)))
    assert (result.width, result.height) == (320, 240)


def test_handles_transparency_without_failing() -> None:
    buf = io.BytesIO()
    Image.new("RGBA", (100, 100), (255, 0, 0, 128)).save(buf, format="PNG")
    assert sanitise(buf.getvalue()).width == 100


def test_handles_palette_images() -> None:
    """Palette-mode PNGs cannot be saved as WebP directly.

    Without the explicit conversion this raises at save time, which would
    reject a perfectly ordinary screenshot.
    """
    buf = io.BytesIO()
    Image.new("P", (100, 100)).save(buf, format="PNG")
    assert sanitise(buf.getvalue()).width == 100


# ─── Resource-exhaustion defences ───────────────────────────────────


def test_rejects_a_decompression_bomb() -> None:
    """A small file that expands to an enormous bitmap.

    Pillow's guard only applies if MAX_IMAGE_PIXELS is set to something
    sane, which is why images.py pins it rather than inheriting a default.
    """
    buf = io.BytesIO()
    # ~50k of PNG that decodes to 100M pixels.
    Image.new("L", (10_000, 10_000)).save(buf, format="PNG")
    assert len(buf.getvalue()) < 200_000

    with pytest.raises(RejectedImage):
        sanitise(buf.getvalue())


def test_rejects_absurd_dimensions() -> None:
    buf = io.BytesIO()
    Image.new("L", (20_000, 10)).save(buf, format="PNG")
    with pytest.raises(RejectedImage):
        sanitise(buf.getvalue())


def test_rejects_a_truncated_image() -> None:
    truncated = make_image("JPEG")[:200]
    with pytest.raises(RejectedImage):
        sanitise(truncated)


def test_rejects_images_too_small_to_be_content() -> None:
    with pytest.raises(RejectedImage):
        sanitise(make_image("PNG", size=(4, 4)))
