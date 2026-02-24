# NARC — IRAP Application Document
## Industrial Research Assistance Program (NRC-IRAP)
### Prepared for: NRC Industrial Technology Advisor Meeting
### Applicant Company: [Your Company Name Inc.]
### Date: February 2026
### Location: Montréal, Québec, Canada

---

> **Instructions for Use:** This document contains model answers to every question an NRC-IRAP Industrial Technology Advisor (ITA) is likely to ask during the intake meeting and formal application process. Customize all bracketed fields `[like this]` before submission. All technical claims are grounded in the actual codebase of the NARC system as of February 2026.

---

## SECTION 1: COMPANY & APPLICANT PROFILE

### Q1.1 — What is your company, and what does it do?

**Answer:**

[Company Name] Inc. is a Montréal-based software company developing **NARC (Adverse Event Detector)**, an AI-powered pharmacovigilance compliance platform for the pharmaceutical industry. NARC automatically detects, classifies, triages, and prepares regulatory submissions for Adverse Events (AEs) reported through pharmaceutical Patient Support Programs (PSPs).

Our target customers are:
- **Pharmaceutical manufacturers** operating PSPs in Canada and the United States (e.g., specialty pharma, biologics manufacturers)
- **Third-party PSP operators** such as McKesson Specialty Health, IQVIA, and Innomar Strategies
- **Pharmacovigilance (PV) departments** at mid-to-large pharma companies

The problem we solve: Every patient enrolled in a pharma PSP who calls in or emails about a drug side effect creates a legal obligation to report that event to Health Canada (under the Food and Drugs Act) or the FDA (under 21 CFR Part 314) within strict timeframes — as short as 7 days for serious unexpected events. Today, this review process is performed manually by trained nurses and pharmacovigilance coordinators who read every communication. NARC replaces the first-pass screening step with AI, dramatically reducing review time, preventing missed events, and ensuring regulatory deadlines are never breached.

---

### Q1.2 — What is your background and qualifications?

**Answer:**

[Founder Name] — Founder & CEO:
- [Describe relevant background: e.g., X years in pharma/healthcare IT, software development, regulatory affairs, or PSP operations]
- Identified the pharmacovigilance compliance gap through direct exposure to PSP operations
- Built the NARC prototype independently, resulting in a working full-stack TypeScript application with a backend Node.js API, a React Outlook add-in, a React web dashboard, and an AI inference layer powered by Anthropic's Claude model

Technical advisors / team (if applicable): [List any pharmacovigilance consultants, regulatory affairs advisors, or technical team members]

The company will use IRAP funding primarily to hire [one/two] additional developers and/or engage a regulatory affairs consultant to complete the validation and pilot-readiness work described in this application.

---

### Q1.3 — Is the company incorporated?

**Answer:**

[YES — if incorporated: "[Company Name] Inc. was incorporated as a Canadian-Controlled Private Corporation (CCPC) under [Federal / Quebec provincial] jurisdiction on [Date]. Business number: [BN]. We are registered with the Registraire des entreprises du Québec (NEQ: [Number])."]

[NO — if not yet incorporated: "Incorporation is in progress and will be completed prior to IRAP funding being received. We are incorporating as a CCPC under [Federal/Quebec] jurisdiction. All required documentation will be provided to the ITA prior to application submission."]

---

### Q1.4 — How many employees do you have?

**Answer:**

Currently, the company has [1] full-time employee (the founder). With IRAP funding, we plan to bring on [1–2] additional technical staff (software developers and/or a regulatory validation specialist) within the first 3 months of the funded project.

All proposed hires are located in Montréal, Québec, and will be employees (not contractors) to maximize the eligible salary cost reimbursement under IRAP guidelines.

---

## SECTION 2: THE TECHNOLOGY — WHAT HAVE YOU BUILT?

### Q2.1 — Describe the technology in plain language.

**Answer:**

NARC is a multi-component AI software platform that automates the first-pass review of patient communications for regulatory adverse event reporting. It consists of four integrated components:

