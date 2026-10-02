# Remove Breadcrumb Span from Authentication Screen Header

This plan removes the selected breadcrumb label (`{authPageMeta.category} › {authPageMeta.title}`) from the top bar of the authentication view while keeping the "Return to Homepage" button intact.

## User Review & Critical Decisions

> [!NOTE]
> The selected element (`div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1)`) corresponds to the category/title breadcrumb `<span>` next to the "Return to Homepage" button on the Sign In / Register / Invite screen.

---

## 1. Overview & Core Concept

- **What It Does**: Removes the breadcrumb `<span>` element from the top navigation row of the authentication view for a cleaner header layout.
- **Target Audience / Persona**: School administrators, teachers, and staff signing in or registering on the authentication screen.
- **Key Value**: Declutters the top navigation area above the SchoolSphere brand header.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - When viewing the authentication screen, only the "Return to Homepage" button is displayed in the top action row above the SchoolSphere logo and title.
- **Visual Identity & Theme**:
  - Preserves existing spacing, typography, and button styling without extra breadcrumb text.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Targeted Element Removal**
  - *Chosen Approach*: Remove only the selected `<span>` element (`{authPageMeta.category} › {authPageMeta.title}`) inside the top header bar of the authentication screen.
  - *Why*: Adheres strictly to the Focus Mode selection without altering any surrounding layout or functionality.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────┐
│                  Authentication View Wrapper                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Top Bar (mb-4 flex items-center justify-between gap-2) │  │
│  │  • [Return to Homepage] Button (Kept)                  │  │
│  │  • Breadcrumb <span> (Removed)                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```
