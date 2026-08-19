# Alsamos Social

Set Alsamos logo.
Real auth->real users->real work social platform.

Build social.alsamos.com — the official global Alsamos Social Network.

Platform Requirements:

100% real, production-level frontend + backend

Premium, ultra-modern UI/UX (Alsamos design language only)

First Screen → Only Registration / Login

No introduction until user authenticates

Left-side universal navigation (Alsamos Navigation System)

Fully AI-powered system

Deep integration across Alsamos Ecosystem:

accounts.alsamos.com

pay.alsamos.com

drive.alsamos.com

maps.alsamos.com

cloud.alsamos.com

numbers.alsamos.com

ai.alsamos.com

Enterprise-grade security

Smooth adaptive animations

Dark + Light themes

Real-time WebSocket engine

PWA + Mobile App ready

SEO optimized

Zero demo content — every feature must be real and functional

1. FIRST SCREEN — UNIVERSAL AUTHENTICATION PAGE
(MUST be the first and only thing user sees before login)

When a user enters social.alsamos.com, they must instantly see:

Universal Login / Sign Up System
UI Requirements
Ultra‑minimalistic premium Alsamos-style interface

Centered authentication card

Soft 3D depth, micro‑shadows, subtle gradients

Elegant fluid transitions

Dynamic background with gentle animated gradient

Alsamos Social logo placed at the top

Tagline:
“Welcome to the next generation of intelligent social connectivity.”

Login Methods (ALL real OAuth2 flows via accounts.alsamos.com)
Login with Alsamos ID

Login with Email (all providers)

Login with Phone Number (global numbers + Alsamos Online Numbers)

Login with Google

Login with Apple

(Optional) Login with Yandex / Outlook / Yahoo

Security Layer
Device binding

FaceID / TouchID support

Session fingerprinting

AI fraud detection

Zero tracking

Multi-session control

IP anomaly detection

Kids Safe Mode protection

Signup Button
“Create Alsamos Account → accounts.alsamos.com/signup”

Footer
Privacy • Terms • Help Center

2. MAIN APPLICATION LAYOUT (After Login Only)
After successful login, redirect user to:

👉 social.alsamos.com/home

This is where the actual platform becomes visible.

Global UI Layout Structure
LEFT SIDEBAR — Alsamos Navigation System
A universal navigation column designed in authentic Alsamos design style.

Menu Items
Home

Search

Videos

Messages

Marketplace

Map

Notifications

Create (upload)

Profile

Settings

Admin (if authorized)

Sidebar Behavior
Premium thin-line icons

Motion‑responsive hover effects

Smooth transitions

Collapsible for smaller devices

Fixed left alignment

PAGE 2 — FEED PAGE (SmartFeed)
A next-gen intelligent feed system designed only with Alsamos identity.

Features
Infinite adaptive scroll

AI-personalized content ordering

Story circles at top

“Moments” (1‑second micro-stories)

Feed filters:

Global

Friends

Business

Marketplace

Travel

Kids

No advertisements

Automatic subtitles

AI-enhanced videos

Likes, comments, shares, bookmarks

Real-time comments via WebSocket

Live badges and status indicators

PAGE 3 — PROFILE PAGE
Three profile modes:

Personal

Business / Creator

Kids Profile

Sections
Cover photo

Avatar

Follow / Connect

Posts grid

Videos tab

Marketplace items tab

Collections

Drive backup integration

Live streams

Profile statistics

AI Profile Tools
AI Profile Manager

Auto bio generation

Auto captions

Hashtag generator

Growth insights

PAGE 4 — MESSAGING PAGE (Super Messenger)
An advanced communication hub with Alsamos-native features.

Features
End‑to‑end encrypted chats

Voice & video messages

Large file transfer (up to 1TB via Drive)

Integrated payments

Payment history toggle

Secret chat mode

Vanish mode

Groups & channels

Real-time translation

AI reply suggestions

Saved messages with Drive sync

PAGE 5 — MARKETPLACE PAGE
A modern video-first commerce experience.

Features
Products linked inside videos

Tap → product card

Instant checkout (Alsamos Pay)

Seller dashboard

Shipping integration

Inventory management

Live-shopping streams

AI Seller Tools
Auto product descriptions

Auto pricing

Auto tags

Trend predictions

PAGE 6 — MAP PAGE (Alsamos Map Intelligence)
A location-based content and interaction system.

Features
Real-time user map

Hotspots

Registon

Ichan Qal’a

Global landmarks

Geo-feed

Nearby users

Local events

Business locations

Marketplace items by area

Location privacy

