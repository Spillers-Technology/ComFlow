# 🎧✨ AI-SIP Voice Agent Dashboard

*An intuitive, delightful dashboard to turn SIP extensions into intelligent conversational agents—powered by AI.*

---

## 🚀 Overview

Welcome to **AI-SIP Voice Agent Dashboard**, a sleek web-based administration interface built on the robust **drachtio** SIP stack, designed specifically for creating and managing AI-driven voice agents for SIP-based phone systems. Each extension you manage here can independently handle calls, transforming audio conversations into seamless dialogues with powerful Large Language Models (LLMs) like **ChatGPT** and **Ollama**.

---

## 🌟 Why does this exist?

* **Elevate your SIP** 📞: Plain phones are so last century. Upgrade to smart conversational agents without expensive licenses or complex setups.
* **Personalized Conversations** 💬: Your agents don't just answer—they understand, respond naturally, and hand off to humans gracefully.
* **Plug-and-Play Simplicity** 🔌: Just plug in your SIP credentials, configure your preferred AI backend, and start making your extensions smarter instantly.

---

## 🎯 Core Features

### 📡 SIP Integration with Drachtio

* Simple SIP credential management for multiple extensions.
* Built on **drachtio** for industry-grade reliability and easy scaling.

### 🤖 AI-Powered Conversation

* Real-time conversational AI integration.
* Supports:

  * ✅ OpenAI's **ChatGPT**
  * ✅ **Ollama** (OpenAI-compatible local models)
* Speech-to-Text (**STT**) exclusively powered by **ElevenLabs** for superior accuracy and ultra-low latency.

### 🎙️ Real-Time Audio Streaming

* Seamlessly convert live SIP audio streams to STT and back to crystal-clear TTS audio.
* Visual latency indicators ensure you're always aware of real-time audio delivery performance.

### ⚙️ Admin Console & UX

* Clean, intuitive, modern dashboard interface.
* Fine-tune performance, latency, and audio quality with easy-to-use sliders and toggles.
* Color-coded statuses to instantly understand agent health and activity:

  * 🟢 Green: Agent active and healthy.
  * 🟡 Yellow: Latency warnings.
  * 🔴 Red: Agent inactive or critical errors.

---

## 🎨 Interface Highlights

```plaintext
+-------------------------------------------------------+
| 🎧 AI-SIP Voice Agent Dashboard                        |
|                                                       |
| [🟢 Extension 1001] [🟢 Extension 1002] [🟡 Extension 1003] |
|                                                       |
| 🔈 Speed / Latency: 120ms ✅                           |
| 🔥 Active Calls: 3                                    |
|                                                       |
| [⚙️ Configure SIP] [🤖 Choose AI Backend] [🔧 Audio Tweaks] |
+-------------------------------------------------------+
```

---

## 🚧 Project Scope & Purpose

**Scope**:

* Manage multiple SIP credentials and handle multiple simultaneous calls.
* Provide a unified web UI to configure extensions, manage SIP credentials, and monitor call quality and agent performance.
* Integrate with AI endpoints (OpenAI and Ollama) via REST APIs.
* Use ElevenLabs exclusively for STT to ensure premium quality and speed.
* Provide visual real-time metrics to monitor audio streaming performance.

**Purpose**:

* To empower organizations to easily deploy AI-powered phone agents.
* Enhance customer interactions by delivering seamless and intelligent automated voice conversations.
* Minimize reliance on costly enterprise licenses by leveraging open and compatible tools.

---

## 🛠️ Tech Stack

* **Backend:** Node.js, Drachtio SIP server, ElevenLabs STT
* **Frontend:** React.js, Tailwind CSS, Framer Motion (for delightful UI interactions)
* **AI Integration:** OpenAI GPT-4o (via API), Ollama (local model deployment)
* **Deployment:** Docker & Docker Compose for quick, reliable setup

---

## 🎈 Getting Started

Clone the repo, set up your `.env` credentials, and run:

```bash
docker-compose up
```

You're ready to answer calls with the smarts and charm of cutting-edge conversational AI!

---

## 📞 Questions? Feedback?

Reach out—we're excited to keep improving!

Happy talking! 🎙️🤖✨

---

## 🚢 Docker Compose

Add a **`docker-compose.yml`** at the project root with a minimal stack that bundles the SIP core, AI back‑end, and the web UI:

```yaml
version: '3.9'
services:
  drachtio:
    image: drachtio/drachtio-server:latest
    container_name: drachtio
    environment:
      - DRACHTIO_SECRET=changeme           # shared with backend
    ports:
      - "9022:9022"                       # drachtio signalling TCP
      - "5060:5060/udp"                   # SIP UDP

  rtpengine:
    image: sipcapture/rtpengine:latest
    network_mode: service:drachtio         # rejoins drachtio network stack
    depends_on:
      - drachtio

  backend:
    build: ./server                        # Node.js/Express API
    environment:
      - DRACHTIO_HOST=drachtio
      - DRACHTIO_SECRET=changeme
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SQLITE_PATH=/data/ai-sip.sqlite
    volumes:
      - ./server:/usr/src/app
      - sqlite_data:/data
    depends_on:
      - drachtio
      - rtpengine

  frontend:
    build: ./client                       # Vite/React admin console
    ports:
      - "3000:3000"                      # http://localhost:3000
    environment:
      - VITE_API_BASE=/api
    volumes:
      - ./client:/usr/src/app
    stdin_open: true
    tty: true

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"                     # optional local LLM endpoint
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped

volumes:
  sqlite_data:
  ollama_data:
```

> **Tip:** Keep a `.env` at the repo root with your `ELEVENLABS_API_KEY` and `OPENAI_API_KEY` for clean secrets injection.

---

## 🖥️ macOS Quick‑Start (Intel, no Docker Desktop)

```bash
# 1. Install a lightweight Docker runtime & Node build tools
brew install colima docker docker-compose npm

# 2. Fire up the VM (4 CPUs, 6 GB RAM, adjust as needed)
colima start --cpu 4 --memory 6 --disk 60

# 3. Confirm Docker is running
docker info | head -n 5

# 4. Clone your repo and jump in
# (you already have it via GitHub Desktop, so just cd there)
cd ~/path/to/your/repo

# 5. Scaffold missing directories/files if they aren’t present
mkdir -p server client && touch server/Dockerfile client/Dockerfile docker-compose.yml .env

# 6. Copy the docker‑compose.yml contents above into the new file
#    (or use `pbpaste > docker-compose.yml` if it’s on your clipboard)

# 7. Bring the whole stack online
docker-compose up --build
```

You’re now running the complete AI‑powered SIP agent suite locally on your 2020 MacBook Air—no Docker Desktop required. Happy testing and hacking! 🎉🎙️
