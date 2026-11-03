# Cheap Assignments UK — Version 2

A bilingual English/Romanian quote-request website with a private admin dashboard.

## Included
- Student quote request form (no upfront payment)
- Optional assignment brief upload (PDF, DOC, DOCX, PPT, PPTX, TXT; 10 MB max)
- SQLite storage for enquiries
- Admin sign-in and request dashboard
- Request statuses and personalised quote amounts/messages
- Email notification to the business when a request arrives
- Email quote delivery to the student when you save a quote
- Responsive mobile-friendly layout

## Run locally
1. Install Node.js 20+.
2. Extract this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set a strong `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD_HASH`.
   Generate a password hash with:
   `node -e "console.log(require('bcryptjs').hashSync('YourStrongPassword', 12))"`
6. Configure SMTP details in `.env` to enable email notifications.
7. Run `npm start`.
8. Visit `http://localhost:3000` for the website and `http://localhost:3000/admin.html` for the admin dashboard.

## Important before going live
- This is a deployable starter application, not yet hosted publicly.
- Email notifications require working SMTP credentials. Without them, requests still save to the database but no email is sent.
- Use HTTPS in production. Set `NODE_ENV=production`, use a strong unique session secret, and use a hosting provider with persistent disk storage for SQLite and uploaded files.
- Configure backups, privacy notice, retention/deletion process, terms, contact details and cookie/session disclosures as appropriate.
- Consider adding rate limiting, CSRF protection, malware scanning for uploads, and a managed database/object storage service before public launch.
- Only collect information needed to assess the requested tutoring, planning, proofreading or feedback service. Follow UK GDPR and applicable data-protection requirements.
- The service is positioned around academic support and student-authored work, not ghostwriting or misrepresenting authorship.
