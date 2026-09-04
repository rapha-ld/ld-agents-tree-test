---
id: scheme-a
name: Scheme A
notes: >
  Lifecycle. The top level names the stage of work. Build holds only the
  AgentRouter pages, because equipping the team happens before the change
  exists; authoring what ships sits under Release alongside flags. The shared
  objects get a single home at the bottom, in Platform primitives.
---

# Home -> home
# Create [flyout] -> chrome.create-menu
# Approvals -> approvals
# Search -> chrome.search

# Build
- Team policies -> agentrouter.policies
- Usage & cost -> agentrouter.usage
- Access & rollout -> agentrouter.access

# Release
- Flags -> flags
- Release automation -> release-automation
- AI configs -> ai-configs
- Graphs -> ai.graphs
- Playgrounds -> ai.playgrounds
- Evaluation results -> ai.evaluations
- Library -> ai-library
- Optimization -> ai.optimize-agent

# Experiment
- Experiments -> experiments
- Multi-armed bandits -> multi-armed-bandits
- Holdouts -> holdouts

# Monitor
- Sessions -> sessions
- Errors -> errors
- Logs -> logs
- Traces -> traces
- Observability signals -> observability-metrics
- Event debugger -> live
- Alerts -> alerts
- Dashboards -> dashboards
- Reports -> insights
- AI insights -> ai-monitoring

# Platform primitives
- Segments -> segments
- Contexts -> contexts
- Metrics -> metrics
- Data sources -> metric-data-sources
- Event history -> observe

# Settings -> settings