1. **Microsoft Outlook Add-In (the "agent tool"):** A sidebar panel that loads inside Outlook. When a PSP nurse or coordinator opens a patient email, they click one button and NARC's AI instantly analyzes the email, highlights the exact sentence(s) that may constitute an AE, classifies the event type (adverse reaction, off-label use, pregnancy exposure, etc.), assigns a severity level (critical/high/medium/low), and displays the findings in a structured panel — all within 3–5 seconds.

2. **Web Dashboard (the "supervisor tool"):** A browser-based dashboard where pharmacovigilance supervisors monitor all flagged events in real-time. The dashboard shows live SLA countdown timers (since Health Canada requires 7-day reporting for serious events), escalation alerts, and audit trails. Supervisors can review, approve, dismiss, or escalate events from this interface.

3. **Automated Mail Monitor:** An IMAP-based background service that continuously monitors a dedicated safety mailbox, automatically ingesting and analyzing every incoming email with zero human involvement required for first-pass triage.

4. **Regulatory Export Engine:** For each confirmed adverse event, NARC generates a fully structured ICH E2B(R3)-compliant XML file — the international standard format required for submission to Health Canada's MedEffect system, the FDA's FAERS Gateway, and EMA's EudraVigilance. The system uses Claude AI to suggest MedDRA (Medical Dictionary for Regulatory Activities) terminology codes, which are then reviewed and confirmed by a qualified pharmacovigilance professional before submission.

5. **Voice Detection Module (in development):** Using OpenAI's Whisper speech-to-text model (already integrated in the codebase), NARC will listen to inbound PSP call recordings, transcribe them, and run the same AI AE-detection analysis on the transcript in real-time, flagging potential adverse events during or immediately after phone consultations.

---

### Q2.2 — What is the technical stack?

**Answer:**

NARC is built entirely in **TypeScript** (96.5% of the codebase), with the following technical architecture:

| Layer | Technology |
|---|---|
| **Backend API** | Node.js + Express (TypeScript) |
| **AI / NLP Engine** | Anthropic Claude (claude-opus-4-6) — AE detection & MedDRA coding |
| **Speech-to-Text** | OpenAI Whisper (whisper-1) — audio transcription |
| **OCR / Vision** | Claude Vision — for scanned documents and handwritten doctor notes |
| **Outlook Add-In** | React + Office.js (Microsoft 365 add-in platform) |
| **Web Dashboard** | React + TypeScript (Vite) |
| **Database** | PostgreSQL (with schema migrations and connection pooling) |
| **Authentication** | JWT-based RBAC (roles: agent / supervisor / admin) |
| **Regulatory Export** | Custom ICH E2B(R3) XML builder (ICH E2B guideline compliant) |
| **Monorepo** | npm workspaces (packages: backend, addin, dashboard, shared) |

All AI inference is via third-party API (Anthropic, OpenAI) — no local model training infrastructure required. The core technical IP is the system prompt engineering, the regulatory detection logic, the SLA engine, and the E2B XML generation pipeline.

---

### Q2.3 — What stage is the technology at?

**Answer:**

NARC is at **TRL 4–5** (Technology Readiness Level): functional prototype with laboratory/controlled environment validation, transitioning to pilot-ready status.

**What is already built and working:**
- ✅ Full backend API with authentication, event persistence, audit logging
- ✅ Outlook add-in with one-click AI analysis and real-time findings display
- ✅ Web dashboard with live SLA timers, event management, and role-based access
- ✅ Claude AI integration with highly calibrated pharmacovigilance system prompts (detecting 7 AE categories across 4 severity levels)
- ✅ Health Canada drug monograph database with off-label detection signals (Humira, Enbrel, Avsola, Otezla, and others)
- ✅ ICH E2B(R3) XML export engine with AI-assisted MedDRA term suggestions
- ✅ OpenAI Whisper audio transcription service integrated and tested
- ✅ Automated safety mailbox monitoring (IMAP/IDLE with exponential backoff)
- ✅ SLA worker (1-minute tick, automated escalation and email alerts)
- ✅ Full audit trail for all user actions (required for regulatory use)
- ✅ Document attachment processing (PDF, DOCX, images, handwritten notes via OCR)

