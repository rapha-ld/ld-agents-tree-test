---
id: flag-hygiene
weight: 1
persona: Staff engineer cleaning up technical debt
---

Your codebase has accumulated years of flags. You want to find the ones that are
safe to remove and get rid of them.

## Find flags nobody is using any more
targets: flag.cleanup
accept: flags

## Check whether a flag is still referenced in code
targets: flag.code-refs
accept: flag.cleanup

## Archive a flag you have finished with
targets: flag.settings.archive
accept: flag.settings
