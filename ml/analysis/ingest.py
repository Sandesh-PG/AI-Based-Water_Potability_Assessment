"""CLI entrypoint for indexing a PDF into the local RAG knowledge base."""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from .rag_pipeline import ingest_pdf_to_knowledge_base
except ImportError:
    from rag_pipeline import ingest_pdf_to_knowledge_base


DEFAULT_PDF_PATH = "../../WHO_Guidelines.pdf"


def _resolve_pdf_path(pdf_path: str) -> Path:
    candidate = Path(pdf_path)
    if candidate.is_absolute():
        return candidate
    return (Path(__file__).resolve().parent / candidate).resolve()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a PDF into local ChromaDB knowledge base."
    )
    parser.add_argument(
        "--pdf_path",
        type=str,
        default=DEFAULT_PDF_PATH,
        help="Path to PDF file (default: ../../WHO_Guidelines.pdf)",
    )
    args = parser.parse_args()

    resolved_pdf_path = _resolve_pdf_path(args.pdf_path)
    chunks_indexed = ingest_pdf_to_knowledge_base(
        pdf_path=str(resolved_pdf_path),
        show_progress=True,
    )

    print(f"Total chunks indexed: {chunks_indexed}")


if __name__ == "__main__":
    main()
