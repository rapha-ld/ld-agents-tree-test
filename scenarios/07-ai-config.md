---
id: ai-config
weight: 2
persona: AI engineer tuning a production agent
---

The support agent your team runs is getting expensive and occasionally gives poor
answers. You want to change the model it uses and see the effect.

## Change which model the agent uses
targets: ai-config.variations
accept: ai-config

## Check what the agent is costing you
targets: ai-config.monitoring
accept: ai-monitoring

## Try a prompt change before shipping it
targets: ai-config.playground
accept: ai.playgrounds

## Compare two versions of the agent against a dataset
targets: ai.evaluations
accept: ai-library.datasets
