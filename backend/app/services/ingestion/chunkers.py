import re
from abc import ABC, abstractmethod

from app.services.ingestion.models import DocumentElement, IngestionChunk, ParsedDocument


def _split_long(text: str, size: int, overlap: int) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end].strip())
        if end == len(text):
            break
        start = max(end - overlap, start + 1)
    return [chunk for chunk in chunks if chunk]


class BaseChunker(ABC):
    @abstractmethod
    def chunk(self, document: ParsedDocument, size: int, overlap: int) -> list[IngestionChunk]:
        raise NotImplementedError


class TextChunker(BaseChunker):
    def chunk(self, document: ParsedDocument, size: int, overlap: int) -> list[IngestionChunk]:
        text = "\n\n".join(element.text for element in document.elements)
        sections = re.split(r"(?=^#{1,6}\s+|^第[^\n]{1,30}(?:章|节|部分))", text, flags=re.MULTILINE)
        result = []
        for section in sections:
            section = section.strip()
            if not section:
                continue
            first_line = section.splitlines()[0].lstrip("# ").strip()
            for part in _split_long(section, size, overlap):
                result.append(IngestionChunk(part, first_line, first_line))
        return result


class DocumentChunker(BaseChunker):
    def chunk(self, document: ParsedDocument, size: int, overlap: int) -> list[IngestionChunk]:
        headings: list[tuple[int, str]] = []
        result, buffer, metadata = [], [], {}

        def flush():
            nonlocal buffer, metadata
            if not buffer:
                return
            section = " / ".join(title for _, title in headings)
            for part in _split_long("\n\n".join(buffer), size, overlap):
                result.append(IngestionChunk(part, section, section, dict(metadata)))
            buffer, metadata = [], {}

        for element in document.elements:
            if element.element_type == "heading":
                flush()
                level = int(element.metadata.get("level", 1))
                headings[:] = [(old_level, title) for old_level, title in headings if old_level < level]
                headings.append((level, element.text))
                continue
            if element.element_type == "table":
                flush()
                section = " / ".join(title for _, title in headings)
                text = f"章节：{section}\n表格：\n{element.text}" if section else f"表格：\n{element.text}"
                for part in _split_long(text, size, overlap):
                    result.append(IngestionChunk(part, section, section, dict(element.metadata)))
                continue
            candidate = "\n\n".join(buffer + [element.text])
            if buffer and len(candidate) > size:
                flush()
            buffer.append(element.text)
            for key in ("page", "bbox"):
                if key in element.metadata:
                    metadata[key] = element.metadata[key]
        flush()
        return result


class CodeChunker(BaseChunker):
    def chunk(self, document: ParsedDocument, size: int, overlap: int) -> list[IngestionChunk]:
        result = []
        language = document.metadata.get("language", "")
        line_size = max(size, 1200)
        for element in document.elements:
            symbol = element.metadata.get("symbol_name", "")
            for part in _split_long(element.text, line_size, min(overlap, 200)):
                metadata = {**element.metadata, "language": language,
                            "symbol_type": element.element_type}
                result.append(IngestionChunk(part, symbol, symbol, metadata))
        return result
