# Changelog notes

Each pull request that changes what people see adds one file here,
`changes/<slug>.md` (the branch name works), holding one line in the style of
the CHANGELOG, starting with `- ` or not:

    Explore keeps its filter when the period changes.

A file per change means two pull requests never edit the same lines.
`pnpm release X.Y.Z` compiles the files, sorted by name, into the new
version's section of `CHANGELOG.md` and deletes them. Entries that already
stand under "Unreleased" in `CHANGELOG.md` are compiled with them.
