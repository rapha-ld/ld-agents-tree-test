---
id: agent-cost
weight: 3
persona: Engineer running an AI support agent in production
---

You have been told by upper management that the AI support agent your team runs
is getting expensive and occasionally gives poor answers.

## Check what the agent is costing you
targets: agentrouter.usage

## Test a change to the agent's prompt without affecting what your customers see
targets: ai.playgrounds
accept: ai-config.playground

## Change the AI model the agent uses
targets: ai-configs
accept: ai-config, ai-library.models

## Stop your team's agents from using an AI model that is not approved for them
targets: agentrouter.policies
accept: agentrouter.access