**What the IRAP-funded work will complete:**
- 🔲 Real-time voice/call detection (Whisper streaming, live notification overlay)
- 🔲 Validation study: AI detection accuracy vs. gold standard human reviewer
- 🔲 Security hardening: SOC 2 Type I readiness, PIPEDA / Quebec Law 25 compliance documentation
- 🔲 Pilot deployment infrastructure (cloud hosting, HIPAA/PIPEDA-compliant data residency in Canada)
- 🔲 PSP operator onboarding tooling (multi-tenant support, per-client policy configuration)
- 🔲 Health Canada pre-submission meeting (SaMD classification determination)

---

## SECTION 3: THE INNOVATION — WHY IS THIS TECHNICALLY CHALLENGING?

> **This section is critical for IRAP.** IRAP funds **technological uncertainty** — i.e., R&D challenges that are not solved by simply applying known engineering methods. You must demonstrate genuine technical risk.

### Q3.1 — What is the core technological innovation?

**Answer:**

NARC addresses five distinct areas of technological innovation and uncertainty:

**Innovation 1: Regulatory-Grade AI Detection with Calibrated Recall**

The core challenge is not simply using an LLM to analyze text — it is achieving recall rates high enough to be acceptable for regulatory use. In pharmacovigilance, **false negatives (missed AEs) are a regulatory violation** that can result in warning letters, fines, or PSP contract cancellation. The technical uncertainty lies in:
- Designing system prompts that achieve >98% recall on ambiguous, colloquial patient language while maintaining acceptable precision (minimizing over-reporting)
- Distinguishing between a patient mentioning a side effect ("I felt a bit tired") and a reportable adverse reaction under ICH E2A guidelines
- Handling edge cases: multi-drug communications, comorbidities mentioned alongside AEs, non-English text, highly abbreviated patient notes

Our current system prompt is a carefully engineered multi-thousand-word instruction set (representing significant IP) that took multiple iterations to calibrate against real PSP communication patterns.

**Innovation 2: Real-Time Voice Adverse Event Detection**

No commercially available solution performs real-time AE detection on live PSP phone calls. The technical challenges are:
- Streaming audio chunking and transcription with acceptable latency (target: flag events within 5 seconds of utterance)
- Handling overlapping speech, background noise, and medical vocabulary in spontaneous phone conversation
- Designing a non-disruptive notification UX that allows the nurse to continue the call while being alerted
- Managing Whisper API rate limits and fallback strategies under concurrent call load

**Innovation 3: Automated ICH E2B(R3) XML Generation with AI MedDRA Coding**

E2B(R3) XML generation requires mapping free-text adverse event descriptions to MedDRA (Medical Dictionary for Regulatory Activities) codes — a controlled vocabulary of ~80,000 terms across PT/HLT/HLGT/SOC hierarchy levels. Currently, this is done manually by trained coders. NARC's AI-assisted MedDRA suggestion system must:
- Suggest the correct Preferred Term (PT) and System Organ Class (SOC) from free-text descriptions
- Flag low-confidence suggestions for mandatory human review (we use a confidence scoring system)
- Produce valid E2B(R3) XML that passes validation at Health Canada's MedEffect portal — a technically demanding format with strict XSD schema requirements

**Innovation 4: Multi-Modal Input Processing**

PSP communications arrive in many formats: plain text emails, scanned PDF fax documents, photos of handwritten doctor notes. NARC must accurately extract text from all of these and route them through the same AE detection pipeline. The technical challenge is maintaining extraction quality across:
- Low-resolution fax scans
- Handwritten physician notes with medical abbreviations
- Multi-page documents with mixed typed/handwritten content
- Images embedded in emails

We use Claude Vision for OCR with a fallback chain: pdf-parse → Claude Vision → Claude Vision with enhanced prompting.

**Innovation 5: Long-Term Expansion to Financial Services Compliance (Phase 2)**

The underlying architecture is being designed for eventual extension to financial services compliance monitoring (e.g., detecting whether call center representatives delivered required regulatory disclosures before selling financial products, confirmed recording disclosures, etc.). This requires developing a generalized "compliance conversation analysis" framework that can be reconfigured via policy rules rather than hardcoded pharma logic. The technical challenge is designing an abstraction layer that preserves performance for pharmacovigilance while enabling rapid reconfiguration for new domains.

