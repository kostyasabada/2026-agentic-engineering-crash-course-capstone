# Verification

Application verification commands are not available yet because implementation has not started. Add exact commands alongside the tests.

## Planned scenarios

- A message sent by one user is received by another independent client.
- History survives a server restart.
- Empty and oversized messages are rejected according to the specification.
- Connection loss is visible to the user; reconnection is checked separately.
- A new client receives the agreed number of recent messages in the correct order.

These are planned checks, not results. Exact limits and expected behavior will be defined in OpenSpec.

## Reporting

Record the command, result, date, and a reference to the verified code version. Distinguish OpenSpec structure validation from application behavior tests. For reviews, record findings or explicitly state that no issues were found.
