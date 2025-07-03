import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import session from 'express-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));

const readJSON = f => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); }
  catch { return []; }
};
const writeJSON = (f, data) => fs.writeFileSync(path.join(__dirname, f), JSON.stringify(data, null, 2));

// Auth middleware
const requireDoctor = (req, res, next) => {
  if (req.session.user?.role === 'doctor') return next();
  res.redirect('/');
};
const requirePatient = (req, res, next) => {
  if (req.session.user?.role === 'patient') return next();
  res.redirect('/');
};


// Login/Registration
app.get('/login', (req, res) => res.render('login', { message: null }));
app.get('/signup', (req, res) => res.render('signup'));
app.get('/policy', (req, res) => res.render('policy'));

app.get("/", (req,res) =>{
  res.render("index");
});
app.get("/contactus", (req,res) =>{
  res.render("contactus");
});
app.get("/aboutus", (req,res) =>{
  res.render("aboutus");
});
app.get("faq", (req,res) =>{
  res.render("faq");
});
app.get("/dashboard", (req,res) =>{
  res.render("dashboard");
});
app.get("/register", (req,res) =>{
  res.render("signup");
});

app.get("/patient/dashboard", (req,res) =>{
 const patient = readJSON("patients.json");
res.render("dashboard", {
    Name: patient.name,
    Email: patient.email,
    Phone: patient.phone,
    Address: patient.address,
    Age: patient.dob,
    Gender: patient.gender,
  });

});

app.post('/register/patient', async (req, res) => {
  const patients = readJSON('patients.json');
  const { firstName, lastName, dob, gender, email, phone, address, password } = req.body;
  if (patients.some(p => p.email === email)) return res.send('Patient exists');

  patients.push({
    id: Date.now(), name: `${firstName} ${lastName}`, dob, gender, email, phone, address,
    password: await bcrypt.hash(password, 10), role: 'patient'
  });
  writeJSON('patients.json', patients);
  res.redirect('/login');
});

app.post('/register/doctor', async (req, res) => {
  const doctors = readJSON('doctors.json');
  const { firstName, lastName, specialization, license, experience, hospital, email, phone, address, password } = req.body;
  if (doctors.some(d => d.email === email)) return res.send('Doctor exists');

  doctors.push({
    id: Date.now(), name: `${firstName} ${lastName}`, specialization, license, experience, hospital,
    email, phone, address,
    password: await bcrypt.hash(password, 10), role: 'doctor'
  });
  writeJSON('doctors.json', doctors);
  res.redirect('/');
});



app.post('/check', async (req, res) => {
  const { email, password, role } = req.body;
  const users = readJSON(`${role}s.json`);
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.render('login', { message: 'Invalid credentials' });
  }
  req.session.user = { id: user.id, name: user.name, role: user.role };
  res.redirect(`/${role}`);
});

// Doctor Dashboard
app.get('/doctor', requireDoctor, (req, res) => {
  const doctorAppointments = readJSON('appointments.json').filter(a => a.doctorId === req.session.user.id);
  const today = new Date().toISOString().split('T')[0];
  
  const stats = {
    todayCount: doctorAppointments.filter(a => a.date === today).length,
    todayConfirmed: doctorAppointments.filter(a => a.date === today && a.status === 'Confirmed').length,
    weekCount: doctorAppointments.length,
    weekDiff: 0,
    patientTotal: (new Set(doctorAppointments.map(a => a.patientId))).size,
    patientNew: doctorAppointments.filter(a => new Date(a.date) >= new Date(today.substring(0,7)+'-01')).length,
    prescriptionTotal: doctorAppointments.filter(a => a.precautions).length,
    prescriptionWeekly: 0
  };

  const patients = doctorAppointments.map(a => ({
    patientName: a.patientName,
    patientId: a.patientId,
    date: a.date,
    time: a.time,
    status: a.status,
    precautions: a.precautions || null,
    reason: a.reason,
    id: a.id
  }));

  res.render('doctor', {
    doctor: req.session.user,
    appointments: doctorAppointments,
    stats, 
    patients
  });
});

// Appointment actions
app.post('/doctor/appointment/:id/precautions', requireDoctor, (req, res) => {
  const appointments = readJSON('appointments.json');
  const appt = appointments.find(a => a.id === +req.params.id && a.doctorId === req.session.user.id);
  if (!appt) return res.sendStatus(404);
  appt.precautions = req.body.precautions;
  appt.status = 'Completed';
  writeJSON('appointments.json', appointments);
  res.redirect('/doctor');
});

app.post('/doctor/appointment/:id/reschedule', requireDoctor, (req, res) => {
  const appointments = readJSON('appointments.json');
  const appt = appointments.find(a => a.id === +req.params.id && a.doctorId === req.session.user.id);
  if (!appt) return res.sendStatus(404);
  appt.date = req.body.date;
  appt.time = req.body.time;
  appt.status = 'Rescheduled';
  writeJSON('appointments.json', appointments);
  res.redirect('/doctor');
});

app.post('/doctor/appointment/:id/cancel', requireDoctor, (req, res) => {
  const appointments = readJSON('appointments.json');
  const appt = appointments.find(a => a.id === +req.params.id && a.doctorId === req.session.user.id);
  if (!appt) return res.sendStatus(404);
  appt.status = 'Cancelled';
  writeJSON('appointments.json', appointments);
  res.redirect('/doctor');
});

// Patient Dashboard
app.get('/patient', requirePatient, (req, res) => {
  const appointments = readJSON('appointments.json').filter(a => a.patientId === req.session.user.id);
  const doctors = readJSON('doctors.json');
  res.render('patient', { patient: req.session.user, appointments, prescriptions: appointments.filter(a => a.precautions), doctors });
});

app.post('/patient/book', requirePatient, (req, res) => {
  const { doctorId, date, time, reason } = req.body;
  const doctors = readJSON('doctors.json');
  const doctor = doctors.find(d => d.id === +doctorId);
  if (!doctor) return res.send('Invalid doctor');
  const appointments = readJSON('appointments.json');
  appointments.push({
    id: Date.now(),
    doctorId: +doctorId,
    doctorName: doctor.name,
    specialty: doctor.specialization,
    patientId: req.session.user.id,
    patientName: req.session.user.name,
    date, time, reason,
    status: 'Scheduled'
  });
  writeJSON('appointments.json', appointments);
  res.redirect('/patient');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});