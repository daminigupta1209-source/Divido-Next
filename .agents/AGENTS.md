# Repository Agent Rules: Token Efficiency & Context Management

To conserve token usage and prevent context bloat, all AI agents working on this project must adhere to the following rules:

1. **Surgical File Reading**: Never read entire code files. Always use line-range viewing tools (e.g. `view_file` with `StartLine`/`EndLine`) to inspect only the relevant blocks of code.
2. **Surgical File Edits**: Always modify files using precise, targeted line replacement tools (e.g., `replace_file_content` or `multi_replace_file_content`) instead of overwriting whole files.
3. **No Code Dumps in Chat**: Never output entire files or large blocks of unchanged code in the conversational response. Only show short, relevant diffs or code snippets.
4. **Concise Explanations**: Keep conversational responses concise. Focus on explaining key architectural decisions and direct answers, omitting polite filler or verbose code summaries.
5. **Session-Reset Friendly**: Maintain the `ONBOARDING.md` and `walkthrough.md` files as living documents. Assume the user will reset the chat session frequently to clear token history, and rely on these files to pick up context.
6. **Path Exclusions**: Do not index, search, or read files under build outputs (`dist/`), dependencies (`node_modules/`), platform folders (`android/`, `ios/`), or local scratch scripts unless explicitly requested.
