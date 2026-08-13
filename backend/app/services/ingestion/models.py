from dataclasses import dataclass, field
from typing import Any


@dataclass
class DocumentElement:
    element_type: str
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedDocument:
    content_type: str
    parser_name: str
    elements: list[DocumentElement]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class IngestionChunk:
    text: str
    title: str = ""
    section: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
