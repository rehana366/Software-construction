require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory job tracker to allow updates/cancellations
const scheduledJobs = {};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Test connection
transporter.verify(function (error, success) {
    if (error) {
        console.log("CRITICAL: Mailer verification failed. Please check your .env credentials.");
        console.log(error.message);
    } else {
        console.log("Server is ready to send secure emails!");
    }
});

app.post('/api/schedule', (req, res) => {
    const { id, title, type, date, time, email, offsetValue, offsetUnit } = req.body;

    if(!email) return res.status(400).json({error: "Email is required"});
    if(!date || !time) return res.status(400).json({error: "Date and time required for emails."});

    // 1. Clear any existing job for this task/event (for when they edit)
    if(scheduledJobs[id]) {
        scheduledJobs[id].cancel();
        delete scheduledJobs[id];
    }

    // 2. Parse exactly when to trigger the email
    const dateTimeString = `${date}T${time}:00`;
    const targetDate = new Date(dateTimeString);
    const notifyDate = new Date(targetDate.getTime());

    const val = parseInt(offsetValue) || 0;
    
    switch(offsetUnit) {
        case 'minutes':
            notifyDate.setMinutes(notifyDate.getMinutes() - val);
            break;
        case 'hours':
            notifyDate.setHours(notifyDate.getHours() - val);
            break;
        case 'days':
            notifyDate.setDate(notifyDate.getDate() - val);
            break;
        case 'weeks':
            notifyDate.setDate(notifyDate.getDate() - (val * 7));
            break;
        case 'months':
            notifyDate.setMonth(notifyDate.getMonth() - val);
            break;
        case 'years':
            notifyDate.setFullYear(notifyDate.getFullYear() - val);
            break;
        default:
            notifyDate.setMinutes(notifyDate.getMinutes() - val);
    }

    // Ensure we don't schedule something in the past
    const now = new Date();
    if(notifyDate < now) {
        return res.status(400).json({error: "The scheduled reminder time is in the past!"});
    }

    // 3. Schedule it
    const job = schedule.scheduleJob(notifyDate, async function() {
        try {
            console.log(`[TRIGGER] Firing notification for "${title}" to ${email}`);
            await transporter.sendMail({
                from: `"TaskFlow Bot" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Reminder: ${title} is approaching!`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                        <h2 style="color: #6366f1;">TaskFlow System Alert</h2>
                        <p>Hello! This is your automated schedule reminder.</p>
                        <p>Your scheduled ${type === 'event' ? 'event' : 'task'} <strong>"${title}"</strong> is coming up in approximately <strong>${val} ${offsetUnit}</strong>.</p>
                        <p>The event itself officially begins on <strong>${date}</strong> at <strong>${time}</strong>.</p>
                        <hr style="border-top:1px solid #eee;">
                        <p style="font-size: 12px; color: #888;">Sent securely via TaskFlow Enterprise Environment.</p>
                    </div>
                `
            });
        } catch(err) {
            console.error("Failed to send email:", err);
        }
    });

    scheduledJobs[id] = job;
    
    console.log(`Scheduled reminder email for "${title}" to trigger at ${notifyDate.toLocaleString()}`);
    res.json({ success: true, message: "Email reminder securely scheduled." });
});

app.post('/api/cancel', (req, res) => {
    const { id } = req.body;
    if(scheduledJobs[id]) {
        scheduledJobs[id].cancel();
        delete scheduledJobs[id];
    }
    res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Node Backend Router actively guarding on port ${PORT}...`);
});
