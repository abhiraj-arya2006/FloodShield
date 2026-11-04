"""The one-time lock must stop a second attempt. Uses a temporary path, never the real lock."""

import pytest

from floodshield.evaluation.once_lock import AlreadyRunError, acquire_once_lock


def test_second_attempt_is_refused_and_keeps_the_first_content(tmp_path):
    lock = tmp_path / "run.lock"
    acquire_once_lock(lock, "first")
    with pytest.raises(AlreadyRunError):
        acquire_once_lock(lock, "second")
    assert lock.read_text() == "first"
