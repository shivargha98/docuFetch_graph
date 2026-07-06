---
name: prd-generator
description: Turn a user interview doc or a roadmap document into a PRD and create a prd.md document in a designated folder as specified by the user — no interview, just synthesis of what you've already discussed.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, WebSearch, Bash(git *), Bash(mv *)
---

This skill takes in the a user interview doc or a roadmap document and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

## Important Folder Structure

- If you are prompted to build for the backend, your docs folder path is [docs/backend](../../../docs/backend/)
- If you are prompted to build for the backend, your docs folder path is [docs/frontend](../../../docs/frontend/)

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the PRD using the template below, then create a prd.md and save it to where the user wants to

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>


### 6. Save

Save to the same directory as the PRD (`docs/backend/features.md` or `docs/frontend/features.md`), unless the user says otherwise.

After saving, tell the user: how many features were created, which modules they cover, and flag any user stories that had no clear feature match (if any).Save this information in `context.md` file either in the backend or the frontend folder depending on which part the feature is being created for.
