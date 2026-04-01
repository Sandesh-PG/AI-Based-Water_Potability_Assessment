"""Simple local RAG pipeline for PDF documents.

Features:
- Reads PDF text with pdfplumber
- Splits text into 500-token chunks with 50-token overlap
- Embeds chunks using sentence-transformers/all-MiniLM-L6-v2
- Stores vectors and documents in a local persistent ChromaDB collection
- Exposes query_knowledge_base(query: str, n_results: int) -> list[str]
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

import chromadb
import pdfplumber
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer

MODEL_NAME = "all-MiniLM-L6-v2"
DEFAULT_COLLECTION_NAME = "knowledge_base"
DEFAULT_PERSIST_DIR = "./chroma_db"
CHUNK_SIZE_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 50

_model: Optional[SentenceTransformer] = None
_tokenizer = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def _get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
    return _tokenizer


def _get_collection(
    collection_name: str = DEFAULT_COLLECTION_NAME,
    persist_directory: str = DEFAULT_PERSIST_DIR,
):
    client = chromadb.PersistentClient(path=persist_directory)
    return client.get_or_create_collection(name=collection_name)


def extract_pdf_text(pdf_path: str, show_progress: bool = False) -> str:
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            if show_progress:
                print(f"\rExtracting pages: {i+1}/{total}", end="", flush=True)
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(page_text)
    if show_progress:
        print()  
    return "\n\n".join(pages)


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE_TOKENS,
    overlap: int = CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    """Chunk text by model tokenizer tokens with overlap."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if overlap < 0:
        raise ValueError("overlap must be >= 0")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    tokenizer = _get_tokenizer()
    token_ids = tokenizer.encode(text, add_special_tokens=False)

    if not token_ids:
        return []

    stride = chunk_size - overlap
    chunks: list[str] = []

    for start in range(0, len(token_ids), stride):
        end = start + chunk_size
        chunk_ids = token_ids[start:end]
        if not chunk_ids:
            continue

        chunk_text_value = tokenizer.decode(chunk_ids, skip_special_tokens=True).strip()
        if chunk_text_value:
            chunks.append(chunk_text_value)

        if end >= len(token_ids):
            break

    return chunks


def ingest_pdf_to_knowledge_base(
    pdf_path: str,
    collection_name: str = DEFAULT_COLLECTION_NAME,
    persist_directory: str = DEFAULT_PERSIST_DIR,
    show_progress: bool = False,    
) -> int:
    """Read, chunk, embed, and store a PDF into local ChromaDB.

    Returns number of chunks indexed.
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    raw_text = extract_pdf_text(str(path), show_progress=show_progress)
    chunks = chunk_text(raw_text)

    if not chunks:
        return 0

    collection = _get_collection(collection_name, persist_directory)

    # Replace existing chunks from the same source file to avoid duplicates.
    collection.delete(where={"source": str(path.resolve())})

    model = _get_model()
    embeddings = model.encode(chunks, convert_to_numpy=True).tolist()

    source_hash = hashlib.sha1(str(path.resolve()).encode("utf-8")).hexdigest()[:12]
    ids = [f"{source_hash}_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "source": str(path.resolve()),
            "chunk_index": i,
        }
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    return len(chunks)


def query_knowledge_base(
    query: str,
    n_results: int,
    collection_name: str = DEFAULT_COLLECTION_NAME,
    persist_directory: str = DEFAULT_PERSIST_DIR,
) -> list[str]:
    """Query the local ChromaDB knowledge base and return top chunk texts."""
    if not query or not query.strip():
        return []
    if n_results <= 0:
        return []

    collection = _get_collection(collection_name, persist_directory)
    model = _get_model()

    query_embedding = model.encode([query], convert_to_numpy=True)[0].tolist()

    result = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        include=["documents"],
    )

    documents = result.get("documents", [])
    if not documents:
        return []

    return [doc for doc in documents[0] if isinstance(doc, str)]


if __name__ == "__main__":
    # Example usage:
    # 1) ingest_pdf_to_knowledge_base("sample.pdf")
    # 2) print(query_knowledge_base("What is this PDF about?", 3))
    pass
