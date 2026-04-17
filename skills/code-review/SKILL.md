---
name: code-review
description: Perform thorough code reviews with structured feedback.
---

# Code Review Skill

Perform systematic code reviews focusing on correctness, security, and maintainability.

## Review Checklist

1. **Correctness**: Does the code do what it claims?
2. **Security**: Any injection vectors, unsafe operations?
3. **Performance**: Obvious inefficiencies or unnecessary allocations?
4. **Readability**: Naming, structure, unnecessary complexity?
5. **Edge Cases**: Error handling, boundary conditions?

## Output Format

For each finding, provide:
- Location (file:line)
- Severity (critical / warning / suggestion)
- Description
- Suggested fix
