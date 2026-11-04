"""A lock file that can be created once only, for the one-time test run."""

import os
from pathlib import Path


class AlreadyRunError(RuntimeError):
    """The lock file exists, so the one-time run has already been started."""


def acquire_once_lock(path: Path, content: str) -> None:
    """Create ``path`` atomically; raise AlreadyRunError if it exists. Never removes it."""
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o444)
    except FileExistsError as exc:
        raise AlreadyRunError(f"{path} already exists") from exc
    with os.fdopen(fd, "w") as f:
        f.write(content)
