# 05: Workflow guides know about the Spending allowance

**What to build:** The server-side Workflow guides steer Claude (and the custom GPT) to use the Spending allowance correctly: show its effect when setting a budget, allocate savings-funded purchases before they are paid, and ask for the flag when creating a category.

**Blocked by:** 01 (Committed/Flexible flag), 02 (Spending allowance on get_budget)

**Status:** ready-for-agent

Spec: `.scratch/spending-allowance/spec.md` (Workflow guides)

- [ ] `create_budget` tells the agent to show the Committed and Flexible totals and the resulting Spending allowance before the Member confirms allocations
- [ ] `plan_purchase` tells the agent, for a savings-funded purchase, to allocate the cost to the Home projects Envelope after the Member approves and before the payment goes out
- [ ] Any guide step that creates a category tells the agent to ask the Member for Committed or Flexible
- [ ] Guide tests assert the new steps are present
