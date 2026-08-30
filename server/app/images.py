"""Image sanitisation.

This module is the security boundary of the whole upload path. Everything
that reaches it is attacker-controlled bytes from a browser, and everything
that leaves it is written to a container the member-facing feed renders
from. The rules below are not defensive-programming garnish — each one
closes a specific, documented attack.

It deliberately holds no I/O: `sanitise` takes bytes and returns bytes, so
every rule here is directly testable without Azure, FastAPI, or a network.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageFile

# A decompression bomb is a small file that expands to an enormous bitmap —
# a ~50KB PNG can decode to tens of gigabytes and take the process with it.
# Pillow warns above MAX_IMAGE_PIXELS and raises above twice it; pinning the
# value explicitly means we are not relying on whatever the installed
# version happens to default to.
Image.MAX_IMAGE_PIXELS = 40_000_000  # ~40MP, far above any real photo

# Refuse to reconstruct partial images. A truncated upload should be an
# error, not a half-decoded picture we then re-encode and store.
ImageFile.LOAD_TRUNCATED_IMAGES = False

# Longest edge after re-encoding. A feed column is ~720px wide, so 1600
# covers 2x displays with room to spare and nothing larger is ever useful.
MAX_EDGE = 1600
WEBP_QUALITY = 82

MIN_EDGE = 16
MAX_INPUT_EDGE = 12_000


class RejectedImage(Exception):
    """The upload is not something we are prepared to store."""


@dataclass(frozen=True)
class SanitisedImage:
    data: bytes
    width: int
    height: int


# Magic-byte signatures for the three formats we accept. The Content-Type
# header and the filename are never consulted: both are supplied by the
# client, and "trust the extension" is how a .jpg containing something else
# gets stored and served.
_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "PNG"),
)


def sniff_format(data: bytes) -> str | None:
    """Identify the format from the leading bytes, or None if unrecognised.

    SVG is the notable absence and it is deliberate: an SVG is an XML
    document that can carry <script>, so serving one from our own origin is
    a stored-XSS primitive. It is the single most common mistake in image
    upload handling, and the fix is not to sanitise SVG — it is not to
    accept it. GIF is excluded too: nothing on the feed needs animation,
    and every accepted format is one more decoder to trust.
    """
    for signature, name in _SIGNATURES:
        if data.startswith(signature):
            return name

    # WebP is RIFF-framed: "RIFF" <4-byte length> "WEBP".
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"

    return None


def sanitise(data: bytes) -> SanitisedImage:
    """Decode, bound, and re-encode an uploaded image.

    Returns freshly encoded WebP bytes. The original bytes are never
    stored, and that is the point of the whole function:

      * EXIF is gone, including the GPS coordinates a phone camera writes
        into every photo. A member posting a picture taken at home should
        not be publishing their address to 2,000 people.
      * A polyglot file — a valid JPEG with a ZIP or a script appended —
        does not survive, because only the decoded pixels are carried
        forward and the trailing bytes are never copied.
      * The output is one predictable format at a bounded size, so the
        rendering path has exactly one decoder to worry about.
    """
    fmt = sniff_format(data)
    if fmt is None:
        raise RejectedImage("Only JPEG, PNG and WebP images are accepted.")

    try:
        with Image.open(io.BytesIO(data)) as img:
            # Pillow is lazy: open() reads the header, and a malformed or
            # hostile file may not fail until the pixels are actually read.
            img.load()

            if img.width < MIN_EDGE or img.height < MIN_EDGE:
                raise RejectedImage("That image is too small to display.")
            if img.width > MAX_INPUT_EDGE or img.height > MAX_INPUT_EDGE:
                raise RejectedImage("That image's dimensions are too large.")

            # Flatten to a colour mode WebP can encode. Palette and
            # grayscale-with-alpha images otherwise fail at save time.
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

            img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

            out = io.BytesIO()
            # No exif= and no icc_profile= argument, so neither is carried
            # across. This is the line that strips location data.
            img.save(out, format="WEBP", quality=WEBP_QUALITY, method=4)
            return SanitisedImage(data=out.getvalue(), width=img.width, height=img.height)

    except RejectedImage:
        raise
    except Image.DecompressionBombError as exc:
        raise RejectedImage("That image is too large to process.") from exc
    except Exception as exc:  # noqa: BLE001 — any decoder failure is a rejection
        raise RejectedImage("That image could not be read.") from exc
