import path from 'path';
import supertest from 'supertest';
import app from '../src/app';

const fingerprint = 'debug-workflow-device';

async function main() {
	process.env.NODE_ENV = 'test';

	const agent = supertest(app);

	const doctorLogin = await agent
		.post('/auth/staff/login')
		.set('X-Device-Fingerprint', fingerprint)
		.send({ email: 'drhouse@example.com', password: 'Doctor!234' });

	console.log('doctor login', doctorLogin.status);
	if (doctorLogin.status !== 200) {
		console.dir(doctorLogin.body, { depth: 4 });
		return;
	}

	const receptionistLogin = await agent
		.post('/auth/staff/login')
		.set('X-Device-Fingerprint', fingerprint)
		.send({ email: 'frontdesk@example.com', password: 'Reception!234' });

	const doctorToken = doctorLogin.body.access_token as string;
	const receptionistToken = receptionistLogin.body.access_token as string;

	const doctorDirectory = await agent
		.get('/doctors')
		.set('Authorization', `Bearer ${receptionistToken}`)
		.query({ specialization: 'Internal Medicine' });

	const doctorProfileId = doctorDirectory.body.data?.[0]?.id as string | undefined;
	if (!doctorProfileId) {
		console.error('Doctor directory payload', doctorDirectory.status, doctorDirectory.body);
		return;
	}

	const patientRes = await agent
		.post('/patients')
		.set('Authorization', `Bearer ${receptionistToken}`)
		.send({
			first_name: 'Debug',
			last_name: `Runner-${Date.now()}`,
			dob: '1990-01-01',
			phone: '+1-555-1234'
		});

	console.log('patient create', patientRes.status, patientRes.body);
	if (patientRes.status !== 201) {
		return;
	}

	const patientId = patientRes.body.patient.id as string;

	const caseRes = await agent
		.post('/cases')
		.set('Authorization', `Bearer ${receptionistToken}`)
		.send({
			patient_id: patientId,
			assigned_doctor_id: doctorProfileId,
			summary: 'Debug case',
			symptoms_text: 'Debug symptoms'
		});

	console.log('case create', caseRes.status, caseRes.body);
	if (caseRes.status !== 201) {
		return;
	}

	const caseId = caseRes.body.case.id as string;

	const visitRes = await agent
		.post(`/cases/${caseId}/visits`)
		.set('Authorization', `Bearer ${doctorToken}`)
		.send({
			visit_datetime: new Date().toISOString(),
			vitals: { bp: '120/80', hr: 70 },
			notes: 'Debug visit'
		});

	console.log('visit create', visitRes.status, visitRes.body);
	if (visitRes.status !== 201) {
		return;
	}

	const visitId = visitRes.body.visit.id as string;

	const uploadRes = await agent
		.post('/files')
		.set('Authorization', `Bearer ${doctorToken}`)
		.field('case_id', caseId)
		.field('visit_id', visitId)
		.attach('file', path.resolve(__dirname, '../tests/fixtures/sample.pdf'));

	console.log('upload', uploadRes.status, uploadRes.body);
}

main().catch((err) => {
	console.error('debug script error', err);
	process.exit(1);
});