AI Map Engine
Smart recommendations

Travel suggestions

Kids-safe route detection

PAGE 7 — VIDEO SYSTEM PAGE
A dedicated video platform for short and long formats.

Features
AI subtitles

Video enhancement

Auto effects

Monetization

Tipping (Alsamos Pay)

Creator console

SEO optimization

PAGE 8 — LIVE STREAM PAGE
Features
Multi-host

Real-time chat

Shopping integration

Gift system

Anti-lag AI

Analytics dashboard

PAGE 9 — SETTINGS PAGE
Options
Privacy

Device history

Login history

Payment history

Kids mode

Language

AI customization

Drive backups

Ecosystem integrations

PAGE 10 — ADMIN PANEL (Alsamos Control Center)
Features
AI-first moderation

Global analytics

Reports system

Abuse detection

Fraud detection

Child-safety tools

Moderator logs

AI INTEGRATION — Required Everywhere
AI Engines
Feed AI (ranking, personalization)

Vision AI (moderation, blur, enhancement)

NLP AI (chat, translation, toxicity filtering)

Marketplace AI (seller automation)

Map AI (location analysis)

Profile AI (growth optimization)

Moderator AI (fraud & abuse monitoring)

FULL TECHNICAL ARCHITECTURE
Frontend
Next.js 14

React

Tailwind Premium Design System

Framer Motion

WebSockets

PWA

AppShell Architecture

Backend
Node.js (NestJS) or Go

Microservices

Redis

Kafka

PostgreSQL

ElasticSearch

Cloud Object Storage

ai.alsamos.com

pay.alsamos.com

drive.alsamos.com

maps.alsamos.com

Security
Biometrics

JWT + Refresh

Device fingerprinting

End-to-end encryption

DDoS protection

Zero tracking

FINAL FLOW (MANDATORY)
1️⃣ User enters → social.alsamos.com
Display ONLY:

Login / Sign up

🚫 No introduction
🚫 No home page
🚫 No feed

2️⃣ After login → social.alsamos.com/home
Now show:

Home

Feed

Introduction sections

Entire platform

This is the complete, polished, Alsamos‑exclusive, brand-pure version of your production prompt.
Build a fully functional, Telegram-like Messaging Module for social.alsamos.com where everything happens INSIDE the Messages page, including:

Search area

Create (+) button

Internal tabbar (NOT global navigation)

Chats list under the tabbar

Chat window on the right

IMPORTANT:
The tabbars Private, Groups, Channels, Requests MUST live inside Messages, NOT in sidebar and NOT as main navigation items.

🟣 MESSAGES LAYOUT (DESKTOP FIRST)

The Messages page is divided into two columns:

LEFT COLUMN — MESSAGES PANEL (Telegram-like)

Everything below belongs strictly inside the Messages module.

1. Search Area (TOP inside Messages)

A rounded search bar

Lives at the top inside Messages

NOT a global site search

Search inside:

users

groups

channels

messages

files

Real-time suggestions

AI semantic search

2. Create Button (+)

Located inside the Messages left panel, next to the search bar.

Pressing + opens a create menu:

New Private Chat

New Group

New Channel

New Secret Chat

New Private Space

Button designed in Alsamos premium style.

3. INTERNAL MESSAGES TABBAR (MOST IMPORTANT)

This tabbar exists inside Messages, directly under the search & create section.
Clear structure:

TABBAR ITEMS:

Private

Groups

Channels

Requests

This tabbar is NOT part of the main navigation.
It belongs ONLY to the Messages module.

4. LIST AREA BELOW TABBAR

This section shows different content depending on selected tabbar item:

Private Tab →

List of private 1:1 conversations.

Groups Tab →

List of user’s groups.

Channels Tab →

List of subscribed/owned channels.

Requests Tab →

Inbox for message requests, group invites, channel invites.

Every item in the list must show:

Avatar

Name

Last message preview

Time

Unread count

Online/typing indicators

Scrolling must use custom Alsamos scrollbar, not default.

🔵 RIGHT COLUMN — CHAT WINDOW

This area shows the active chat for whichever item is selected from Private, Groups, Channels, or Requests.

Chat Window Content:

Chat header

Message history

Input bar

Attachments

Voice/video call buttons

The design must resemble Telegram but upgraded to Alsamos premium UI.

⭐ CHAT WINDOW — FULL FUNCTIONALITY
Chat Header

Avatar

Name

Online/offline status

Menu:

View profile

Clear chat

Export chat

Delete

Mute

Block

Messages Area

Supports:

