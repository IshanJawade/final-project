import React from 'react';

export default function HomePage() {
  return (
    <div className="panel">
      <h2>Welcome</h2>
      <h4>
        <p>
          <a href="https://github.com/IshanJawade/final-project">MedSecure Access</a> puts patients at the center of their own healthcare data. Instead of relying on clinics or providers to control visibility, you decide exactly who can view your medical history. Every connection must be approved by the patient, nothing is shared with a doctor or clinic until you give full consent. Our goal is to make secure information sharing feel as simple as sending an invitation, without ever compromising your privacy.
        </p>
        <p>
          Patients get a clear dashboard to review which professionals have access, track recent activity, and download their records in familiar formats. Medical professionals work in a streamlined space where they can request access, upload visit notes, and attach supporting documents. Administrators help keep the system healthy by validating new accounts and removing inactive ones. <br/>
        </p>
        <p>
          Behind the scenes, all sensitive data is encrypted before being stored, and every interaction is captured with tamper-resistant audit logs. Files remain protected throughout their journey, upload, storage, and download, ensuring confidentiality end-to-end. <br/>
        </p>
        <p>
          We intentionally designed the user interface to be clean, lightweight, and easy to use. This ensures fast loading times and reliable performance on any device, from low-power laptops to clinical workstations. <br/>
        </p>
        <p>
          Use the navigation above to register or sign in, and explore the dashboards built for patients, professionals, and administrators. <br/>
        </p>
      </h4>
      {/* <p>
        <h4>Technologies Used:</h4>
        <ul>
          <li>Frontend: React 18 with Vite, React Router, Context API, jsPDF</li>
          <li>Backend: Node.js (Express), Multer for uploads, custom structured file logging</li>
          <li>Database: PostgreSQL with parameterized queries</li>
          <li>Authentication: JWT (JSON Web Tokens) with bcrypt password hashing</li>
          <li>Encryption: AES-256 payload and file encryption utilities</li>
          <li>Tooling: ESLint configuration, npm scripts for dev/build, modern browser APIs </li>
        </ul>
      </p> */}
      <p>
          Made by Ishan Jawade for Final Project - CPSC 597-03 at Cal State Fullerton CA. <br />
          Contact: <a to="mailto:ishanjawade@outlook.com">ishanjawade@outlook.com</a> <br />
          GitHub: <a href="https://github.com/ishanjawade">https://github.com/ishanjawade/</a>
      </p>
    </div>
  );
}
