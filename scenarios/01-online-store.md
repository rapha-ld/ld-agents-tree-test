---
id: online-store
weight: 1
persona: Software engineer who owns the AI support features at an online store
---

You're a software engineer at an online store. Your team uses LaunchDarkly to ship features safely. The store also runs a few AI features for customer support: a support bot that answers questions, a bot that looks up orders, a tool that summarizes support tickets, and an automated refund process. This quarter you own making these AI features better, cheaper and safer to change. In each task, choose where in LaunchDarkly you'd go to get it done. There are no wrong answers; we're testing the menu, not you.

## Your company's support bot should always reply in the customer's language. Change the instructions it follows. Select the page you'd try first.
targets: support-bot.configure, support-bot.variations

## You drafted friendlier wording for your company's support bot. Chat with it to see how it replies before any customer sees it. Select the page you'd try first.
targets: support-bot.test, ai.playgrounds

## A new version of your company's support bot is ready. Give it to 10% of customers first. Select the page you'd try first.
targets: support-bot.release, support-bot.targeting

## See how quickly your company's support bot has replied this week and how customers rated its answers. Select the page you'd try first.
targets: support-bot.monitor, support-bot.monitoring

## Compare what each of your company's AI features cost this month, side by side. Select the page you'd try first.
targets: ai-monitoring

## Have LaunchDarkly automatically try cheaper AI models and wording for your company's support bot, and recommend one that answers just as well. Select the page you'd try first.
targets: support-bot.optimize, ai.optimize-agent

## Your team wants a new AI feature that writes replies to customer reviews. Start setting it up in LaunchDarkly. Select the page you'd try first.
targets: agents

## Customer refund requests pass through three bots in a row: one sorts the request, one checks the order, one issues the refund. Open the view that shows how they hand off to each other. Select the page you'd try first.
targets: refund-workflow

## Before a new version of your company's support bot goes live, score it and the current version against 200 real customer questions and compare the results. Select the page you'd try first.
targets: ai.evaluations
accept: ai.playgrounds

## Save a set of 200 real customer questions so any team can reuse them later. Select the page you'd try first.
targets: library.datasets

## An AI grader already scores your support bot's answers for accuracy. Make it stricter. Select the page you'd try first.
targets: accuracy-judge.configure, accuracy-judge.variations
