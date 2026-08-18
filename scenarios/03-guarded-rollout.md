---
id: guarded-rollout
weight: 2
persona: Release manager rolling out a risky change
---

You own a change that touches payments. You want it released gradually with
automatic rollback if error rates move, not flipped on for everyone at once.

## Start a gradual rollout that watches for regressions
targets: guarded-rollouts
accept: flag.targeting

## Choose which metrics act as the guardrail
targets: metrics
accept: guarded-rollouts

## Check on a rollout that is already in progress
targets: releases
accept: guarded-rollouts
