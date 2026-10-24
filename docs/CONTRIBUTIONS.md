# Team contributions and viva evidence (fill with actual work)

The assignment requires **two team members**, each contributing to both the database **and** application. This file intentionally does not invent names, commits or a work history. The sample assignments below are recommendations, not claims about work already done.

| Scope | Member 1 (customer & data integrity) | Member 2 (officer & semantic retrieval) |
| --- | --- | --- |
| SQL ownership | Customer/product/warranty/claim schema; validation triggers; SELECT/JOIN queries | Documents/chunks/matches, pgvector index, decisions/repairs and audit triggers |
| App ownership | Auth, registration, customer dashboard, claim submission | Officer dashboard, review, semantic search, policy ingestion, repair screens |
| Shared review | Review member 2 SQL, tests, docs | Review member 1 API authorization, tests, docs |
| Validation | Product and ownership tests | Semantic and decision/repair workflow tests |

**Before final submission:**

- Insert actual names, registration numbers, roles and links to individual GitHub commits/pull requests.
- Ensure each member creates independent, substantive commits affecting both database and Next.js application—not only cosmetic changes.
- Run the project together and prepare to explain SQL integrity checks, stored functions, transactions, vector similarity, embeddings, authenticated routes, and source files each member modified.
- Replace “test pending” notes in the report with timestamps, terminal logs and captured application screenshots after verification.
- Share the **actual public GitHub URL**, not the placeholder in README.

Useful commands:

```bash
git log --all --format='%h %an <%ae> %s'
git shortlog -sne --all
git show --stat <real-commit-hash>
```
