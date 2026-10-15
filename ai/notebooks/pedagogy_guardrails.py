"""Pedagogy guardrails runner (alias for lint.py)."""
import sys
from pathlib import Path

lint_path = Path(__file__).resolve().parent / "lint.py"
with open(lint_path) as f:
    code = compile(f.read(), str(lint_path), "exec")
    exec(code, {"__name__": "__main__", "__file__": str(lint_path)})
