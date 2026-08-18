---
id: oncall-kill-switch
weight: 3
persona: On-call engineer during an incident
---

Your pager just went off. A checkout change that shipped an hour ago is throwing
errors and you need to stop the bleeding before you diagnose anything.

## Turn off the flag causing the errors in production
targets: flag.targeting
accept: flags

## Confirm the change took effect
targets: flag.history
accept: chrome.change-history, audit

## Work out who changed the flag most recently
targets: flag.history
accept: audit, chrome.change-history
