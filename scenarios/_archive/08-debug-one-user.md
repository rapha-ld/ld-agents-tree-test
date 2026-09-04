---
id: debug-one-user
weight: 1
persona: Support engineer answering a customer ticket
---

A customer says a feature is missing from their account. You need to establish
what that specific user actually saw.

## Look up that one user
targets: contexts.instance
accept: contexts

## Work out which flag values they received
targets: contexts.instance
accept: live.flag, live

## Give that user access to the feature right now
targets: flag.targeting.individual-targets
accept: flag.targeting
