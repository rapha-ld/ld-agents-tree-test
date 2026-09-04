---
id: scheme-b
name: Scheme B
notes: >
  Control plane. The top level names what is being governed, with the mode
  switcher replaced by sections you can see. Experiment and Operate stay as
  stages, because both planes use them. Platform primitives sits second, above
  the three planes, to say the shared objects belong to none of them: the same
  set as Scheme A in a different position.
---

# Home -> home
# Create [flyout] -> chrome.create-menu
# Approvals -> approvals
# Search -> chrome.search

# Platform primitives
- Segments -> segments
- Contexts -> contexts
- Metrics -> metrics
- Data sources -> metric-data-sources
- Event history -> observe

# Build control
- Team policies -> agentrouter.policies
- Usage & cost -> agentrouter.usage
- Access & rollout -> agentrouter.access

# Code control
- Flags -> flags
- Release automation -> release-automation

# Agent control
- AI configs -> ai-configs
- Graphs -> ai.graphs
- Playgrounds -> ai.playgrounds
- Evaluation results -> ai.evaluations
- Optimization -> ai.optimize-agent
- Library -> ai-library
- AI insights -> ai-monitoring

# Experiment
- Experiments -> experiments
- Multi-armed bandits -> multi-armed-bandits
- Holdouts -> holdouts

# Operate
- Sessions -> sessions
- Errors -> errors
- Logs -> logs
- Traces -> traces
- Observability signals -> observability-metrics
- Event debugger -> live
- Alerts -> alerts
- Dashboards -> dashboards
- Reports -> insights

# Settings -> settings