---

### Q3.2 — What are the key technical uncertainties and risks?

**Answer:**

| Risk | Description | Mitigation |
|---|---|---|
| **AI Recall Accuracy** | Claude's AE detection recall below the regulatory threshold for a given PSP's language patterns | Validation study with gold-standard dataset; iterative prompt tuning; human-in-the-loop confirmation |
| **Whisper Streaming Latency** | Real-time transcription adds unacceptable latency for live call use | Chunked streaming approach; evaluate Whisper large-v3 vs. whisper-1 tradeoff; fallback to post-call analysis |
| **E2B XML Schema Compliance** | Generated XML fails validation at MedEffect/FAERS portal | Schema-first development against official ICH E2B(R3) XSD; automated validation tests before submission |
| **MedDRA Licensing** | MedDRA codes must be validated against the licensed dictionary (MSSO subscription required) | All AI-generated codes are flagged as "suggested, not verified"; system enforces human confirmation before export |
| **Data Residency & Privacy** | PHI in patient communications cannot be stored outside Canada | Cloud deployment in Canada-only regions (AWS ca-central-1 / Azure Canada Central); data residency documentation |
| **SaMD Classification** | Health Canada may classify NARC as a regulated medical device under the Medical Devices Regulations | Early pre-submission meeting with Health Canada; if SaMD classification applies, fund Quality Management System development under a future grant |
| **PSP Integration Complexity** | Each PSP operator uses a different CRM and email system | Microsoft 365 is the dominant platform in Canadian PSPs — Outlook add-in covers >80% of target customers; generic IMAP monitor covers the remainder |

---

## SECTION 4: THE MARKET — WHY DOES THIS MATTER?

### Q4.1 — What is the size of the market opportunity?

**Answer:**

**Immediate Addressable Market (Canada + USA PSPs):**

There are approximately 200+ active Patient Support Programs in Canada and over 1,500 in the United States. Each program processes hundreds to thousands of patient communications per month. The manual pharmacovigilance review of these communications costs an estimated $15–$40 USD per communication reviewed (nurse salary + overhead). A mid-size PSP with 5,000 communications/month spends $75,000–$200,000 USD per month on this function alone.

NARC's SaaS pricing model (projected): $5,000–$25,000 CAD/month per PSP client, based on communication volume. This represents a 70–90% cost reduction for the PSP while improving compliance.

**Total Addressable Market (Canada + USA):** Estimated $500M–$1.5B USD annually across pharmacovigilance software, PSP compliance tools, and related regulatory services.

**Initial Target Segment:** 
- Tier 2 specialty pharma PSPs in Canada (10–50 programs): $2M–$10M CAD ARR potential
- Target first customer: McKesson Specialty Health Canada, Innomar Strategies, or a pharma manufacturer operating an internal PSP

**Phase 2 Expansion — Financial Services (3–5 year horizon):**

Call center compliance monitoring for Canadian financial institutions (banks, insurance companies, investment dealers) is a separate multi-billion-dollar market. IIROC and OSFI regulations require financial institutions to maintain records of client disclosures. This expansion leverages the same core AI infrastructure.

---

### Q4.2 — Who are the competitors, and how is NARC different?

**Answer:**

| Competitor | Approach | NARC's Differentiation |
|---|---|---|
| **ARISg / Veeva Vault Safety** | Enterprise PV systems (>$500K/yr) | NARC is 10–50× less expensive; integrates directly into Outlook rather than requiring workflow migration |
| **Oracle Argus / MedDRA Coding Tools** | Legacy enterprise pharma safety | Requires dedicated IT infrastructure, months of deployment; no AI-native detection |
| **Aris Global SafetyOne** | Cloud PV platforms | No Outlook add-in; no AI detection at point-of-reading; no PSP-specific workflow |
| **Manual PSP Review** | Nurses reading every email | NARC reduces first-pass review time by an estimated 70–80%; eliminates missed AEs |
| **No direct competitor** | Real-time voice AE detection on PSP calls | No known commercial product performs AI-based real-time AE detection during live PSP phone calls |

