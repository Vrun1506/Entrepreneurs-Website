"""CV document validation.

Unlike images.py, this module never re-encodes anything — a CV's stored
bytes ARE the original upload, because the eventual matching pipeline
(cv-matchmaker-spec.md, principle 6: "pipeline must be re-runnable from
stored text") needs to be able to go back to the source file, and because
re-encoding a PDF or DOCX in any real sense means re-authoring it, which is
not a thing this gateway is in the business of doing.

That makes this the higher-trust path of the two the gateway serves: an
image's pixels are the only thing that survives sanitise(), but a CV's
bytes are stored verbatim, and whoever downloads it — the member
themselves, or an admin — gets exactly what was uploaded. The checks below
exist to keep that file from being something other than what it claims:

  * magic bytes decide the format, never Content-Type or filename — the
    same rule images.py follows, for the same reason.
  * .docm is rejected even though it is byte-for-byte a valid .docx
    container: Office macros are executable code, and nothing about
    "upload your CV" should be able to deliver a macro payload to whoever
    opens it next.
  * a zip bomb (a small file that expands enormously) is rejected by
    comparing declared uncompressed size against the compressed size,
    mirroring the pixel-count guard images.py applies to images.
  * an encrypted PDF is rejected — this gateway has no password to open it
    with, and a member cannot review or the matcher parse content it can't
    read either.

Deliberately NOT handled here: PDF embedded JavaScript / launch actions.
Inert in every context this file is actually opened in (the member's own
browser, or an admin's, via a signed URL with Content-Disposition:
attachment) and stripping it would mean re-authoring the PDF, which
conflicts with storing the original bytes verbatim. Accepted and
documented, not silently ignored — see the security section of this
project's plan.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

MIN_BYTES = 256  # Below this nothing resembling a real CV can exist.

# Zip bombs expand by orders of magnitude. A real DOCX (already-compressed
# XML plus small embedded media) rarely exceeds 10x; 60x leaves headroom
# for a document that is mostly a few uncompressed images while still
# catching a file engineered to blow up in memory when the gateway (or
# anything downstream) unzips it.
MAX_ZIP_EXPANSION_RATIO = 60


class RejectedDocument(Exception):
    """The upload is not something we are prepared to store."""


@dataclass(frozen=True)
class ValidatedDocument:
    data: bytes
    content_type: str
    extension: str  # for cv_original_filename fallback / logging only


_PDF_CONTENT_TYPE = "application/pdf"
_DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def _validate_pdf(data: bytes) -> None:
    if b"/Encrypt" in data:
        # A real encrypted PDF's trailer references an /Encrypt object; a
        # PDF that merely mentions the string in body text is vanishingly
        # unlikely for a CV and rejecting the false positive costs the
        # member a re-export, not a security gap the other direction.
        raise RejectedDocument(
            "That PDF is password-protected. Please upload an unprotected copy."
        )


def _validate_docx(data: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = set(zf.namelist())

            if "word/document.xml" not in names:
                # A bare zip signature also matches .jar, .apk and .xlsx —
                # this is the check that it is actually a Word document.
                raise RejectedDocument("That file isn't a Word document.")

            if "word/vbaProject.bin" in names:
                raise RejectedDocument(
                    "Macro-enabled Word documents (.docm) aren't accepted. "
                    "Please save as a plain .docx."
                )

            total_compressed = 0
            total_uncompressed = 0
            for info in zf.infolist():
                total_compressed += info.compress_size
                total_uncompressed += info.file_size
                # Per-entry ratio too: a single crafted entry inside an
                # otherwise-normal-looking archive is the classic zip-bomb
                # shape, and the aggregate check alone can miss it if the
                # rest of the archive is mostly incompressible.
                if info.compress_size > 0 and (
                    info.file_size / info.compress_size > MAX_ZIP_EXPANSION_RATIO
                ):
                    raise RejectedDocument("That file could not be read.")

            if total_compressed > 0 and (
                total_uncompressed / total_compressed > MAX_ZIP_EXPANSION_RATIO
            ):
                raise RejectedDocument("That file could not be read.")

    except zipfile.BadZipFile as exc:
        raise RejectedDocument("That file could not be read.") from exc


def sanitise(data: bytes) -> ValidatedDocument:
    """Validate a CV upload and return it, unmodified, for storage.

    Raises RejectedDocument for anything that fails a check above. The
    returned bytes are always identical to the input — this function's
    job is deciding whether to store them, never changing them.
    """
    if len(data) < MIN_BYTES:
        raise RejectedDocument("That file is too small to be a CV.")

    if data.startswith(b"%PDF-"):
        _validate_pdf(data)
        return ValidatedDocument(data=data, content_type=_PDF_CONTENT_TYPE, extension="pdf")

    if data.startswith(b"PK\x03\x04"):
        _validate_docx(data)
        return ValidatedDocument(data=data, content_type=_DOCX_CONTENT_TYPE, extension="docx")

    raise RejectedDocument("Only PDF or Word (.docx) files are accepted.")
