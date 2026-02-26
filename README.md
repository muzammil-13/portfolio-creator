# ⚡️ GitHub Portfolio Creator

> Turn a GitHub username into a sharp, shareable portfolio in seconds.

Built with **Codex AI**, this tool transforms raw GitHub metadata into a high-fidelity, recruiter-ready professional site. No more manual portfolio updates—just fetch, filter, and export.

---

## ✨ Key Features

* **🧠 Intelligent Parsing**: Automatically extracts your Bio, Profile Stats, and README-based "About" section.
* **🤖 AI-Powered Summary**: Generates a technical elevator pitch based on your top coding languages and contributions.
* **🎯 Smart Filtering**: A dedicated **Filter Dropdown** to showcase your "Greatest Hits" by Stars, Activity, or Forks.
* **📦 One-Click Exports**:
  * **PNG Snapshot**: Perfect for a quick "flex" on X or LinkedIn.
  * **Recruiter PDF**: A clean, paginated document for job applications.
  * **Standalone ZIP**: A portable, static HTML/CSS bundle to host anywhere.
* **🚦 Rate-Limit Shield**: Integrated **Live Status & Countdown** tracker to manage GitHub's API limits gracefully.

---

## 🛠 Tech Stack

| Category              | Tools                                 |
| :-------------------- | :------------------------------------ |
| **Frontend**    | React + TypeScript + Vite             |
| **Styling**     | Tailwind CSS (Dark Mode Optimized)    |
| **API**         | GitHub REST API                       |
| **The "Magic"** | Codex AI CLI (Logic Generation)       |
| **Exports**     | `html2canvas`, `jsPDF`, `JSZip` |

---

## 🚀 Getting Started

1. **Clone & Install**
   ```bash
   git clone [https://github.com/your-username/github-portfolio-creator.git](https://github.com/your-username/github-portfolio-creator.git)
   cd github-portfolio-creator
   npm install

   ```

```

```

2. **Launch Dev Environment**

```bash
npm run dev
```

3. **Build for Production**

```bash
npm run build
```

---

## 📸 See it in Action

### The Dashboard

*Two-column layout designed for maximum readability.*
![alt text](docs/screenshots/GitHub-Portfolio-Creator.png)

### Smart Filtering

*Switch between "Most Starred" and "Most Active" instantly.*
<!-- paste GIF here showing filters -->
---

## 💡 Notes & Usage

* **No Auth Required**: Designed to work with public data only.
* **API Awareness**: If you hit a rate limit, the UI will automatically disable inputs and show you exactly when the "cooldown" ends.
* **Vibe Coding**: This project was scaffolded and refined using the **Codex AI CLI**.

---

## 🏆 Credits

Proudly built for the **MakeSomething Workshop**.

```

---