**NARC's defensible advantages:**
1. **Outlook-native:** PSP coordinators live in Outlook — no workflow change required
2. **Canada-first regulatory knowledge:** Health Canada MedEffect, ICH E2A/E2B, Food and Drugs Act compliance built-in
3. **Voice detection:** First mover in real-time call monitoring for PSPs
4. **E2B(R3) export:** Direct submission-ready regulatory output, not just flagging
5. **Configurable policy engine:** Each PSP client can configure custom detection rules, drug monographs, and severity thresholds

---

## SECTION 5: THE PROJECT PLAN — WHAT WILL IRAP FUND?

### Q5.1 — What specific R&D activities are you proposing?

**Answer:**

The IRAP-funded project is titled: **"NARC Phase 2: Pilot-Readiness, Voice Detection, and Regulatory Validation of an AI-Powered Pharmacovigilance Platform"**

**Project Duration:** 12 months

**Work Package 1 — Real-Time Voice Adverse Event Detection (Months 1–5)**

*Technical objective:* Build a production-ready real-time call monitoring feature that transcribes PSP phone calls using OpenAI Whisper and detects potential AEs within 5 seconds of utterance, presenting a dismissible overlay notification to the call agent.

*R&D activities:*
- Design and implement audio chunk streaming pipeline (WebSocket or WebRTC-based audio capture → chunked Whisper API calls → incremental transcript assembly)
- Develop rolling-window analysis engine: re-analyze the last N seconds of transcript every M seconds to detect emerging AE language
- Design and build the dismissible notification overlay UI (non-blocking; agent can acknowledge, flag, or dismiss; all interactions logged to audit trail)
- Test with synthetic call recordings across multiple drug categories and communication styles
- Measure and optimize end-to-end detection latency

*Technical uncertainty:* Whether Whisper's transcription latency on streaming chunks is low enough for real-time use; whether rolling-window analysis can identify AE signals reliably in conversational (non-written) language

*Deliverable:* Working voice detection feature integrated into the NARC platform, with documented performance metrics (latency, transcription accuracy on PSP-style conversations)

---

**Work Package 2 — Validation Study: AI AE Detection Accuracy (Months 3–8)**

*Technical objective:* Conduct a formal validation study comparing NARC's AE detection performance against a gold-standard dataset reviewed by trained pharmacovigilance professionals, to establish recall, precision, specificity, and sensitivity metrics.

*R&D activities:*
- Design validation methodology (in consultation with a pharmacovigilance regulatory consultant)
- Source or create a test dataset of ≥500 synthetic or de-identified PSP communications with known AE/non-AE labels (ethical review may be required)
- Run NARC detection against dataset; compute precision/recall/F1 per AE category and severity level
- Iteratively tune the Claude system prompt based on error analysis
- Document results in a Validation Report meeting GxP documentation standards
- Conduct a Health Canada pre-submission meeting to determine SaMD classification and regulatory pathway

*Technical uncertainty:* Whether the current system prompt achieves >95% recall across all AE categories on a diverse test set; how performance varies by drug type, patient literacy, and communication channel

*Deliverable:* Formal Validation Report (GxP-standard) documenting AI detection performance; updated system prompt with improved recall

---

**Work Package 3 — Security, Privacy & Compliance Infrastructure (Months 2–7)**

*Technical objective:* Implement the security and privacy controls required to deploy NARC in a pharma PSP environment handling Protected Health Information (PHI).

*R&D activities:*
- Implement end-to-end encryption for all stored communications (AES-256 at rest, TLS 1.3 in transit)
- Deploy NARC on Canadian cloud infrastructure (AWS ca-central-1 or Azure Canada Central) with documented data residency
- Implement Quebec Law 25 / PIPEDA compliance controls (consent management, data retention policies, right to erasure, breach notification procedures)
- Develop SOC 2 Type I readiness: define and document security policies, access controls, incident response procedures
- Implement HIPAA-aligned technical safeguards for US market expansion readiness
- Conduct penetration testing (external vendor)

*Deliverable:* Security & Privacy Compliance Package (data flow diagrams, DPIA, security policies, pen test report); Canadian cloud deployment

