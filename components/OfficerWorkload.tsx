import 'server-only';
import { query } from '@/lib/db';
import { dateText } from '@/lib/format';

type Workload = {
 officer_id: string | null;
 officer_name: string | null;
 open_claims: number;
 aging_claims: number;
 oldest_submission: Date;
};

export default async function OfficerWorkload() {
 const { rows } = await query<Workload>(`
  SELECT a.officer_id, u.full_name AS officer_name,
    count(*)::int AS open_claims,
    count(*) FILTER (WHERE c.submitted_at <= now() - interval '168 hours')::int AS aging_claims,
    min(c.submitted_at) AS oldest_submission
  FROM warranty_claims c
  LEFT JOIN claim_assignments a ON a.claim_id = c.id
  LEFT JOIN app_users u ON u.id = a.officer_id
  WHERE c.status IN ('submitted', 'in_review')
  GROUP BY a.officer_id, u.full_name
  ORDER BY (a.officer_id IS NULL) DESC, aging_claims DESC, oldest_submission, a.officer_id
 `);

 return (
  <section className="panel tablepanel">
   <div className="panelhead"><h2>Open claim workload</h2></div>
   {rows.length ? (
    <div className="tablewrap"><table>
     <thead><tr><th>Queue</th><th>Open claims</th><th>Open 7 days or more</th><th>Oldest submission</th></tr></thead>
     <tbody>{rows.map(row => (
      <tr key={row.officer_id ?? 'unassigned'}>
       <td>{row.officer_name ?? 'Unassigned'}</td>
       <td>{row.open_claims}</td>
       <td>{row.aging_claims}</td>
       <td>{dateText(row.oldest_submission)}</td>
      </tr>
     ))}</tbody>
    </table></div>
   ) : <div className="empty">No claims are awaiting review or in review.</div>}
  </section>
 );
}
