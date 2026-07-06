---
name: grill-me
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases. The output of this excercise is to create a document which will summarise the entire conversation.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, WebSearch, Bash(git *), Bash(mv *)
---

## Tasks 

- Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

- Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

- If a question can be answered by exploring the codebase, explore the codebase instead.

## Ouput
- Create an exhaustive discussion roadmap document save as **docs/frontend/grill_doc_roadmap.md** or **docs/frontend/grill_doc_roadmap.md**