✔ Text messages
✔ Images
✔ Videos
✔ Audio messages
✔ Voice notes (hold to record)
✔ Files (up to 1TB)
✔ Links with preview
✔ Markdown
✔ Stickers
✔ GIFs
Message Actions

Reply (inline preview)

Forward

Edit

Delete (for me / everyone)

Reactions

Copy text

Save to Alsamos Drive

Seen status

Delivered status

Typing Indicators

Real-time “typing…” animation.

Message Status

Alsamos-style:

Sent

Delivered

Seen (with timestamp)

🔥 CALLING FEATURES (Telegram-like but Premium)
Voice Call

HD sound

End-to-end encrypted

Video Call

1080p HD

Background blur AI

Picture-in-picture

Group Calls

Up to 50 members

All calls triggered from the top-right header inside the chat window.

🟢 GROUPS & CHANNELS (Messages Internal Behavior)
Groups

Multiple admins

Permissions

Pinned messages

Polls

Slow mode

Join links

Channels

Unlimited subscribers

Post scheduling

Reactions

View counters

Marketplace product tagging

🟣 REQUESTS TAB (INSIDE MESSAGES)

Shows:

Message requests

Contact requests

Group invites

Channel invites

User can accept/decline.

🧠 AI FEATURES (MANDATORY)
Inside Messages module:

AI auto-reply suggestions

AI auto-translation (real time)

AI toxicity filter

AI voice transcribe

AI semantic search

AI message summarization

AI smart suggestions (stickers, GIFs, emojis)

🔐 SECURITY

End-to-end encrypted messages

Secret chats

Vanish mode

Device-bound keys

Screenshot detection (optional)

Zero tracking

Privacy-first architecture

⚙ TECH STACK

React / Next.js

TailwindCSS

Framer Motion

WebSockets

NestJS or Go backend

Redis

Kafka

PostgreSQL

WebRTC for calls

Alsamos Cloud (media)

Alsamos AI (NLP + Vision)
Implement a complete WebRTC infrastructure for multi-user video calls, audio rooms, and live streaming. The system must not be limited to local-only camera previews — instead, it must transmit and receive real participant video and audio streams in real time, with dynamic join/leave support, multiple peer connections, and full media synchronization across all users.

This includes the following:

🟣 Signaling Server (via WebSockets)

Exchange of Offer/Answer (SDP)

Exchange of ICE candidates

Room-based session management (Room ID / Group ID)

Real-time participant list synchronization

🟢 Individual RTCPeerConnection per participant

Multiple peer connections (one-to-many / many-to-many)

Simulcast / SVC support for improved bandwidth usage

Dynamic bitrate & resolution adjustments

🔵 Real participant media streams

The system must transmit and receive:

Real video streams from each participant

Real audio streams from each participant

Screen sharing streams

Support for adaptive video quality (360p → 720p → 1080p)

Automatic network optimization

🔥 Group video calls (3 to 50+ users)

Dynamic grid layout (Telegram/Zoom style)

Active speaker detection

Avatar fallback when camera is off

Real-time connection health monitoring

🟠 Audio/Video chat inside groups

Mute/unmute

Camera on/off

Hand raise

In-call text chat

Role-based permissions (host, speaker, listener)

🟡 Live Streaming support

Host → unlimited viewers

WebRTC → HLS hybrid streaming

Real-time chat

Reactions (❤️🔥😂 etc.)

Screen sharing for streamers

Low-latency broadcast mode

🧊 TURN/STUN server integration

NAT traversal

Stable connections even on restricted networks

Enterprise-grade TURN (Coturn)

Automatic fallback logic

🟩 Device controls

Switch camera

Switch microphone

Select audio output (speaker/headphones)

Real-time device hot-swapping

🧠 AI & Quality Enhancements

Background blur (AI)

Noise suppression

Echo cancellation

Auto-gain control

Picture-in-picture view

Floating mini-video window

⭐ FINAL FULL VERSION (Short, polished)

Implement a full WebRTC-based multi-user communication system for the Alsamos platform. It must support real-time video/audio transmission between all participants, using multiple RTCPeerConnections instead of local-only previews. The system must include signaling (WebSockets), ICE candidate exchange, simulcast/SVC, TURN/STUN integration, adaptive video quality, group video calls (3–50+ users), audio rooms, real-time chat inside calls, livestream broadcasting with unlimited viewers, screen sharing, AI background blur, noise suppression, and dynamic participant management. All features must be stable, scalable, and optimized for low-latency real-time communication.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://socialalsamos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3898e601-fc77-4b65-840a-e12a51bbb21e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
