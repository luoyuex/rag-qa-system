from pathlib import Path

from app.services.ingestion.chunkers import CodeChunker, DocumentChunker, TextChunker
from app.services.ingestion.models import IngestionChunk, ParsedDocument
from app.services.ingestion.parsers import CODE_LANGUAGES, CodeParser, PdfParser, TextParser, WordParser


PARSERS = {
    ".txt": TextParser(),
    ".md": TextParser(),
    ".docx": WordParser(),
    ".pdf": PdfParser(),
    **{extension: CodeParser() for extension in CODE_LANGUAGES},
}

CHUNKERS = {
    "text": TextChunker(),
    "document": DocumentChunker(),
    "code": CodeChunker(),
}


def supported_extensions() -> set[str]:
    return set(PARSERS)


def parse_file(path: Path, original_filename: str) -> ParsedDocument:
    extension = Path(original_filename).suffix.lower()
    parser = PARSERS.get(extension)
    if parser is None:
        raise ValueError(f"不支持的文件类型：{extension or '无扩展名'}")
    parsed = parser.parse(path)
    parsed.metadata.update({"filename": original_filename, "file_extension": extension})
    return parsed


def ingest_file(path: Path, original_filename: str, size: int, overlap: int) -> tuple[ParsedDocument, list[IngestionChunk]]:
    parsed = parse_file(path, original_filename)
    chunks = CHUNKERS[parsed.content_type].chunk(parsed, size, overlap)
    if not chunks:
        raise ValueError("文件中没有可索引的有效内容")
    return parsed, chunks
