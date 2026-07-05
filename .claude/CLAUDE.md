# DocuFetch Graph - Project Brain

## What are we building 

**docuFetch_graph** is a personal LLM Wiki, it ingests folders, creates graph based linkages of concepts in the files. The concept linkages can between concepts in two different files as well. A simple web chat UI that lets the user point to the folder directory, the application creates a graph based view of the concepts, a chat module besides the graph view where the user can ask questions & the application shows in real time how the LLM is actually fetching the data (actual graph traversals); the final answer can be just 4-5 line summary using Claude - Haiku. If no relevant document is found, it says so explicitly.

**NOTE** : We first create the backend, test it out, then we go on to create the frontend

## Tech Stack

- **Backend:** Python, FastAPI
- **Frontend:** React, Tailwind CSS
- **LLM:** Claude (Anthropic), OpenRouter API

## File Structure

```
docuFetch/
├── .claude/  <- You are here
├── backend/
│   ├── ingestion/      # folder scanning, chunking etc
│   ├── ...           # other backend modules (api, retrieval, etc.)
├── frontend/   # React + Tailwind web chat UI
├── requirements.txt
├── docs/
    ├── backend/
        ├── grill_doc_roadmap.md    <- Summary of the plan Q and A.
        ├── prd.md                  <- Product requirements document
        ├── features.md             <- PRD converted to full list of features
        ├── issues.md               <- features converted to issues
        ├── tasks.md                <- written by the agent, tracker for what tasks lie ahead
        ├── tests.md                <- Entire test plan for the backend
        ├── tests/                  <- Entire test suite for the backend
        ├── context.md              <- Memory context for the agents, stores all the important decisions.
        ├── backend_context.md      <-  Memory context for the agents, for backend work
        ├── backend_TASKS.md        <- written by the backend orchestrator agent, on to track the feature/issue builds
        ├── orchestrator_plan       <- written by the orchestrator planner on how we build the backend
        ├── agent-briefs/           <- agent briefs for the worker agents
        ├── agent-reports/          <- agent reports from the worker agents
    ├── frontend/
        ├── grill_doc_roadmap.md    <- Summary of the plan Q and A.
        ├── prd.md                  <- Product requirements document
        ├── features.md             <- PRD converted to full list of features
        ├── issues.md               <- features converted to issues
        ├── tasks.md                <- written by the agent, tracker for what tasks lie ahead
        ├── tests.md                <- Entire test plan for the backend
        ├── tests/                  <- Entire test suite for the backend
        ├── context.md              <- Memory context for the agents, stores all the important decisions.
        ├── frontend_context.md      <-  Memory context for the agents, for frontend work
        ├── frontend_TASKS.md        <- written by the frontend orchestrator agent, on to track the feature/issue builds
        ├── orchestrator_plan       <- written by the orchestrator planner on how we build the frontend
        ├── agent-briefs/           <- agent briefs for the worker agents
        ├── agent-reports/          <- agent reports from the worker agents
├── README.md
```

## Coding Guidelines

- For every function there must be a docstring explaining what the function actually does
- For every code file created, there must be a description at the top, the description should e about what the code in the file does.
- **Think Before Coding** -> Don't assume. Don't hide confusion. Surface tradeoffs, use a scratchpad to see different possible solutions.
- **Simplicity First** -> Minimum code that solves the problem. Nothing speculative.

    - No features beyond what was asked.
    - No abstractions for single-use code.
    - No "flexibility" or "configurability" that wasn't requested.
    - No error handling for impossible scenarios.
    - If you write 200 lines and it could be 50, rewrite it.
- **Surgical Changes** -> Touch only what you must. Clean up only your own mess. When editing existing code:

    - Don't "improve" adjacent code, comments, or formatting.
    - Don't refactor things that aren't broken.
    - Match existing style, even if you'd do it differently.
    - If you notice unrelated dead code, mention it - don't delete it.

    **When your changes create orphans:**

    - Remove imports/variables/functions that YOUR changes made unused.
    - Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.
- **Goal-Driven Execution** -> Define success criteria. Loop until verified.

## Python Environment

The `.gitignore` is configured for Python with support for common tooling:

- **Virtual environments:** `.venv`, `venv/`, `env/` (standard `venv` or `uv`)
- **Package managers:** pip, pipenv, poetry, pdm, uv, pixi
- **Linting/typing:** ruff (`.ruff_cache/`), mypy, pytype, pyre
- **Testing:** pytest (`.pytest_cache/`), tox, coverage

Once the project is set up, typical commands will likely follow these patterns:

```bash
# Install dependencies
uv install -r requirements.txt
# or: uv sync / poetry install

# Run tests
pytest

# Run a single test
pytest tests/path/to/test_file.py::test_name

# Lint
ruff check .
ruff format .
```

## Running the Application

Start the backend + frontend with:

```bash
uvicorn server:app --port 8000 --reload 
```
*Keep on adding required information, gotchas for the project*