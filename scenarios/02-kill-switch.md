---
id: kill-switch
weight: 3
persona: On-call engineer during an incident
---

Your pager just went off. A change that shipped an hour ago is throwing errors
and you need to stop the bleeding before you diagnose anything.

## Turn off the flag causing the errors in production.
targets: flags
accept: flag.targeting

## Determine exactly which users or accounts saw that flag while it was on.
targets: contexts
accept: contexts.instance, live

## A teammate has fixed the issue with the flag. They have sent it to you to review before they release the fix.
targets: approvals
accept: flag.approval
