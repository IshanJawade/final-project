const mockPatients = [
  { mrn: 'MRN-1001', name: 'Jane Doe', status: 'Active', doctor: 'Dr. House' },
  { mrn: 'MRN-1014', name: 'Carlos Vega', status: 'On Hold', doctor: 'Dr. Foreman' },
  { mrn: 'MRN-1033', name: 'Jo Park', status: 'Discharge review', doctor: 'Dr. Cameron' }
];

export const PatientsPage = () => (
  <div>
    <div className="page-heading">
      <h1>Patients</h1>
      <span>Roster snapshot synced with core API</span>
    </div>
    <article className="panel table-card">
      <table>
        <thead>
          <tr>
            <th>MRN</th>
            <th>Name</th>
            <th>Status</th>
            <th>Doctor</th>
          </tr>
        </thead>
        <tbody>
          {mockPatients.map((p) => (
            <tr key={p.mrn}>
              <td>{p.mrn}</td>
              <td>{p.name}</td>
              <td>
                <span className="status-pill" style={{ fontSize: '0.7rem' }}>
                  {p.status}
                </span>
              </td>
              <td>{p.doctor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  </div>
);
