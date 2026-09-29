# 🎓 CampusFix AI — College Problem Reporting & Resolution System

CampusFix AI is an automated campus problem reporting and workflow resolution web application. It features automated AI complaint classification, duplicate issue detection, photo upload analysis, email/in-app notifications, and role-based portals for students and administrators.

---

## 🚀 Running the Project

The server is currently running live on your system at:
- **Main Portal:** [http://localhost:3000](http://localhost:3000)
- **Student Portal:** [http://localhost:3000/student/](http://localhost:3000/student/)
- **Admin Dashboard:** [http://localhost:3000/admin/](http://localhost:3000/admin/)

### How to restart or run again anytime:
Double-click `start.bat` or run:
```bash
node server.js
```
or
```bash
npm start
```

---

## 🔐 Credentials & Authentication

The system uses OTP-based passwordless authentication with instant local demo bypass:

| Portal | Recommended Email | Verification Code |
| :--- | :--- | :--- |
| **Student Portal** | `student@campus.edu` (or any email) | `123456` |
| **Admin Dashboard** | `admin@campus.edu` | `123456` |

> Any 6-digit code or `123456` can be entered for quick testing.

---

## 🤖 AI Features Included

1. **Automated Complaint Classification**:
   - Analyzes title, description, and campus location.
   - Automatically determines:
     - **Category**: Electrical, Plumbing, Network/IT, Classroom, Laboratory, Hostel, Cleanliness, Security, Other
     - **Priority**: Critical, High, Medium, Low
     - **Department**: Automatically routed to the relevant college authority.

2. **Smart Duplicate Detection**:
   - Compares newly submitted complaints against existing open issues in the database.
   - Computes similarity and marks duplicates with confidence score and reference ID.

3. **Image Vision Analysis**:
   - Supports uploading photos with complaints.
   - Stores photos and analyzes the visual defect automatically.

4. **Multi-Channel Notifications**:
   - In-app notification feed.
   - Real-time resolution notifications when administrators update status.
   - Automatic email simulation logged directly to console.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js v24 (Native ESM, Built-in HTTP, Built-in SQLite)
- **Database**: SQLite (`campusfix.db`) with PostgreSQL compatibility emulation
- **Frontend**: Responsive HTML5, Modern CSS, Native Fetch API
