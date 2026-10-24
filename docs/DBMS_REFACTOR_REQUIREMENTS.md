# Level 3 requirements after migration 007

Reference: the owner's five-page `DBMS Level 3 Project Requirements.pdf`, reread on 24 October 2026. The document supplies project criteria; it does not authorize database changes or publication. The user's isolation/preservation instructions govern this review.

| PDF item | Refactor assessment | Evidence / limit |
|---|---|---|
| 1. Unique meaningful title, beyond CRUD | Technical design retained; uniqueness unverified | Human decisions, evidence retrieval and generated repair lifecycle; no section roster |
| 2. Approved two-member team, both DB/app contributions | Human evidence pending | Do not invent team members or contributions; existing contribution placeholders remain |
| 3. SQL + second paradigm | Passed, Option 2 retained | PostgreSQL 17.11 + pgvector 0.8.7 with real vectors/retrieval |
| 4. ER, relational schema, keys, vector model | Retained and checked | Same 16 tables, 94 columns, 66 constraints; ER and dictionary unchanged; vector(384) |
| 5. DDL, CREATE/ALTER/DROP, constraints, indexes, views | Passed | 7 clean-schema migrations; unchanged 39 indexes/3 views; viva temporary DDL executed |
| 6. DML and meaningful SQL queries | Passed | HTTP INSERT/UPDATE/SELECT, retrieval replacement DELETE; JOIN/group/HAVING/order/aggregate/subquery examples executed |
| 7. At least four SQL concepts + vector concept | Passed | Transactions, views, stored function, triggers, indexing, cosine similarity; 17 triggers/15 functions still demonstrate advanced SQL |
| 8. Embeddings/retrieval explanation | Retained, bounded runtime checks | MiniLM, normalized 384 dimensions, chunks, metadata, cosine, HNSW, policy scope; no broad accuracy benchmark |
| 9. Next.js web interface | Passed for observed workflow | Populated customer/product/claim forms and officer/search/approval/repair-completion browser sequence |
| 10. Backend integration/environment credentials | Passed in isolated review | App/API source unchanged, parameterized SQL, dummy environment-only test configuration, no private files copied |
| 11. Backend auth and minimum two roles | Passed for tested cases | 78 original +19 extra HTTP assertions; second active officer cannot decide/repair another officer's case; inactive sessions rejected |
| 12. Database validation/integrity | Passed for tested cases | Smoke,38 assertions,41 targeted cases,5 SQL races,10 zero-violation invariants; direct-SQL error caveat documented |
| 13. Documentation/screenshots/testing | Updated evidence available | Separate log/results/mapping and real browser screenshots; original PDFs historical; actual team details pending |
| 14. GitHub and individual contributions | Repository verified; contribution evidence pending | Public audited main and passing baseline CI verified; review isolated locally without main update or publish |
| 15. Final demonstration/individual explanation | Software evidence available; human demonstration pending | Actual queries/UI/workflows verified; students must explain their own work |
| 16. Originality | Not certified by testing | Instructor/provenance review required |
| 17. Beyond CRUD and justified paradigms | Retained | SQL workflow/history consistency and policy-scoped semantic evidence retrieval solve distinct needs |

Reducing redundant trigger routines does not remove the demonstrated DBMS concepts. Passing software tests does not establish the unverified academic conditions. See `DBMS_REFACTOR_RESULTS.md` for exact counts and limits.