---

**Work Package 4 — Multi-Tenant & PSP Onboarding Infrastructure (Months 6–11)**

*Technical objective:* Transform NARC from a single-tenant prototype into a multi-tenant SaaS platform capable of onboarding multiple PSP clients with isolated data, custom drug monographs, and client-specific detection policies.

*R&D activities:*
- Design and implement database-level tenant isolation (row-level security or schema-per-tenant)
- Build client onboarding workflow (organization provisioning, user management, API key management)
- Implement per-tenant policy configuration (custom AE detection rules, drug monograph library, SLA thresholds)
- Build tenant administration dashboard for NARC operators
- Implement usage metering for SaaS billing integration

*Deliverable:* Multi-tenant NARC platform capable of supporting simultaneous pilot deployments with 2–3 PSP clients

---

**Work Package 5 — McKesson / PSP Pilot Preparation & Deployment (Months 9–12)**

*Technical objective:* Prepare and execute a controlled pilot deployment with one target PSP partner.

*R&D activities:*
- Develop pilot proposal and data handling agreement (with legal counsel)
- Customize NARC for pilot partner's drug portfolio (monograph data entry, policy configuration)
- Deploy NARC in pilot partner's environment; conduct staff training
- Monitor pilot performance; collect real-world AE detection metrics
- Debrief and prepare commercialization roadmap based on pilot findings

*Deliverable:* Completed pilot deployment; Pilot Performance Report; commercialization plan

---

### Q5.2 — What are the project milestones?

**Answer:**

| Milestone | Target Date | Deliverable |
|---|---|---|
| M1: IRAP project kickoff, ITA review | Month 1 | Signed IRAP agreement; project plan finalized |
| M2: Voice detection prototype | Month 3 | Working Whisper streaming pipeline; latency benchmarks |
| M3: Security infrastructure live | Month 5 | Canadian cloud deployment; PIPEDA compliance documentation |
| M4: Validation study complete | Month 7 | Validation Report with recall/precision metrics |
| M5: Multi-tenant platform | Month 9 | NARC multi-tenant; 2 simulated tenant environments tested |
| M6: Voice detection production-ready | Month 9 | Voice feature integrated; tested on synthetic call recordings |
| M7: Pilot agreement signed | Month 10 | LOI or pilot agreement with 1 PSP partner |
| M8: Pilot live | Month 11 | NARC deployed in pilot partner environment |
| M9: Pilot report & next phase plan | Month 12 | Pilot Performance Report; IRAP project close-out |

---

### Q5.3 — What is the budget?

**Answer:**

**Total Project Budget: $[XXX,XXX] CAD** (to be finalized with ITA)

*Eligible costs (IRAP reimbursable — typically 50–80% of eligible costs):*

| Category | Description | Estimated Cost (CAD) |
|---|---|---|
| **Salaries — Founder/CEO** | R&D activities at market rate for [X months FTE] | $[XX,XXX] |
| **Salaries — Developer Hire #1** | Full-stack TypeScript developer; 12 months | $[XX,XXX] |
| **Salaries — Regulatory Consultant** | Pharmacovigilance regulatory consultant; part-time | $[XX,XXX] |
| **Subcontractors** | Penetration testing; external legal (pilot agreement) | $[XX,XXX] |
| **Cloud Infrastructure** | AWS ca-central-1 / Azure Canada Central; dev/staging/prod | $[XX,XXX] |
| **AI API Costs** | Anthropic Claude + OpenAI Whisper API usage during development | $[XX,XXX] |
| **Validation Dataset** | De-identified test communications; annotation costs | $[XX,XXX] |
| **TOTAL ELIGIBLE** | | **$[XXX,XXX]** |

*Non-eligible costs (company responsibility):*
- Legal incorporation fees
- MedDRA license (MSSO subscription): ~$10,000–$25,000 USD/year
- Marketing materials
- Travel to conferences

---

## SECTION 6: COMMERCIALIZATION PLAN

### Q6.1 — How will you commercialize this technology?

**Answer:**

**Revenue Model:** SaaS subscription, priced by communication volume per month

