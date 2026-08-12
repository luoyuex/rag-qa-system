import re
from dataclasses import dataclass
from typing import List


# ============================================================
# Chunk 数据结构
# ============================================================

@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    title: str
    section: str
    chunk_index: int
    text: str


# ============================================================
# 判断是否为标题
# ============================================================

def is_title(line: str) -> bool:
    """
    判断一行是否为知识库章节标题。

    例如：

    第一部分：水果采购基础知识
    第二部分：进口蓝莓
    第十部分：蛋糕店客户采购场景
    """

    return bool(
        re.match(
            r"^第[一二三四五六七八九十百千万]+部分：",
            line.strip()
        )
    )


# ============================================================
# 清理文本
# ============================================================

def clean_text(text: str) -> str:

    # Windows 换行
    text = text.replace("\r\n", "\n")

    # 连续空格
    text = re.sub(r"[ \t]+", " ", text)

    # 连续空行最多保留一个
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ============================================================
# 按标题切分章节
# ============================================================

def split_sections(text: str):
    """
    将整个 TXT 切成：

    [
        {
            "title": "...",
            "content": "..."
        }
    ]
    """

    lines = text.split("\n")

    sections = []

    current_title = "未分类"
    current_lines = []

    for line in lines:

        line = line.strip()

        if not line:
            continue

        # 忽略分隔线
        if re.match(r"^=+$", line):
            continue

        if is_title(line):

            # 保存上一章节
            if current_lines:

                sections.append({
                    "title": current_title,
                    "content": "\n".join(current_lines)
                })

            current_title = line
            current_lines = []

        else:
            current_lines.append(line)

    # 保存最后一个章节
    if current_lines:

        sections.append({
            "title": current_title,
            "content": "\n".join(current_lines)
        })

    return sections


# ============================================================
# 按自然段切分
# ============================================================

def split_paragraphs(text: str) -> List[str]:

    paragraphs = re.split(
        r"\n\s*\n",
        text
    )

    return [
        p.strip()
        for p in paragraphs
        if p.strip()
    ]


# ============================================================
# 长文本二次切分
# ============================================================

def split_long_text(
    text: str,
    chunk_size: int,
    overlap: int
) -> List[str]:

    if len(text) <= chunk_size:
        return [text]

    chunks = []

    start = 0
    text_length = len(text)

    while start < text_length:

        end = start + chunk_size

        chunk = text[start:end]

        chunks.append(
            chunk.strip()
        )

        # 下一段往回 overlap
        start = end - overlap

    return chunks


# ============================================================
# 创建 Chunk
# ============================================================

def create_chunks(
    text: str,
    document_id: str,
    chunk_size: int = 800,
    overlap: int = 120
) -> List[Chunk]:

    text = clean_text(text)

    sections = split_sections(text)

    chunks = []

    chunk_index = 0

    for section_index, section in enumerate(sections):

        title = section["title"]
        content = section["content"]

        paragraphs = split_paragraphs(content)

        current_chunk = ""

        for paragraph in paragraphs:

            # ------------------------------------------------
            # 如果当前段落本身超过 Chunk Size
            # ------------------------------------------------

            if len(paragraph) > chunk_size:

                # 先保存之前累计的内容
                if current_chunk:

                    chunks.append(
                        Chunk(
                            chunk_id=f"{document_id}_{chunk_index}",
                            document_id=document_id,
                            title=title,
                            section=title,
                            chunk_index=chunk_index,
                            text=current_chunk.strip()
                        )
                    )

                    chunk_index += 1
                    current_chunk = ""

                # 长段落继续切
                long_chunks = split_long_text(
                    paragraph,
                    chunk_size,
                    overlap
                )

                for item in long_chunks:

                    chunks.append(
                        Chunk(
                            chunk_id=f"{document_id}_{chunk_index}",
                            document_id=document_id,
                            title=title,
                            section=title,
                            chunk_index=chunk_index,
                            text=item
                        )
                    )

                    chunk_index += 1

                continue

            # ------------------------------------------------
            # 当前 Chunk 为空
            # ------------------------------------------------

            if not current_chunk:

                current_chunk = paragraph
                continue

            # ------------------------------------------------
            # 尝试继续合并段落
            # ------------------------------------------------

            candidate = (
                current_chunk
                + "\n\n"
                + paragraph
            )

            if len(candidate) <= chunk_size:

                current_chunk = candidate

            else:

                # 当前 Chunk 已经不能继续放
                chunks.append(
                    Chunk(
                        chunk_id=f"{document_id}_{chunk_index}",
                        document_id=document_id,
                        title=title,
                        section=title,
                        chunk_index=chunk_index,
                        text=current_chunk.strip()
                    )
                )

                chunk_index += 1

                # 保留尾部 overlap
                if overlap > 0:

                    overlap_text = current_chunk[-overlap:]

                    current_chunk = (
                        overlap_text
                        + "\n\n"
                        + paragraph
                    )

                else:

                    current_chunk = paragraph

        # ----------------------------------------------------
        # 保存章节最后一个 Chunk
        # ----------------------------------------------------

        if current_chunk:

            chunks.append(
                Chunk(
                    chunk_id=f"{document_id}_{chunk_index}",
                    document_id=document_id,
                    title=title,
                    section=title,
                    chunk_index=chunk_index,
                    text=current_chunk.strip()
                )
            )

            chunk_index += 1

    return chunks
