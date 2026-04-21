import io
import re
import unicodedata

import docx
import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            extracted = page.extract_text() or ""
            text_parts.append(extracted)
    return "\n".join(text_parts)


def extract_text_from_docx(file_bytes: bytes) -> str:
    document = docx.Document(io.BytesIO(file_bytes))
    lines = [paragraph.text for paragraph in document.paragraphs]
    return "\n".join(lines)


def clean_extracted_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.encode("utf-8", errors="ignore").decode("utf-8")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized
