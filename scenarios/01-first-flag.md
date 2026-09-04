---
id: first-flag
weight: 3
persona: New engineer joining a company that already uses LaunchDarkly
---

You started at your company this week. Your team already has LaunchDarkly set up,
and your first ticket is to ship a change behind a feature flag and find out
whether the change actually helps.

## Where would you go to create your first flag?
targets: flags
accept: flags.new

## Create an A/B test on the flag.
targets: experiments
accept: experiments.new, flag.experiments

## A week later, your manager asks how the change performed. Where would you go to check the results?
targets: experiments
accept: metrics, experiment.results
