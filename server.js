const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const multer = require("multer");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");
fs.mkdirSync(UPLOADS, {recursive:true});
if (!process.env.SESSION_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) {
  console.error("Missing SESSION_SECRET, ADMIN_EMAIL or ADMIN_PASSWORD_HASH in .env");
  process.exit(1);
}
const db = new Database(path.join(DATA, "requests.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 email TEXT NOT NULL, language TEXT NOT NULL, service TEXT NOT NULL, subject TEXT,
 deadline TEXT, word_count INTEGER, study_level TEXT, details TEXT NOT NULL,
 file_name TEXT, stored_name TEXT, status TEXT NOT NULL DEFAULT 'New',
 quote_amount REAL, quote_message TEXT, created_at TEXT NOT NULL
)`);
app.disable("x-powered-by");
app.use(express.json({limit:"100kb"}));
app.set("trust proxy", 1);
app.use(session({
  store: new SQLiteStore({db:"sessions.sqlite",dir:DATA}),
  secret:process.env.SESSION_SECRET, resave:false, saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(ROOT,"public")));
const upload = multer({
 storage:multer.diskStorage({destination:UPLOADS,filename:(req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())}),
 limits:{fileSize:10*1024*1024,files:1},
 fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();cb(null,[".pdf",".doc",".docx",".ppt",".pptx",".txt"].includes(ext));}
});
async function sendMail(options){
  if(!process.env.RESEND_API_KEY){
    console.warn("Resend API key not configured; email skipped.");
    return false;
  }

  const response = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      from:process.env.MAIL_FROM || "Cheap Assignments UK <notifications@cheapassignments.co.uk>",
      to:[options.to],
      subject:options.subject,
      text:options.text
    })
  });

  const result = await response.json();

  if(!response.ok){
    throw new Error(result.message || "Resend email failed");
  }

  return true;
}
function admin(req,res,next){if(req.session.admin===true)return next();return res.status(401).json({error:"Please sign in."});}
app.post("/api/quote-requests",upload.single("brief"),async(req,res)=>{
 try{
  const {name,email,language,service,subject,deadline,wordCount,studyLevel,details,consent}=req.body;
  if(!name||!email||!service||!details||consent!=="on")return res.status(400).json({error:"Please complete all required fields and consent."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});
  if(req.file===undefined && req.headers["content-type"]?.includes("multipart/form-data")) { /* attachment is optional */ }
  const reference="UAH-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  const created=new Date().toISOString();
  const info=db.prepare(`INSERT INTO requests(reference,name,email,language,service,subject,deadline,word_count,study_level,details,file_name,stored_name,created_at)
   VALUES(@reference,@name,@email,@language,@service,@subject,@deadline,@word_count,@study_level,@details,@file_name,@stored_name,@created_at)`).run({
    reference,name:name.trim().slice(0,120),email:email.trim().slice(0,254),language:language==="Romanian"?"Romanian":"English",
    service:service.slice(0,180),subject:(subject||"").slice(0,180),deadline:(deadline||"").slice(0,30),
    word_count:wordCount?Math.min(100000,Math.max(0,Number(wordCount)||0)):null,study_level:(studyLevel||"").slice(0,80),
    details:details.slice(0,5000),file_name:req.file?path.basename(req.file.originalname).slice(0,200):null,
    stored_name:req.file?req.file.filename:null,created_at:created
   });
  const id=info.lastInsertRowid;
  sendMail({to:process.env.ADMIN_EMAIL,subject:`New quote request ${reference}`,text:`New quote request received.\nReference: ${reference}\nName: ${name}\nEmail: ${email}\nService: ${service}\nSubject: ${subject||"—"}\nDeadline: ${deadline||"—"}\nDetails:\n${details}\n\nSign in to the admin dashboard to review and quote.`}).catch(e=>console.error("Admin notification email failed:",e.message));
  res.status(201).json({ok:true,id,reference});
 }catch(e){console.error(e);res.status(500).json({error:"Could not save request. Please try again."});}
});
app.post("/api/admin/login",(req,res)=>{
 const {email,password}=req.body||{};
 if(String(email||"").toLowerCase()!==process.env.ADMIN_EMAIL.toLowerCase()||!bcrypt.compareSync(String(password||""),process.env.ADMIN_PASSWORD_HASH))return res.status(401).json({error:"Invalid email or password."});
 req.session.admin=true;res.json({ok:true});
});
app.get("/api/admin/me",admin,(req,res)=>res.json({ok:true}));
app.post("/api/admin/logout",admin,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/requests",admin,(req,res)=>{
 const requests=db.prepare("SELECT id,reference,name,email,language,service,subject,deadline,word_count,study_level,details,file_name,status,quote_amount,quote_message,created_at FROM requests ORDER BY id DESC").all();
 res.json({requests});
});
app.get("/api/admin/requests/:id/file",admin,(req,res)=>{
 const r=db.prepare("SELECT file_name,stored_name FROM requests WHERE id=?").get(Number(req.params.id));
 if(!r||!r.stored_name)return res.status(404).send("File not found");
 const p=path.join(UPLOADS,path.basename(r.stored_name));if(!fs.existsSync(p))return res.status(404).send("File not found");
 res.download(p,r.file_name);
});
app.post("/api/admin/requests/:id/status",admin,(req,res)=>{
 const allowed=["New","Under review","Quote sent","Accepted","Declined","Completed"];
 if(!allowed.includes(req.body.status))return res.status(400).json({error:"Invalid status."});
 const result=db.prepare("UPDATE requests SET status=? WHERE id=?").run(req.body.status,Number(req.params.id));
 if(!result.changes)return res.status(404).json({error:"Request not found."});
 res.json({ok:true});
});
app.post("/api/admin/requests/:id/quote",admin,async(req,res)=>{
 const id=Number(req.params.id),amount=Number(req.body.amount),message=String(req.body.message||"").slice(0,4000);
 if(!Number.isFinite(amount)||amount<=0||!message.trim())return res.status(400).json({error:"Enter a valid quote amount and message."});
 const r=db.prepare("SELECT * FROM requests WHERE id=?").get(id);if(!r)return res.status(404).json({error:"Request not found."});
 db.prepare("UPDATE requests SET quote_amount=?,quote_message=?,status='Quote sent' WHERE id=?").run(amount,message,id);
 let emailed=false;
 try{emailed=await sendMail({to:r.email,subject:`Your academic support quote — ${r.reference}`,text:`Hello ${r.name},\n\nThank you for your enquiry. Here is your personalised quote.\n\nReference: ${r.reference}\nService: ${r.service}\nQuote: £${amount.toFixed(2)}\n\n${message}\n\nPlease reply to this email if you would like to discuss the quote.\n\nCheap Assignments UK`});}catch(e){console.error("Student quote email failed:",e.message);}
 res.json({ok:true,emailSent:emailed});
});
app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.listen(PORT,()=>console.log(`Cheap Assignments UK running on http://localhost:${PORT}`));
