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

## A teammate made a change to the new login flow and is waiting on your sign-off before it takes effect for your users.
question: Where do you go to review it?
targets: approvals
accept: flag.approval