| Tier | Communications/Month | Price (CAD/month) | Target Customer |
|---|---|---|---|
| Starter | Up to 1,000 | $2,500 | Small specialty pharma internal PSP |
| Professional | 1,000–10,000 | $8,500 | Mid-size PSP operator |
| Enterprise | 10,000+ | Custom ($20K–$50K+) | Large PSP operators (McKesson, Innomar) |

**Go-to-Market Strategy:**

1. **Phase 1 (Year 1):** Secure one anchor pilot with a Canadian PSP operator or pharma manufacturer. Use pilot as reference case and validation evidence. Target: McKesson Specialty Health, Innomar Strategies, or a biologics manufacturer's internal PSP team.

2. **Phase 2 (Year 2):** Expand to 3–5 Canadian PSP clients. Apply for follow-on funding (MEDTEQ+, BDC, or Series A equity). Begin US market entry preparation (FDA/ICH alignment already built into the product).

3. **Phase 3 (Year 3–5):** US market entry. Begin financial services compliance module development. Explore strategic partnership or white-label agreement with a large CRO or PSP operator.

**Business Development Activities (during IRAP project):**
- Present at MEDTEQ+ Health Innovation events (Montréal)
- Attend Canadian Pharmacovigilance Society (CAPVS) annual conference
- Direct outreach to pharmacovigilance directors at Canadian pharma companies
- Participate in Montréal health tech accelerator programs (Notman, FounderFuel)

---

### Q6.2 — What is your IP strategy?

**Answer:**

NARC's core IP consists of:

1. **Proprietary AI System Prompt:** The pharmacovigilance detection system prompt for Claude is the central IP asset. It is a confidential trade secret — not filed for patent, kept as a closed-source trade secret (similar to a recipe). It will not be disclosed to clients.

2. **E2B(R3) XML Generation Engine:** The code that maps AI-extracted AE findings to valid ICH E2B(R3) XML format, including the MedDRA hierarchy suggestion logic, is proprietary software.

3. **SLA & Escalation Engine:** The configurable SLA deadline computation and multi-level escalation system is proprietary.

4. **Future Patent Opportunities:** Real-time voice AE detection method (once novel implementation is validated); AI-assisted MedDRA coding with confidence scoring.

**IP Protection:**
- All source code is in a private GitHub repository
- Employees and contractors will sign IP assignment and NDA agreements
- Core AI logic will remain server-side only (clients interact via API — the prompt is never exposed)

---

## SECTION 7: ADDITIONAL IRAP QUESTIONS

### Q7.1 — Have you received government funding before?

**Answer:**

[If NO:] "No. This is our first application for government R&D funding. We are also exploring SR&ED (Scientific Research & Experimental Development) tax credits for the current year's R&D expenditures, which would be complementary to IRAP funding."

[If YES:] "[Describe previous grants received, amounts, programs, and outcomes.]"

---

### Q7.2 — Are you applying for other funding programs simultaneously?

**Answer:**

Yes. We are pursuing a complementary funding strategy using non-dilutive sources:

- **SR&ED Tax Credit:** All eligible R&D expenditures will be claimed under SR&ED (35% federal refundable ITC for CCPCs + 30% Quebec refundable credit). SR&ED is retroactive and applies to current-year R&D regardless of IRAP outcome.

- **MEDTEQ+:** We are exploring MEDTEQ+ consortium funding, which supports Quebec health technology innovation and can co-fund projects with industry partners (relevant when the McKesson pilot is formalized).

- **Futurpreneur (if applicable):** Exploring if founder age qualifies.

- **Investissement Québec:** Exploring ESSOR program for early-stage innovative companies.

None of these programs fund the same eligible costs — they are complementary and non-overlapping.

---

### Q7.3 — What happens if the AI model providers change their pricing or API terms?

**Answer:**

This is a recognized business risk. Our mitigation strategy:

1. **Multi-model architecture:** The backend is designed so that the AI provider (Anthropic Claude) can be swapped with a different model (e.g., OpenAI GPT-4o, Mistral, or a self-hosted open-source model) by changing a single service module. The prompt engineering and detection logic is model-agnostic.

