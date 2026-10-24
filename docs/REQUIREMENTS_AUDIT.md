# DBMS Level 3 requirements matrix

Source: supplied `DBMS Level 3 Project Requirements.pdf`, all five pages read before runtime testing. Requirements are reference material; the user's preservation/no-publication instructions govern this audit.

| PDF item | Status | Evidence / limit |
| --- | --- | --- |
| 1. Unique title and meaningful problem beyond CRUD | Design satisfied; uniqueness unverified | Stateful decisions, semantic evidence and generated repairs; section roster unavailable |
| 2. Approved two-member team, both contribute to DB/app | Human evidence pending | Contributions remain honest placeholders; no invented names/commits |
| 3. SQL plus another database paradigm | Passed | PostgreSQL + pgvector with real stored vectors and retrieval, Option 2 |
| 4. ER, schema, keys, constraints and vector model | Passed for reviewed source/runtime | ER diagrams, 16-table dictionary, migrations, metadata and embedding strategy |
| 5. CREATE/ALTER/DROP, keys, indexes and views | Passed | Six clean-schema migrations plus safe temporary DDL exercise |
| 6. DML and meaningful queries | Passed | Actual API INSERT/UPDATE/SELECT; repeat retrieval DELETE; JOIN/group/HAVING/order/aggregate/subquery demonstrations executed |
| 7. Four advanced SQL + one vector concept | Passed | Transactions, functions, triggers, views, indexing; HNSW/cosine search |
| 8. Explain embeddings and retrieval | Passed, bounded relevance sample | MiniLM fp32, 384 dimensions, chunks, metadata, cosine and policy top-k; no broad accuracy benchmark |
| 9. Functional Next.js UI | Passed locally | Populated browser forms, dashboards, filters, claims, decisions, repairs, ingestion |
| 10. Backend integration and env credentials | Passed for local app | Parameterized SQL and unchanged private env; local Compose demo defaults are not production hardening |
| 11. Backend authentication, at least two roles | Passed for executed cases | Customer/officer, ownership, expiry/tampering/inactive checks; distinct second-officer browser flow not run |
| 12. Database validation/integrity | Passed for executed assertions | Smoke + 38 added rollback checks + 10 zero-violation invariants; migrations 005/006 |
| 13. Documentation, screenshots and results | Current Markdown evidence supplied | README/report/dictionary, real screenshots, audit and separate change log; original PDF historical and team details pending |
| 14. Git/GitHub and individual contributions | Partial / human evidence pending | Local Git workspace; no verified team history/public repository; no publish performed |
| 15. Demonstration and individual explanation | Software evidence available | Real browser/database/query runs; viva understanding and each student's explanation require people |
| 16. Originality | Not established | Requires provenance and instructor comparison, not a passing build |
| 17. Beyond CRUD and justified paradigms | Design satisfied | SQL controls relational workflow/ACID; pgvector addresses unstructured policy text with real retrieval |

See [AUDIT_RESULTS.md](AUDIT_RESULTS.md) for passed/untested boundaries and [CHANGELOG_AUDIT.md](../CHANGELOG_AUDIT.md) for changes. Technical success does not certify unverified academic requirements.
