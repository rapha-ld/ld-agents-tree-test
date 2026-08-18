---
id: current-expanded
name: Current (expanded sections)
modes:
  - id: code
    label: Code
  - id: agent
    label: Agents
notes: >
  Identical tree and Code / Agents switcher as the current scheme, with every
  section expanded rather than collapsible. Isolates the cost of hiding a section
  behind a disclosure, so it acts as a control on the reveal penalty rather than a
  serious candidate.
---

# Features [mode=code]
- Flags -> flags
  - Flag detail -> flag
    - Targeting [tab] -> flag.targeting
      - Prerequisites [tab] -> flag.targeting.prerequisites
      - Individual targets [tab] -> flag.targeting.individual-targets
      - Targeting rules [tab] -> flag.targeting.rules
      - Default rule [tab] -> flag.targeting.fallthrough
      - Off variation [tab] -> flag.targeting.off-variation
      - Expiring targets [tab] -> flag.targeting.expiring-targets
      - Pending changes [tab] -> flag.targeting.pending-changes
    - Variations [tab] -> flag.variations
    - Workflows [tab] -> flag.workflows
      - New workflow -> flag.workflows.new
    - Monitoring [tab] -> flag.monitoring
    - Insights [tab] -> flag.insights
    - Audience [tab] -> flag.audience
    - Environments [tab] -> flag.environments
    - Code references [tab] -> flag.code-refs
    - Add to code [tab] -> flag.add-to-code
    - History [tab] -> flag.history
    - Settings [tab] -> flag.settings
      - Archive -> flag.settings.archive
      - Deprecate -> flag.settings.deprecate
    - Cleanup [tab] -> flag.cleanup
    - Links [tab] -> flag.links
  - Create flag -> flags.new
  - Connect an SDK -> flags.connect
  - Filters [flyout] -> collection.filters
  - Ordering [flyout] -> collection.ordering
  - Display preferences [flyout] -> collection.display-preferences
  - Compare environments -> compare
- Guarded rollouts -> guarded-rollouts
- Release assistant -> releases
- Segments -> segments
  - Segment detail -> segment
    - Targeting [tab] -> segment.targeting
    - Flags using this segment [tab] -> segment.flags
    - Overview [tab] -> segment.overview
    - History [tab] -> segment.history
    - Settings [tab] -> segment.settings
  - Create segment -> segments.new
- Contexts -> contexts
  - Context detail -> contexts.instance
  - Context kinds -> contexts.kinds
- Live events -> live

# Agents [mode=agent]
- Configs -> ai-config
  - Targeting [tab] -> ai-config.targeting
  - Variations [tab] -> ai-config.variations
  - Playground [tab] -> ai-config.playground
  - Monitoring [tab] -> ai-config.monitoring
- Agent graphs -> ai.graphs
  - Graph detail -> ai.graph
- Agent optimization -> ai.optimize-agent
- Playgrounds -> ai.playgrounds
- Evaluations -> ai.evaluations
  - Evaluation run -> ai.evaluation.run
- AI insights -> ai-monitoring
  - Trends -> ai-monitoring.trends
- Library -> ai-library
  - Models -> ai-library.models
  - Tools -> ai-library.tools
  - Snippets -> ai-library.snippets
  - Datasets -> ai-library.datasets
  - Judge templates -> ai-library.judge-templates

# Experimentation
- Experiments -> experiments
  - Experiment detail -> experiment
    - Design [tab] -> experiment.design
    - Results [tab] -> experiment.results
    - Analytics [tab] -> experiment.analytics
    - Exposures [tab] -> experiment.exposures
    - Traffic [tab] -> experiment.traffic
    - Iterations [tab] -> experiment.iterations
    - Details [tab] -> experiment.details
  - Create experiment -> experiments.new
- Multi-armed bandits -> multi-armed-bandits
  - Bandit detail -> multi-armed-bandit
- Holdouts -> holdouts
  - Holdout detail -> holdout
  - Create holdout -> holdouts.new
- Product analytics -> product-analytics
  - Charts -> product-analytics.charts
  - Cohorts -> product-analytics.cohorts
  - Dashboards -> product-analytics.dashboards
  - Events -> product-analytics.events

# Telemetry
- Sessions -> sessions
  - Session detail -> session
- Errors -> errors
  - Error detail -> error
- Logs -> logs
- Traces -> traces
- Observability metrics -> observability-metrics
- Alerts -> alerts
  - Alert detail -> alert
  - Create alert -> alerts.new
- Dashboards -> dashboards
  - Dashboard detail -> dashboard
  - Create dashboard -> dashboards.new

# Data
- Metrics -> metrics
  - Metric detail -> metric.details
  - Metric groups -> metrics.groups
  - Create metric -> metrics.new
- Event explorer -> observe
- Metric data sources -> metric-data-sources
- Data sources -> data-sources
  - Metrics [tab] -> data-sources.metrics
  - Assignments [tab] -> data-sources.assignments

# Project [flyout]
- Switch project [switcher] -> chrome.project-switcher
- Projects and views [switcher] -> chrome.project-view-switcher
- Get started -> get-started
  - Quickstart -> get-started.quickstart
  - Invite members -> get-started.invite-members
  - Set up the CLI -> get-started.setup-cli
- SDK setup -> sdk-setup
- Approvals -> approvals
  - Approval detail -> approval
- Audit log -> audit
  - Audit entry -> audit.detail
- Project settings -> settings
  - Environments -> settings.environments
    - Environment detail -> settings.environment
    - SDK keys -> settings.environment.keys
    - Approval settings -> settings.environment.approval-settings
  - Flags -> settings.flags
  - Context kinds -> settings.context-kinds
  - Approvals -> settings.approvals
  - Release pipelines -> settings.release-pipelines
  - Release policies -> settings.releases.release-policies
  - Views -> settings.views
  - Payload filters -> settings.payload-filters
  - Observability -> settings.observability
  - Model configs -> settings.model-configs
  - Lifecycle -> settings.lifecycle

# Account [flyout]
- Session menu [switcher] -> chrome.session-menu
- Profile -> account.profile
- Account settings -> account
  - General -> account.general
  - Members -> account.members
    - Member detail -> account.member
    - Permissions -> account.member.permissions
  - Teams -> account.teams
    - Team detail -> account.team
    - Team members -> account.team.members
    - Team permissions -> account.team.permissions
  - Roles -> account.roles
    - Organization roles -> account.roles.organization
    - Project roles -> account.roles.project
  - Projects -> account.projects
  - Billing -> account.billing
    - Plans -> account.billing.plans
  - Usage -> account.usage
  - Plan usage -> account.plan-usage
  - Integrations -> account.integrations
  - Authorization -> account.authorization
    - Access tokens -> account.authorization.tokens
    - OAuth applications -> account.authorization.oauth
  - SDK keys -> account.sdk-keys
  - Applications -> account.applications
  - Relay proxy -> account.relay
  - Security -> account.security
  - Change history -> account.history

# Global
- Create [flyout] -> chrome.create-menu
- Selected environments [switcher] -> chrome.environment-selector
  - View another environment [switcher] -> chrome.environment-add
  - Swap environment [switcher] -> chrome.environment-swap
  - More environment actions [switcher] -> chrome.environment-actions
- Show change history [flyout] -> chrome.change-history
- Shortcuts [flyout] -> chrome.shortcuts
- Install SDK [flyout] -> chrome.install-sdk
- Insights -> insights