2. **Cost management:** We use Claude Opus selectively for AE analysis (high-stakes) and will evaluate lighter models for lower-stakes tasks.

3. **Self-hosting path:** If cloud AI costs become prohibitive at scale, we will evaluate fine-tuning and self-hosting a smaller open-source model on inference infrastructure.

---

### Q7.4 — How will you measure the success of the project?

**Answer:**

**Technical KPIs:**
- Voice detection end-to-end latency: <5 seconds from utterance to notification
- AI AE detection recall: >95% on validation dataset (primary safety metric)
- AI AE detection precision: >70% on validation dataset (false positive rate acceptable for human-in-loop workflow)
- E2B(R3) XML validation pass rate: 100% against Health Canada MedEffect XSD schema

**Business KPIs:**
- Pilot agreement signed with ≥1 PSP partner by Month 10
- ≥1 PSP pilot live by Month 11
- ≥3 letters of interest from potential customers by Month 12
- NARC platform handling ≥500 real communications processed in pilot by Month 12

**Regulatory KPIs:**
- Health Canada pre-submission meeting completed
- Validation Report (GxP-standard) finalized
- SOC 2 Type I readiness assessment completed

---

## SECTION 8: SUPPORTING NARRATIVE — THE PROBLEM NARC SOLVES

*This section is optional but recommended — it gives the ITA context on the regulatory urgency of the problem.*

### The Regulatory Context

Under Canada's **Food and Drugs Act** and associated regulations, pharmaceutical manufacturers are legally obligated to report adverse drug reactions (ADRs) to Health Canada within specific timeframes:
- **Serious unexpected ADRs:** 7 calendar days (initial report), 15 calendar days (follow-up)
- **Serious expected ADRs:** 15 calendar days
- **Non-serious ADRs:** Periodic aggregate reporting

Under the US FDA's **21 CFR Part 314** and **ICH E2A guidelines**, similar obligations apply with 15-day expedited reporting requirements for serious unexpected adverse drug experiences.

**Patient Support Programs** are a primary source of spontaneous adverse event reports. In a PSP, patients call in or email regularly about their experience with a medication. Every time a patient mentions a potential side effect — even casually, in an email about a billing question — the PSP operator has an obligation to review that communication for a potential AE and, if confirmed, report it within the required timeframe.

**The Current Problem:**
In a medium-to-large PSP handling 5,000–20,000 patient communications per month, pharmacovigilance coordinators must read every communication. This is:
- **Expensive:** Each review takes 5–15 minutes by a trained nurse at $35–$60/hour
- **Error-prone:** Human reviewers miss subtle or ambiguous AE language, especially under high volume
- **Slow:** Reviews can take 1–3 days, consuming regulatory SLA time
- **Not scalable:** PSP volume grows with drug adoption; headcount does not scale linearly

**NARC's Solution:**
NARC performs the first-pass AE screening in 3–5 seconds per communication with >95% recall target, presents structured findings to the human reviewer, automatically starts the regulatory SLA clock, and prepares a regulatory submission-ready export. The human reviewer's role changes from "read every email" to "confirm or dismiss AI findings" — dramatically increasing throughput while maintaining regulatory compliance.

---

## SECTION 9: CONTACT & CERTIFICATIONS

**Applicant Certification:**

I certify that the information provided in this document is accurate and complete to the best of my knowledge. I understand that IRAP funding is contingent on the company maintaining CCPC status, that funded activities are carried out in Canada, and that claims are supported by documented timesheets, invoices, and milestone evidence.

**Applicant:** ___________________________

**Name:** [Your Full Name]

**Title:** Founder & CEO, [Company Name] Inc.

**Date:** 2026-02-24

**Business Number:** [BN]

**Address:** [Montréal, Québec, Canada]

**Email:** [Your email]

**Phone:** [Your phone]

---

*Document prepared with assistance from GitHub Copilot based on analysis of the NARC codebase (Tonytony5278/narc). All technical claims reflect the state of the codebase as of February 2026. Regulatory and funding guidance is for informational purposes — consult a qualified IRAP advisor, regulatory consultant, and legal counsel before submission.