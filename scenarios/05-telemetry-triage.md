---
id: telemetry-triage
weight: 2
persona: Backend engineer investigating a spike in failures
---

A service you own started failing intermittently overnight. You want to see what
the telemetry says before you start reading code.

## Look at the errors coming from your service
targets: errors
accept: error

## Find the traces behind one of those errors
targets: traces
accept: error

## Look at the raw events your service is sending
targets: observe
accept: live

## Set up an alert so you hear about this sooner next time
targets: alerts.new
accept: alerts
