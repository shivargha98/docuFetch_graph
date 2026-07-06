"""
API/contract tests for the folder-configuration endpoint: setting/switching
the watched folder from the UI.

OPEN QUESTION (Issue 15): the exact endpoint path, HTTP method, and
request/response payload shape are not yet decided. Tests below reference a
placeholder path/method (marked `# TODO`) that must be replaced once the
contract is finalized; the shape-specific test is skipped until then.
"""
import pytest

# TODO(Issue 15): replace with the finalized endpoint path/method once decided.
FOLDER_CONFIG_ENDPOINT = "/config/folder"  # placeholder


def test_first_load_reflects_watch_folder_as_default(fastapi_test_client):
    """
    Given a freshly started backend with WATCH_FOLDER set in .env and no
    prior folder selection,
    when the folder-configuration endpoint is called,
    the response should reflect WATCH_FOLDER as the current/default folder.

    Source: Feature: Folder Configuration Endpoint — criterion 1; Issue 15 — criterion 1
    """
    raise NotImplementedError


def test_submitting_new_folder_path_tears_down_and_restarts_watcher(fastapi_test_client, tmp_path):
    """
    Given a backend actively watching folder A,
    when a request is submitted to switch to folder B,
    the watcher/hash-store for folder A should be torn down and a fresh one
    started scoped to folder B.

    Source: Feature: Folder Configuration Endpoint — criterion 2; Issue 15 — criterion 2
    """
    raise NotImplementedError


def test_submitting_new_folder_path_resets_chat_session(fastapi_test_client, tmp_path):
    """
    Given an active chat session with turn history for folder A,
    when a request switches the folder to B,
    the session associated with the new folder should have no carried-over
    turn history.

    Source: Feature: Folder Configuration Endpoint — criterion 3; Issue 15 — criterion 3
    """
    raise NotImplementedError


def test_submitting_invalid_folder_path_returns_error_without_crashing(fastapi_test_client):
    """
    Given a running backend,
    when a request submits a non-existent/invalid path,
    the response should be an error (4xx) rather than a crash or hang, and
    the backend should continue serving subsequent requests normally.

    Source: Feature: Folder Configuration Endpoint — criterion 4; Issue 15 — criterion 4
    """
    raise NotImplementedError


@pytest.mark.skip(
    reason="OPEN QUESTION (Issue 15): exact endpoint path/method/payload shape "
    "undecided. Replace FOLDER_CONFIG_ENDPOINT placeholder and payload shape "
    "below once settled, then unskip."
)
def test_folder_config_request_response_shape_matches_finalized_contract(fastapi_test_client):
    """
    Given a finalized folder-configuration endpoint contract,
    when a request is made against it,
    the request/response payload shape should match the finalized contract.

    OPEN QUESTION (Issue 15): placeholder only until the endpoint contract is
    decided.

    Source: Issue 15 — caveat (open question: exact endpoint path/payload shape)
    """
    raise NotImplementedError
