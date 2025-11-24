const appointments = [
  { slot: '09:00', patient: 'Jane Doe', room: 'A2', status: 'Ready' },
  { slot: '11:30', patient: 'Carlos Vega', room: 'Virtual', status: 'Pending intake' },
  { slot: '15:00', patient: 'Jo Park', room: 'C1', status: 'Completed' }
];

export const AppointmentsPage = () => (
  <div>
    <div className="page-heading">
      <h1>Appointments</h1>
      <span>Doctor capacity and live queue health</span>
    </div>
    <article className="panel table-card">
      <table>
        <thead>
          <tr>
            <th>Slot</th>
            <th>Patient</th>
            <th>Room</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((item) => (
            <tr key={item.slot}>
              <td>{item.slot}</td>
              <td>{item.patient}</td>
              <td>{item.room}</td>
              <td>
                <span className="status-pill" style={{ fontSize: '0.7rem' }}>
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  </div>
);
