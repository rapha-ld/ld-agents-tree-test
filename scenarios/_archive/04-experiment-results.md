---
id: experiment-results
weight: 2
persona: Product manager checking whether a test won
---

You launched an A/B test two weeks ago. Leadership is asking in standup whether
the new onboarding flow is working.

## Find out whether the experiment reached a result
targets: experiment.results
accept: experiments

## See how much traffic each variation received
targets: experiment.traffic
accept: experiment.exposures

## Share the results outside the tool
targets: experiment.download-pdf
accept: experiment.results
