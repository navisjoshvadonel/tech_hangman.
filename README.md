<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/master/icons/terminal.svg" width="80" alt="Terminal Icon">
  <h1>𝗧 𝗛 𝗘  _ 𝗛 𝗔 𝗡 𝗚 𝗠 𝗔 𝗡</h1>
  <p><strong>A Cyberpunk-Themed, Professional Hangman Game for Software Engineers.</strong></p>
  
  ![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
  ![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
</div>

---

## 🚀 Overview

**Tech Hangman** is not your standard word-guessing game. Originally built as a Vanilla HTML/JS prototype with a Python backend, it has been completely re-architected into a **type-safe, component-driven Next.js application**. 

The game features a stunning neon-cyberpunk aesthetic, a custom-built high-performance "Cyber Cursor", and a massive dictionary of **over 1,600 technical engineering terms** across 16 different domains.

### ✨ Key Features
- **16 Technical Domains**: From `CUDA` and `Docker` to `Kubernetes` and `B-Trees`.
- **Custom Cyber Cursor**: A silken-smooth `requestAnimationFrame` trailing cursor that reacts to interactive elements.
- **Cinematic UI**: Complete with text unscrambling, neon pulse glows, and dynamic SVG illustrations.
- **Standalone Frontend**: The Next.js app has been decoupled from the Python SQLite backend, allowing for seamless deployment to Vercel.

---

## 📂 Project Architecture

To adhere to industry-standard patterns, the repository is modularized:

```
techn_hangman/
├── frontend/             # The Next.js 14 App Router (React, Tailwind)
├── backend/              # Python Flask API & SQLite `hangman.db`
└── legacy-frontend/      # The original vanilla HTML/CSS archive
```

---

## 🛠️ Getting Started (Local Development)

### 1. The Next.js Frontend (Recommended)
This is the modern React implementation of the game. It uses an internal Next.js API route to fetch words seamlessly.

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 2. The Python Backend (Optional)
If you wish to explore the SQLite database or run the classic Flask API:

```bash
# Navigate to the backend directory
cd backend

# Start the Flask server
python server.py
```
The server runs on `http://127.0.0.1:5000`.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
<div align="center">
  <i>Developed to perfection by Navis Joshva Donel.</i>
</div>
