---
id: baseline
name: Baseline
modes:
  - id: code
    label: Code
  - id: agents
    label: Agents
notes: >
  Today's project nav with the Code / Agents switcher on. Features, Shortcuts and
  the three session-shaped telemetry pages belong to Code; the Agents section
  belongs to Agents; everything else is shared. Carries the proposed label
  changes (Reports, Event history) so the study measures structure rather than
  wording. AgentRouter does not exist today, so its three pages sit under
  Settings, the place the Enterprise listening tour described as where new
  requests land by default.
---

# Home -> home
# Create [flyout] -> chrome.create-menu
# Approvals -> approvals
# Search -> chrome.search

# Shortcuts [mode=code] -> chrome.shortcuts

# Features [mode=code]
- Flags -> flags
- Segments -> segments
- Contexts -> contexts
- Live events -> live

# Agents [mode=agents]
- AI configs -> ai-configs
- Graphs -> ai.graphs
- Playgrounds -> ai.playgrounds
- Evaluation results -> ai.evaluations
- Optimization -> ai.optimize-agent
- Library -> ai-library
- AI insights -> ai-monitoring

# Experimentation
- Experiments -> experiments
- Multi-armed bandits -> multi-armed-bandits
- Holdouts -> holdouts

# Telemetry
- Sessions [mode=code] -> sessions
- Errors [mode=code] -> errors
- Logs [mode=code] -> logs
- Traces -> traces
- Observability signals -> observability-metrics
- Alerts -> alerts
- Dashboards -> dashboards
- Reports -> insights

# Data
- Metrics -> metrics
- Event history -> observe
- Data sources -> metric-data-sources

# Settings
- Team policies -> agentrouter.policies
- Usage & cost -> agentrouter.usage
- Access & rollout -> agentrouter.access
